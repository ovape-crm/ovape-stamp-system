import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import EmbeddedPostgres from "embedded-postgres";
import { initializeCostTestDb, master } from "./helpers/cost-db-fixture.mjs";

// Real, independent PostgreSQL connections; never connects to the application DB.
const run = promisify(execFile);
let directory,
  binaries,
  a,
  b,
  started = false;
const command = (file, args) =>
  run(file, args, { windowsHide: true, timeout: 30000 });
const query = async (client, sql, params = []) =>
  (await client.query(sql, params)).rows;

before(async () => {
  const platform = process.platform === "win32" ? "windows" : process.platform;
  binaries = await import(`@embedded-postgres/${platform}-${process.arch}`);
  directory = await mkdtemp(path.join(tmpdir(), "ovape-cost-concurrency-"));
  const socket = net.createServer();
  await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  await command(binaries.initdb, [
    "-D",
    directory,
    "-U",
    "postgres",
    "-A",
    "trust",
    "--locale=C",
    "--encoding=UTF8",
  ]);
  await command(binaries.pg_ctl, [
    "-D",
    directory,
    "-l",
    path.join(directory, "server.log"),
    "-o",
    `-p ${port} -h 127.0.0.1`,
    "-w",
    "start",
  ]);
  started = true;
  const cluster = new EmbeddedPostgres({
    databaseDir: directory,
    port,
    user: "postgres",
    persistent: true,
  });
  a = cluster.getPgClient("postgres", "127.0.0.1");
  b = cluster.getPgClient("postgres", "127.0.0.1");
  await a.connect();
  await b.connect();
  await initializeCostTestDb({
    exec: (sql) => a.query(sql),
    query: (sql, args) => a.query(sql, args),
  });
  for (const client of [a, b]) {
    await client.query("select set_config('request.jwt.claim.sub',$1,false)", [
      master,
    ]);
    await client.query("set statement_timeout='10s'");
  }
});

after(async () => {
  await Promise.all([a?.end(), b?.end()]);
  if (started)
    await command(binaries.pg_ctl, [
      "-D",
      directory,
      "-m",
      "fast",
      "-w",
      "stop",
    ]);
  // Only remove the exact unique temporary cluster created by this test.
  if (
    directory &&
    path.dirname(path.resolve(directory)) === path.resolve(tmpdir()) &&
    path.basename(directory).startsWith("ovape-cost-concurrency-")
  ) {
    await rm(directory, { recursive: true, force: true });
  }
});

async function seed(name) {
  await a.query(
    "insert into inventory_balances(item_name,quantity) values ($1,3)",
    [name],
  );
  const [event] = await query(
    a,
    `insert into inventory_cost_events(event_type,event_at,item_name,direction,quantity,total_cost,reference_type,reference_id)
    values ('purchase_in','2026-08-01',$1,'in',3,300,'test',$1) returning id`,
    [name],
  );
  await a.query(
    `insert into inventory_cost_layers(source_event_id,item_name,original_quantity,remaining_quantity,unit_cost,cost_status,queue_sequence)
    values ($1,$2,3,3,100,'confirmed',1)`,
    [event.id, name],
  );
}
const allocate = (client, name, ref) =>
  client.query(
    "select allocate_inventory_cost_fifo('sale_out','2026-08-03',null,$1,2,'stamp_log',$2,'1','sale_cogs','{}') id",
    [name, ref],
  );

async function waitForLock(client) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const [state] = await query(
      a,
      "select wait_event_type from pg_stat_activity where pid=$1",
      [client.processID],
    );
    if (state?.wait_event_type === "Lock") return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail("The second session did not wait for a database lock");
}

test("동시 출고가 같은 잔여 원가층을 이중 차감하지 않는다", async () => {
  await seed("동시출고");
  await a.query("begin");
  let pending;
  try {
    await allocate(a, "동시출고", "101");
    pending = allocate(b, "동시출고", "102").then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    await waitForLock(b);
    await a.query("commit");
    const result = await pending;
    assert.ok(
      result.error,
      "Second outbound must fail when only one unit remains",
    );
    assert.deepEqual(
      await query(
        a,
        "select remaining_quantity from inventory_cost_layers where item_name='동시출고'",
      ),
      [{ remaining_quantity: 1 }],
    );
    const [totals] = await query(
      a,
      "select count(*)::int count,sum(quantity)::int quantity,sum(total_cost)::int cost from inventory_cost_events where item_name='동시출고' and direction='out'",
    );
    assert.deepEqual(totals, { count: 1, quantity: 2, cost: 200 });
    // The allocator manages costs only, so physical stock must remain untouched.
    assert.equal(
      (
        await query(
          a,
          "select quantity from inventory_balances where item_name='동시출고'",
        )
      )[0].quantity,
      3,
    );
  } finally {
    await a.query("rollback");
    if (pending) await pending;
  }
});

