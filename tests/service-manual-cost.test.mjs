import assert from "node:assert/strict";
import { before, after, beforeEach, afterEach, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { initializeCostTestDb } from "./helpers/cost-db-fixture.mjs";

const db = new PGlite();
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
before(async () => {
  await initializeCostTestDb(db);
});
after(async () => db.close());
beforeEach(async () => {
  await db.exec("begin; alter table logs disable trigger user");
  await db.query(`insert into logs(id,category,jsonb) values
    (901,'stamp','{"items":[{"itemName":"수동품목","quantity":2,"remark":"서비스"}]}'),
    (902,'stamp','{"items":[{"itemName":"수동품목","quantity":1,"remark":"서비스"}]}')`);
  await db.exec("alter table logs enable trigger user");
});
afterEach(async () => db.exec("rollback"));
const entry = async (id = 901) => (await q("select get_service_cost_entry($1,1) data", [id]))[0].data;
const save = (ctx, price, note = "입고 전표 확인") => db.query("select save_service_manual_cost($1,1,$2,$3,$4)", [ctx.log_id, ctx.snapshot, price, note]);
async function ledger() {
  const result = {};
  for (const table of ["inventory_balances", "inventory_cost_layers", "inventory_cost_events", "inventory_cost_allocations", "inventory_service_cost_links"])
    result[table] = await q(`select * from ${table} order by 1`);
  return result;
}
async function allocated() {
  await db.query(`select create_inventory_cost_layer('opening',now()-interval '1 day',null,'수동품목',2,100,'confirmed','back','test','901','',null,'{}')`);
  await db.query(`select allocate_inventory_cost_fifo('service_out',now(),null,'수동품목',2,'stamp_log','901','1','none','{}')`);
}
test("미배정과 배정 완료 항목 모두 입력·수정·취소하고 재고 및 FIFO 원본은 보존한다", async () => {
  const initial = await ledger();
  await save(await entry(), 300);
  assert.equal((await entry()).total_cost, 600);
  await save(await entry(), 400);
  assert.equal((await entry()).total_cost, 800);
  await save(await entry(), null);
  assert.equal((await entry()).total_cost, null);
  assert.deepEqual(await ledger(), initial);
  await allocated();
  const before = await ledger();
  await save(await entry(), 500);
  assert.equal((await entry()).total_cost, 1000);
  assert.equal((await entry()).allocated_cost, 200);
  await save(await entry(), null);
  assert.equal((await entry()).total_cost, 200);
  assert.deepEqual(await ledger(), before);
  assert.equal((await entry()).history.length, 5);
  assert.equal((await q("select get_service_cost_entries(10) data"))[0].data.count, 2);
});
test("0원은 미입력과 구분하고 오래된 저장 요청은 차단한다", async () => {
  const stale = await entry();
  await save(stale, 0);
  assert.equal((await entry()).total_cost, 0);
  assert.equal((await entry()).source, "manual");
  await db.exec("savepoint stale");
  await assert.rejects(save(stale, 300), /다시 조회/);
  await db.exec("rollback to stale");
  assert.equal((await entry()).total_cost, 0);
});
test("음수·합계 초과·사유 누락·일반 권한은 서버에서 거부한다", async () => {
  for (const [price, note] of [[-1,"근거 확인"],[2147483647,"근거 확인"],[300,""]]) {
    const ctx = await entry();
    await db.exec("savepoint invalid");
    await assert.rejects(save(ctx, price, note));
    await db.exec("rollback to invalid");
  }
  const ctx = await entry();
  await db.exec("savepoint auth");
  await db.query("select set_config('request.jwt.claim.sub','',true)");
  await assert.rejects(save(ctx, 100), /MASTER_REQUIRED/);
  await db.exec("rollback to auth");
});
test("출고 원본 변경은 입력 취소 전 차단한다", async () => {
  await save(await entry(), 300);
  await db.exec("savepoint edit");
  await assert.rejects(db.query("delete from logs where id=901"), /먼저 취소/);
  await db.exec("rollback to edit");
});
test("변동 단가는 직접 입력을 우선 사용하며 기존 배정과 이중 합산하지 않는다", async () => {
  await allocated();
  const [{ id }] = await q(`insert into inventory_movements(item_name,quantity_delta,reference_type,reference_id,inventory_action)
    values('수동품목',-2,'outbound_log','901','out') returning id`);
  await save(await entry(), 300);
  const data = (await q("select get_inventory_movement_unit_prices(array[$1::uuid]) data", [id]))[0].data;
  assert.equal(data[id], 300);
  await save(await entry(), null);
  assert.equal((await q("select get_inventory_movement_unit_prices(array[$1::uuid]) data", [id]))[0].data[id], 100);
});
test("직접 원가 입력 후 결제 메모 수정은 과거 서비스를 다시 차감하지 않는다", async () => {
  await save(await entry(), 300);
  const before = await ledger();
  await db.query(`update logs set jsonb=jsonb || '{"paymentMemo":"메모 수정"}'::jsonb where id=901`);
  assert.deepEqual(await ledger(), before);
  assert.equal((await entry()).total_cost, 600);
});
test("소진 연결에 직접 입력해도 소진 기록과 배정 금액을 이중 합산하지 않는다", async () => {
  const [{ id: source }] = await q(`select create_inventory_cost_layer('opening',now()-interval '1 day',null,'수동품목',2,100,'confirmed','back','test','linked','',null,'{}') id`);
  await q(`select allocate_inventory_cost_fifo('reconciliation_out',now(),null,'수동품목',2,'cost_reconciliation','test','1','none','{}')`);
  const [{ id }] = await q(`select a.id from inventory_cost_allocations a join inventory_cost_layers l on l.id=a.source_layer_id where l.source_event_id=$1`, [source]);
  await q("insert into inventory_service_cost_links values (901,1,$1,2)", [id]);
  const before = await ledger();
  await save(await entry(), 300);
  assert.equal((await entry()).total_cost, 600);
  assert.equal((await entry()).linked_cost, 200);
  assert.deepEqual(await ledger(), before);
  const [{ id: movement }] = await q(`insert into inventory_movements(item_name,quantity_delta,reference_type,reference_id,inventory_action) values('수동품목',-2,'outbound_log','901','out') returning id`);
  assert.equal((await q("select get_inventory_movement_unit_prices(array[$1::uuid]) data", [movement]))[0].data[movement], 300);
});
const markReviewed = (kind = "historical_manual") => db.query(`insert into inventory_service_cost_reviews
 (log_id,line_index,kind,note,reviewed_input,cost_snapshot,reviewed_by)
 values(901,1,$1,'과거 서비스 대사 완료','{}','test',auth.uid())`, [kind]);
const posted = () => q("select * from inventory_cost_reporting_events where reference_type='manual_service_cost'");
test("점검 목록은 해결된 건을 제외한 뒤 페이지와 건수를 계산하고 취소 시 다시 표시한다", async () => {
  const attention = async () => (await q("select get_service_cost_attention(1) data"))[0].data;
  assert.equal((await attention()).count, 2);
  await save(await entry(), 0);
  assert.equal((await attention()).count, 2);
  await markReviewed("historical_manual");
  assert.equal((await attention()).count, 1);
  assert.equal((await attention()).rows[0].log_id, "902");
  await q("update inventory_service_cost_reviews set kind='offset_review' where log_id=901");
  assert.equal((await attention()).count, 2);
  await q("update inventory_service_cost_reviews set kind='current_manual' where log_id=901");
  assert.equal((await attention()).count, 1);
  await save(await entry(), null);
  assert.equal((await attention()).count, 2);
  await allocated();
  assert.equal((await attention()).count, 1);
  await db.exec("create or replace function public.is_inventory_item_tracked(text) returns boolean language sql stable as $$ select false $$");
  assert.deepEqual(await attention(), { count: 0, rows: [] });
});
test("재고 미관리 품목은 자동 0원이며 입력·원장·미입력 목록에서 제외하고 원본은 보존한다", async () => {
  await save(await entry(), 300);
  await markReviewed("untracked_manual");
  const before = await ledger();
  await db.exec("create or replace function public.is_inventory_item_tracked(text) returns boolean language sql stable as $$ select false $$");
  const excluded = await entry();
  assert.equal(excluded.is_tracked, false);
  assert.equal(excluded.source, "untracked");
  assert.equal(excluded.total_cost, 0);
  assert.equal((await q("select get_service_cost_entries(100) data"))[0].data.count, 0);
  assert.equal((await posted()).length, 0);
  const [{ id: movement }] = await q(`insert into inventory_movements(item_name,quantity_delta,unit_price,reference_type,reference_id,inventory_action)
    values('수동품목',-2,999,'outbound_log','901','out') returning id`);
  assert.equal((await q("select get_inventory_movement_unit_prices(array[$1::uuid]) data", [movement]))[0].data[movement], 0);
  for (const price of [0,300]) {
    await db.exec("savepoint excluded");
    await assert.rejects(save(excluded, price), /재고 미관리/);
    await db.exec("rollback to excluded");
  }
  assert.deepEqual(await ledger(), before);
  await save(await entry(), null, "재고 미관리 원가 대상 제외");
  assert.equal((await entry()).manual, null);
  assert.equal((await entry()).total_cost, 0);
  assert.ok((await entry()).history.some((h) => h.note === "재고 미관리 원가 대상 제외"));
});
test("대사된 수동 원가는 원장에 한 번 표시되고 수정·취소가 일치한다", async () => {
  await save(await entry(), 300);
  const before = await ledger();
  const oldEntry = await entry();
  await markReviewed();
  assert.notEqual((await entry()).snapshot, oldEntry.snapshot);
  assert.equal((await entry()).review.kind, "historical_manual");
  assert.equal((await posted()).length, 1);
  assert.equal((await posted())[0].total_cost, 600);
  assert.equal((await posted())[0].metadata.monetaryOnly, true);
  assert.deepEqual(await ledger(), before);
  await save(await entry(), 400);
  assert.equal((await posted())[0].total_cost, 800);
  await save(await entry(), null);
  assert.equal((await posted()).length, 0);
  assert.deepEqual(await ledger(), before);
  assert.ok((await entry()).history.some((h) => h.before_cost.review?.kind === "historical_manual" && h.after_cost.total_cost === null));
});
test("상쇄 여부가 불명확한 수동 확정 원가는 원장에 추가하지 않는다", async () => {
  await save(await entry(), 300);
  await markReviewed("offset_review");
  assert.equal((await entry()).total_cost, 600);
  assert.equal((await entry()).review.kind, "offset_review");
  assert.equal((await posted()).length, 0);
});
test("실제 배정 기록이 있는 경우 수동 원장 항목을 중복 생성하지 않는다", async () => {
  await allocated();
  await save(await entry(), 300);
  await markReviewed();
  assert.equal((await posted()).length, 0);
  assert.equal((await q("select count(*)::int n from inventory_cost_reporting_events where event_type='service_out'"))[0].n, 1);
});
test("서비스 일부를 기존 소진에서 옮기면 원장 합계는 차액만 증가하고 재고와 FIFO는 그대로다", async () => {
  await q(`select create_inventory_cost_layer('opening',now()-interval '1 day',null,'수동품목',1,100,'confirmed','back','test','partial','',null,'{}')`);
  const [{ id: out }] = await q(`select allocate_inventory_cost_fifo('reconciliation_out',now(),null,'수동품목',1,'cost_reconciliation','partial','1','none','{}') id`);
  const [{ id }] = await q("select id from inventory_cost_allocations where outbound_event_id=$1", [out]);
  await q("insert into inventory_service_cost_links values(901,1,$1,1)", [id]);
  await save(await entry(), 100);
  const before = await ledger();
  await markReviewed("current_manual");
  assert.equal((await posted())[0].total_cost, 200);
  const original = (await q("select * from inventory_cost_reporting_events where id=$1", [out]))[0];
  assert.equal(original.total_cost, 0);
  assert.equal(original.metadata.originalConsumedCost, 100);
  assert.equal(original.metadata.serviceAttributedCost, 100);
  assert.equal((await q("select sum(total_cost)::int total from inventory_cost_reporting_events where direction='out'"))[0].total, 200);
  assert.deepEqual(await ledger(), before);
  await db.exec("savepoint guard");
  await assert.rejects(q("delete from inventory_service_cost_links where log_id=901"), /먼저 취소/);
  await db.exec("rollback to guard");
  await save(await entry(), 200);
  assert.equal((await posted())[0].total_cost, 400);
  assert.equal((await q("select total_cost from inventory_cost_reporting_events where id=$1", [out]))[0].total_cost, 0);
  await save(await entry(), null);
  assert.equal((await posted()).length, 0);
  assert.equal((await q("select total_cost from inventory_cost_reporting_events where id=$1", [out]))[0].total_cost, 100);
  assert.deepEqual(await ledger(), before);
});
