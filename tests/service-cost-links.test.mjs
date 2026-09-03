import assert from "node:assert/strict";
import { before, after, beforeEach, afterEach, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { initializeCostTestDb } from "./helpers/cost-db-fixture.mjs";

const db = new PGlite();
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
before(async () => initializeCostTestDb(db));
after(async () => db.close());
beforeEach(async () => {
  await db.exec("begin");
  // Historical rows predate live cost triggers. Disable ONLY in the isolated test DB.
  await db.exec("alter table logs disable trigger user");
  await db.query(`insert into logs(id,category,created_at,jsonb) values
    (901,'stamp','2026-08-20','{"items":[{"itemName":"연결품목","quantity":2,"remark":"서비스"}]}'),
    (902,'stamp','2026-08-21','{"items":[{"itemName":"연결품목","quantity":2,"remark":"서비스"}]}')`);
  await db.exec("alter table logs enable trigger user");
  await db.query(
    "insert into inventory_balances(item_name,quantity) values ('연결품목',0)",
  );
});
afterEach(async () => db.exec("rollback"));
async function source({
  name = "연결품목",
  at = "2026-08-01",
  price = 100,
  qty = 3,
  restored = false,
} = {}) {
  const [{ id: incoming }] = await q(
    `insert into inventory_cost_events(event_type,event_at,item_name,direction,quantity,total_cost,reference_type,reference_id)
    values ('purchase_in',$1,$2,'in',$3,$4,'test',gen_random_uuid()::text) returning id`,
    [at, name, qty, price === null ? null : price * qty],
  );
  const [{ id: layer }] = await q(
    `insert into inventory_cost_layers(source_event_id,item_name,original_quantity,remaining_quantity,unit_cost,cost_status,queue_sequence)
    values ($1,$2,$3,0,$4,$5,1) returning id`,
    [incoming, name, qty, price, price === null ? "pending" : "confirmed"],
  );
  const [{ id: out }] = await q(
    `insert into inventory_cost_events(event_type,event_at,item_name,direction,quantity,total_cost,reference_type,reference_id,metadata)
    values ('reconciliation_out','2026-09-03',$1,'out',$2,$3,'cost_reconciliation',gen_random_uuid()::text,$4) returning id`,
    [
      name,
      qty,
      price === null ? null : price * qty,
      JSON.stringify(
        restored ? { restoredAt: "2026-09-03" } : { note: "확인한 소진" },
      ),
    ],
  );
  const [{ id }] = await q(
    "insert into inventory_cost_allocations(outbound_event_id,source_layer_id,quantity,unit_cost) values ($1,$2,$3,$4) returning id",
    [out, layer, qty, price],
  );
  return { id, layer, out };
}
const context = async (log = 901) =>
  (await q("select get_service_cost_link_context($1,1) data", [log]))[0].data;
const save = async (ctx, links) =>
  db.query("select save_service_cost_links($1,1,$2,$3,'전표 및 소진 확인')", [
    ctx.log_id,
    ctx.snapshot,
    JSON.stringify(links),
  ]);
const link = (id, quantity = 2) => ({ allocation_id: id, quantity });
async function ledger() {
  const result = {};
  for (const table of [
    "inventory_balances",
    "inventory_cost_events",
    "inventory_cost_layers",
    "inventory_cost_allocations",
  ])
    result[table] = await q(`select * from ${table} order by 1`);
  return result;
}

test("앞뒤 원가와 실제 입고일·단가·기존 소진 가능 수량을 보여준다", async () => {
  await source();
  const c = await context();
  assert.deepEqual(
    c.nearby.map((x) => x.position),
    ["before", "after"],
  );
  assert.equal(c.candidates[0].unit_cost, 100);
  assert.equal(c.candidates[0].available_quantity, 3);
  assert.equal(c.candidates[0].eligible, true);
});
test("서비스 연결은 실재고·원가층·기존 원가총액을 전혀 변경하지 않는다", async () => {
  const s = await source();
  const before = await ledger();
  await save(await context(), [link(s.id)]);
  assert.deepEqual(await ledger(), before);
  assert.equal((await context()).candidates[0].linked_quantity, 2);
  const report = (
    await q("select get_inventory_cost_integrity_report(100) data")
  )[0].data;
  assert.equal(report.missingServiceCount, 1);
  assert.equal(report.serviceReviewCount, 2);
  assert.equal(
    (
      await q("select count(*)::int n from inventory_service_cost_link_audit")
    )[0].n,
    1,
  );
});
test("연결 수정·해제와 변경 전후 단가 이력을 보존한다", async () => {
  const a = await source();
  const b = await source({ price: 200 });
  const before = await ledger();
  await save(await context(), [link(a.id)]);
  await save(await context(), [link(b.id)]);
  const h = (await context()).history;
  assert.equal(h.length, 2);
  assert.ok(
    h.some(
      (x) =>
        x.before_links[0]?.unit_cost === 100 &&
        x.after_links[0]?.unit_cost === 200,
    ),
  );
  await save(await context(), []);
  assert.equal(
    (await q("select count(*)::int n from inventory_service_cost_links"))[0].n,
    0,
  );
  assert.deepEqual(await ledger(), before);
});
test("여러 소진 원가층을 나눠 연결할 수 있다", async () => {
  const a = await source({ qty: 1 });
  const b = await source({ qty: 1, price: 200 });
  await save(await context(), [link(a.id, 1), link(b.id, 1)]);
  assert.equal(
    (
      await q("select sum(quantity)::int n from inventory_service_cost_links")
    )[0].n,
    2,
  );
});
test("다른 출고에 연결한 소진 수량은 재사용하지 못한다", async () => {
  const a = await source();
  await save(await context(), [link(a.id)]);
  assert.equal((await context(902)).candidates[0].available_quantity, 1);
  await assert.rejects(
    save(await context(902), [link(a.id)]),
    /연결 가능 수량/,
  );
});
test("조회 이후 다른 연결이 생기면 오래된 미리보기 적용을 차단한다", async () => {
  const a = await source();
  const stale = await context(902);
  await save(await context(), [link(a.id)]);
  await assert.rejects(save(stale, [link(a.id)]), /원본이 변경/);
});
test("출고일 이후 입고층을 연결하지 못한다", async () => {
  const a = await source({ at: "2026-09-01" });
  assert.equal((await context()).candidates[0].eligible, false);
  await assert.rejects(save(await context(), [link(a.id)]), /입고일/);
});
test("다른 품목 소진은 연결할 수 없다", async () => {
  const a = await source({ name: "다른품목" });
  await assert.rejects(save(await context(), [link(a.id)]), /입고일/);
});
test("원복된 소진은 후보에서 제외한다", async () => {
  await source({ restored: true });
  assert.equal((await context()).candidates.length, 0);
});
test("서비스 수량과 다른 배정은 저장하지 않는다", async () => {
  const a = await source();
  await assert.rejects(save(await context(), [link(a.id, 1)]), /수량은 서비스/);
});
test("동일 소진 행 중복 선택을 차단한다", async () => {
  const a = await source();
  await assert.rejects(
    save(await context(), [link(a.id, 1), link(a.id, 1)]),
    /중복/,
  );
});
test("연결된 출고의 수량 변경을 차단한다", async () => {
  const a = await source();
  await save(await context(), [link(a.id)]);
  await assert.rejects(
    db.query(
      "update logs set jsonb=jsonb_set(jsonb,'{items,0,quantity}','3') where id=901",
    ),
    /연결을 먼저 해제/,
  );
});
test("연결된 소진의 원가 수정과 원복을 차단한다", async () => {
  const a = await source();
  await save(await context(), [link(a.id)]);
  await assert.rejects(
    db.query(
      'update inventory_cost_events set metadata=metadata||\'{"restoredAt":"2026-09-03"}\' where id=$1',
      [a.out],
    ),
    /연결된 소진/,
  );
});
test("결제 메모 수정으로 서비스 원가가 다시 차감되지 않는다", async () => {
  const a = await source();
  await save(await context(), [link(a.id)]);
  const before = await ledger();
  await db.query(
    'update logs set jsonb=jsonb||\'{"paymentMemo":"정정"}\' where id=901',
  );
  assert.deepEqual(await ledger(), before);
});
test("연결된 서비스 원가는 재고변동에서 보이고 미확정은 0원이 되지 않는다", async () => {
  const a = await source({ price: null });
  await save(await context(), [link(a.id)]);
  const [{ id }] = await q(
    "insert into inventory_movements(item_name,quantity_delta,reference_type,reference_id,unit_price) values ('연결품목',-2,'outbound_log','901',0) returning id",
  );
  const result = (
    await q("select get_inventory_movement_unit_prices(array[$1::uuid]) data", [
      id,
    ])
  )[0].data;
  assert.equal(result[id], null);
});
test("일반 직원은 원가 문맥 조회와 연결 수정을 할 수 없다", async () => {
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  await assert.rejects(context(), /MASTER_REQUIRED/);
});