test("두 서비스가 같은 소진 수량을 동시에 연결하면 두 번째 요청을 차단한다", async () => {
  await seed("동시연결");
  await allocate(a, "동시연결", "501");
  await a.query(
    "update inventory_cost_events set event_type='reconciliation_out',reference_type='cost_reconciliation',settlement_effect='none' where item_name='동시연결' and direction='out'",
  );
  await a.query("alter table logs disable trigger user");
  await a.query(`insert into logs(id,category,created_at,jsonb) values
    (501,'stamp','2026-08-02','{"items":[{"itemName":"동시연결","quantity":2,"remark":"서비스"}]}'),
    (502,'stamp','2026-08-02','{"items":[{"itemName":"동시연결","quantity":2,"remark":"서비스"}]}')`);
  await a.query("alter table logs enable trigger user");
  const [{ context: first }] = await query(
    a,
    "select get_service_cost_link_context(501,1) context",
  );
  const [{ context: second }] = await query(
    b,
    "select get_service_cost_link_context(502,1) context",
  );
  const links = JSON.stringify([
    { allocation_id: first.candidates[0].allocation_id, quantity: 2 },
  ]);
  const sql = "select save_service_cost_links($1,1,$2,$3,'동시 연결 검증')";
  await a.query("begin");
  let pending;
  try {
    await a.query(sql, [501, first.snapshot, links]);
    pending = b.query(sql, [502, second.snapshot, links]).then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    await waitForLock(b);
    await a.query("commit");
    assert.match((await pending).error?.message ?? "", /원본이 변경/);
    assert.equal(
      (
        await query(
          a,
          "select sum(quantity)::int quantity from inventory_service_cost_links where log_id in (501,502)",
        )
      )[0].quantity,
      2,
    );
    assert.equal(
      (
        await query(
          a,
          "select remaining_quantity from inventory_cost_layers where item_name='동시연결'",
        )
      )[0].remaining_quantity,
      1,
    );
  } finally {
    await a.query("rollback");
    if (pending) await pending;
  }
});

test("같은 승인 건을 동시에 적용해도 한 번만 반영한다", async () => {
  await seed("동시적용");
  await allocate(a, "동시적용", "201");
  const [{ id: earlierEvent }] = await query(
    a,
    `insert into inventory_cost_events(event_type,event_at,item_name,direction,quantity,total_cost,reference_type,reference_id)
    values ('purchase_in','2026-07-01','동시적용','in',3,150,'test','earlier') returning id`,
  );
  await a.query(
    `insert into inventory_cost_layers(source_event_id,item_name,original_quantity,remaining_quantity,unit_cost,cost_status,queue_sequence)
    values ($1,'동시적용',3,3,50,'confirmed',0)`,
    [earlierEvent],
  );
  await a.query(
    "update inventory_balances set quantity=4 where item_name='동시적용'",
  );
  const [{ id }] = await query(
    a,
    "select preview_inventory_cost_reassignment('동시적용','2026-08-03','동시성 테스트') id",
  );
  await a.query("select approve_inventory_cost_reassignment($1)", [id]);
  await a.query("begin");
  let pending;
  try {
    await a.query("select apply_inventory_cost_reassignment($1)", [id]);
    pending = b
      .query("select apply_inventory_cost_reassignment($1)", [id])
      .then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
    await waitForLock(b);
    await a.query("commit");
    assert.ok(
      (await pending).error,
      "The already-applied run must be rejected",
    );
    assert.equal(
      (
        await query(
          a,
          "select status from inventory_cost_reassignment_runs where id=$1",
          [id],
        )
      )[0].status,
      "applied",
    );
    assert.equal(
      (
        await query(
          a,
          "select quantity from inventory_balances where item_name='동시적용'",
        )
      )[0].quantity,
      4,
    );
    assert.equal(
      (
        await query(
          a,
          "select remaining_quantity from inventory_cost_layers where item_name='동시적용' order by queue_sequence",
        )
      )[0].remaining_quantity,
      1,
    );
    assert.equal(
      (
        await query(
          a,
          "select total_cost from inventory_cost_events where item_name='동시적용' and direction='out'",
        )
      )[0].total_cost,
      100,
    );
  } finally {
    await a.query("rollback");
    if (pending) await pending;
  }
});
