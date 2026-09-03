import assert from "node:assert/strict";
import { before, after, beforeEach, afterEach, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { initializeCostTestDb, master } from "./helpers/cost-db-fixture.mjs";
const db = new PGlite();
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
before(async () => {
  await initializeCostTestDb(db);
  await db.exec(`create trigger sync_purchase_receipt_cost_layer_trigger after insert on inventory_purchase_receipt_lines for each row execute function sync_purchase_receipt_cost_layer();
    create trigger zz_process_customer_exchange_cost_ledger_trigger after insert or update of jsonb,category on logs for each row execute function process_customer_exchange_cost_ledger();`);
});
after(async () => db.close());
beforeEach(async () => {
  await db.exec("begin");
  await db.query(
    "insert into customers(id,name,phone) values(1,'테스트고객','01000000000'),(2,'다른고객','01000000001')",
  );
});
afterEach(async () => db.exec("rollback"));
async function direct(price = 100, qty = 2, type = "purchase_in") {
  return (
    await q(
      "insert into inventory_movements(item_name,movement_type,quantity_delta,unit_price,created_at) values('검증품목',$1,$2,$3,'2026-08-01') returning id",
      [type, qty, price],
    )
  )[0].id;
}
test("기초재고 추가 시 수량만큼 미확정 원가층도 생성한다", async () => {
  await direct(null, 3, "initial");
  const [l] = await q("select * from inventory_cost_layers");
  assert.equal(l.original_quantity, 3);
  assert.equal(l.remaining_quantity, 3);
  assert.equal(l.unit_cost, null);
  assert.equal(l.cost_status, "pending");
});
test("직접입고의 확정 0원과 미사용 취소는 원가 수량을 맞춘다", async () => {
  const id = await direct(0, 2);
  await db.query(
    "insert into inventory_movements(item_name,movement_type,quantity_delta,reversed_movement_id) values('검증품목','reversal',-2,$1)",
    [id],
  );
  assert.equal(
    (await q("select remaining_quantity from inventory_cost_layers"))[0]
      .remaining_quantity,
    0,
  );
  assert.equal(
    (
      await q(
        "select total_cost from inventory_cost_events where direction='out'",
      )
    )[0].total_cost,
    0,
  );
  assert.equal(
    (await q("select sum(quantity)::int n from inventory_cost_allocations"))[0]
      .n,
    2,
  );
});
test("이미 사용한 직접입고의 취소를 차단한다", async () => {
  const id = await direct();
  await db.query(
    "select allocate_inventory_cost_fifo('sale_out','2026-08-02',null,'검증품목',1,'test','1','1')",
  );
  await assert.rejects(
    db.query(
      "insert into inventory_movements(item_name,movement_type,quantity_delta,reversed_movement_id) values('검증품목','reversal',-2,$1)",
      [id],
    ),
    /이미 사용/,
  );
});
test("원가층이 없는 과거 직접입고는 취소를 차단한다", async () => {
  await db.exec(
    "alter table inventory_movements disable trigger sync_direct_inventory_movement_cost_trigger",
  );
  const id = await direct();
  await db.exec(
    "alter table inventory_movements enable trigger sync_direct_inventory_movement_cost_trigger",
  );
  await assert.rejects(
    db.query(
      "insert into inventory_movements(item_name,movement_type,quantity_delta,reversed_movement_id) values('검증품목','reversal',-2,$1)",
      [id],
    ),
    /원가층이 없습니다/,
  );
});
test("시연 포함 입고 10개는 원가층 10개 생성 후 시연 2개만 차감한다", async () => {
  const [{ id: receipt }] = await q(
    "insert into inventory_purchase_receipts(id,arrived_on) values(gen_random_uuid(),'2026-08-01') returning id",
  );
  const [{ id: line }] = await q(
    "insert into inventory_purchase_order_lines(id,item_name,inbound_type) values(gen_random_uuid(),'검증품목','purchase') returning id",
  );
  await db.query(
    "insert into inventory_purchase_receipt_lines(id,receipt_id,order_line_id,item_name,quantity,unit_price,demo_quantity) values(gen_random_uuid(),$1,$2,'검증품목',10,100,2)",
    [receipt, line],
  );
  assert.equal(
    (await q("select remaining_quantity from inventory_cost_layers"))[0]
      .remaining_quantity,
    10,
  );
  await db.query(
    "insert into logs(id,admin_id,category,created_at,jsonb) values(101,$1,'stamp','2026-08-01',$2)",
    [
      master,
      JSON.stringify({
        purchaseReceiptId: receipt,
        items: [{ itemName: "검증품목", quantity: 2, remark: "시연용" }],
      }),
    ],
  );
  assert.equal(
    (await q("select remaining_quantity from inventory_cost_layers"))[0]
      .remaining_quantity,
    8,
  );
  assert.equal(
    (
      await q(
        "select total_cost from inventory_cost_events where event_type='demo_out'",
      )
    )[0].total_cost,
    200,
  );
  assert.equal(
    (
      await q("select amount from settlement_expenses where category='시연용'")
    )[0].amount,
    200,
  );
});
test("시연 비용은 최신 입고 단가가 아니라 실제 FIFO 출고 원가이며 재호출해도 한 번이다", async () => {
  await direct(50, 2);
  await db.query(
    "insert into logs(id,admin_id,category,created_at,jsonb) values(101,$1,'stamp','2026-08-02',$2)",
    [
      master,
      JSON.stringify({
        items: [{ itemName: "검증품목", quantity: 2, remark: "시연용" }],
      }),
    ],
  );
  await db.query(
    'update logs set jsonb=jsonb||\'{"paymentMemo":"메모수정"}\' where id=101',
  );
  assert.deepEqual(
    await q("select amount from settlement_expenses where category='시연용'"),
    [{ amount: 100 }],
  );
});
async function soldTwo() {
  await direct(100, 1);
  await direct(200, 1);
  await db.query(
    "insert into logs(id,customer_id,admin_id,category,created_at,jsonb) values(201,1,$1,'stamp','2026-08-02','{\"items\":[]}')",
    [master],
  );
  await db.query(
    "select allocate_inventory_cost_fifo('sale_out','2026-08-02',null,'검증품목',2,'stamp_log','201','1')",
  );
}
async function returned(id, qty = 1, customer = 1) {
  await db.query(
    "insert into logs(id,customer_id,admin_id,category,created_at,jsonb) values($1,$2,$3,'stamp','2026-08-03',$4)",
    [
      id,
      customer,
      master,
      JSON.stringify({
        items: [
          {
            itemName: "검증품목",
            quantity: qty,
            inventoryAction: "exchange_in",
            costSourceSaleLogId: "201",
            costSourceSaleLineIndex: "1",
          },
        ],
      }),
    ],
  );
}
test("100원·200원 판매를 두 번 나눠 교환입고하면 각각 다른 원가를 복원한다", async () => {
  await soldTwo();
  await returned(202);
  await returned(203);
  const rows = await q(
    "select total_cost from inventory_cost_events where event_type='customer_exchange_in' order by reference_id",
  );
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((r) => r.total_cost).sort((a, b) => a - b),
    [100, 200],
  );
});
test("교환입고한 수량을 다시 받아 원판매 수량을 초과할 수 없다", async () => {
  await soldTwo();
  await returned(202, 2);
  await assert.rejects(returned(203), /판매 수량을 초과/);
});
test("다른 고객의 판매를 교환 원가 출처로 사용할 수 없다", async () => {
  await soldTwo();
  await assert.rejects(returned(202, 1, 2), /품목·고객·날짜/);
});
test("부분 교환 후 결제 메모만 수정해도 원가층은 다시 바뀌지 않는다", async () => {
  await soldTwo();
  await returned(202);
  await returned(203);
  const before = await q("select * from inventory_cost_layers order by id");
  await db.query(
    'update logs set jsonb=jsonb||\'{"paymentMemo":"정정"}\' where id=202',
  );
  assert.deepEqual(
    await q("select * from inventory_cost_layers order by id"),
    before,
  );
});
