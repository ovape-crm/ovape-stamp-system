import assert from "node:assert/strict";
import { before, after, beforeEach, afterEach, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { initializeCostTestDb } from "./helpers/cost-db-fixture.mjs";
const db = new PGlite();
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
before(async () => initializeCostTestDb(db));
after(async () => db.close());
beforeEach(async () => db.exec("begin"));
afterEach(async () => db.exec("rollback"));
const addLog = (id = 901, qty = 1) => q(`insert into logs(id,category,created_at,jsonb)
 values($1,'stamp','2026-08-01',jsonb_build_object('items',jsonb_build_array(jsonb_build_object('itemName','임시층검증','quantity',$2::integer,'remark',''))))`, [id, qty]);
const layers = () => q("select * from inventory_cost_layers order by id");
const tempSource = (ref = "901", qty = 2) => q(`select create_inventory_cost_layer('opening','2026-07-01',null,'임시층검증',$1,null,'pending','back','cost_missing',$2,'1',null,'{"reason":"live cost missing"}')`, [qty, ref]);

test("출고 삭제는 생성한 미사용 임시층도 제거하며 원본 스냅샷을 보존한다", async () => {
  await addLog();
  assert.equal((await layers()).length, 1);
  await q("delete from logs where id=901");
  assert.equal((await layers()).length, 0);
  assert.equal((await q("select * from inventory_cost_allocations")).length, 0);
  const [audit] = await q("select * from inventory_cost_cleanup_audit");
  assert.equal(audit.trigger_log_id, 901);
  assert.equal(audit.snapshot.layer.remaining_quantity, 1);
  assert.equal(audit.snapshot.source_event.reference_id, "901");
});
test("출고 수량 수정은 이전 임시층을 제거하고 새 필요 수량만 만든다", async () => {
  await addLog();
  const old = (await layers())[0].id;
  await q(`update logs set jsonb=jsonb_set(jsonb,'{items,0,quantity}','3') where id=901`);
  const current = await layers();
  assert.equal(current.length, 1);
  assert.notEqual(current[0].id, old);
  assert.equal(current[0].original_quantity, 3);
  assert.equal(current[0].remaining_quantity, 0);
});
test("다른 출고가 사용하는 임시층은 보존하고 마지막 출고도 취소되면 정리한다", async () => {
  await tempSource();
  await addLog(901);
  await addLog(902);
  const id = (await layers())[0].id;
  await q("delete from logs where id=901");
  assert.equal((await layers())[0].id, id);
  assert.equal((await layers())[0].remaining_quantity, 1);
  assert.equal((await q("select * from inventory_cost_cleanup_audit")).length, 0);
  await q("delete from logs where id=902");
  assert.equal((await layers()).length, 0);
});
test("수동 소진에 연결된 임시층은 자동 삭제하지 않는다", async () => {
  await tempSource();
  await addLog();
  await q(`select allocate_inventory_cost_fifo('reconciliation_out','2026-08-02',null,'임시층검증',1,'cost_reconciliation','test','1','none','{}')`);
  await q("delete from logs where id=901");
  assert.equal((await layers()).length, 1);
  assert.equal((await layers())[0].remaining_quantity, 1);
});
test("일반 기초재고 원가층과 확정 단가는 자동 정리하지 않는다", async () => {
  await q(`select create_inventory_cost_layer('opening','2026-07-01',null,'임시층검증',2,500,'confirmed','back','test','source','1',null,'{}')`);
  await addLog();
  await q("delete from logs where id=901");
  assert.equal((await layers())[0].remaining_quantity, 2);
  assert.equal((await layers())[0].unit_cost, 500);
});
test("결제 메모 수정은 임시층과 기존 배정을 건드리지 않는다", async () => {
  await addLog();
  const before = await layers();
  await q(`update logs set jsonb=jsonb||'{"memo":"결제 메모"}'::jsonb where id=901`);
  assert.deepEqual(await layers(), before);
});
test("정리 중 오류가 나면 로그 삭제와 원가 복원이 함께 롤백된다", async () => {
  await addLog();
  const before = await layers();
  await db.exec(`create function reject_cleanup_test() returns trigger language plpgsql as $$ begin raise exception 'cleanup test failure'; end $$;
    create trigger reject_cleanup_test before insert on inventory_cost_cleanup_audit for each row execute function reject_cleanup_test(); savepoint fail`);
  await assert.rejects(q("delete from logs where id=901"), /cleanup test failure/);
  await db.exec("rollback to fail");
  assert.deepEqual(await layers(), before);
  assert.equal((await q("select * from logs where id=901")).length, 1);
  assert.equal((await q("select * from inventory_cost_allocations")).length, 1);
});
