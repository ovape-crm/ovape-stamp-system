import assert from "node:assert/strict";
import { initializeCostTestDb } from "./helpers/cost-db-fixture.mjs";
import { before, after, beforeEach, afterEach, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const query = async (sql, args = []) => (await db.query(sql, args)).rows;

before(async () => {
  await initializeCostTestDb(db);
});
after(async () => {
  await db.close();
});
beforeEach(async () => {
  await db.exec("begin");
});
afterEach(async () => {
  await db.exec("rollback");
});

async function fixture({
  firstCost = 100,
  secondCost = 200,
  firstDate = "2026-08-01",
} = {}) {
  await db.query(
    `insert into inventory_balances(item_name,quantity) values ('테스트',3),('다른품목',10)`,
  );
  for (const [n, qty, remaining, cost, at] of [
    [10, 3, 3, firstCost, firstDate],
    [20, 2, 0, secondCost, "2026-08-02"],
  ]) {
    await db.query(
      `insert into inventory_cost_events(id,event_type,event_at,item_name,direction,quantity,total_cost,reference_type,reference_id)
      values ($1,'purchase_in',$2,'테스트','in',$3,$4,'purchase_receipt',$5)`,
      [uid(n), at, qty, cost === null ? null : cost * qty, String(n)],
    );
    await db.query(
      `insert into inventory_cost_layers(id,source_event_id,item_name,original_quantity,remaining_quantity,unit_cost,queue_sequence,cost_status)
      values ($1,$2,'테스트',$3,$4,$5,$6,$7)`,
      [
        uid(n + 1),
        uid(n),
        qty,
        remaining,
        cost,
        n,
        cost === null ? "pending" : "confirmed",
      ],
    );
  }
  await db.query(
    `insert into inventory_cost_events(id,event_type,event_at,item_name,direction,quantity,total_cost,reference_type,reference_id,reference_line_key,settlement_effect)
    values ($1,'sale_out','2026-08-03','테스트','out',2,$2,'stamp_log','30','1','sale_cogs')`,
    [uid(30), secondCost === null ? null : secondCost * 2],
  );
  await db.query(
    `insert into inventory_cost_allocations(outbound_event_id,source_layer_id,quantity,unit_cost) values ($1,$2,2,$3)`,
    [uid(30), uid(21), secondCost],
  );
}
async function snapshot() {
  return (
    await query("select inventory_cost_review_snapshot('테스트') as snapshot")
  )[0].snapshot;
}
async function preview() {
  return (
    await query(
      "select preview_inventory_cost_reassignment('테스트','2026-08-03', '테스트') as id",
    )
  )[0].id;
}
async function approve(id) {
  await query("select approve_inventory_cost_reassignment($1)", [id]);
}
async function apply(id) {
  await query("select apply_inventory_cost_reassignment($1)", [id]);
}

test("미리보기는 실제 FIFO 차이를 계산하며 실재고·원가 기록을 변경하지 않는다", async () => {
  await fixture();
  const original = await snapshot();
  const id = await preview();
  assert.deepEqual(await snapshot(), original);
  const [run] = await query(
    "select * from inventory_cost_reassignment_runs where id=$1",
    [id],
  );
  assert.equal(run.cost_before, 400);
  assert.equal(run.cost_after, 200);
  assert.equal(run.affected_outbound_count, 1);
  const [line] = await query(
    "select * from inventory_cost_reassignment_preview_lines where run_id=$1",
    [id],
  );
  assert.equal(line.after_allocations[0].source_layer_id, uid(11));
});
test("승인한 배정만 적용하고 다른 품목·실재고는 보존한다", async () => {
  await fixture();
  const stock = await query(
    "select * from inventory_balances order by item_name",
  );
  const id = await preview();
  await approve(id);
  await apply(id);
  assert.deepEqual(
    await query("select * from inventory_balances order by item_name"),
    stock,
  );
  assert.equal(
    (
      await query("select total_cost from inventory_cost_events where id=$1", [
        uid(30),
      ])
    )[0].total_cost,
    200,
  );
  assert.deepEqual(
    (
      await query(
        "select remaining_quantity from inventory_cost_layers order by queue_sequence",
      )
    ).map((x) => x.remaining_quantity),
    [1, 2],
  );
  assert.equal(
    (
      await query(
        "select status from inventory_cost_reassignment_runs where id=$1",
        [id],
      )
    )[0].status,
    "applied",
  );
});
test("미확정 원가와 확정 0원을 구별한다", async () => {
  await fixture({ firstCost: null, secondCost: 0 });
  const id = await preview();
  const [run] = await query(
    "select cost_before,cost_after from inventory_cost_reassignment_runs where id=$1",
    [id],
  );
  assert.equal(run.cost_before, 0);
  assert.equal(run.cost_after, null);
  await approve(id);
  await apply(id);
  assert.equal(
    (
      await query("select total_cost from inventory_cost_events where id=$1", [
        uid(30),
      ])
    )[0].total_cost,
    null,
  );
});
test("재고가 같아도 미리보기 이후 단가가 바뀌면 승인을 차단한다", async () => {
  await fixture();
  const id = await preview();
  await query("update inventory_cost_layers set unit_cost=150 where id=$1", [
    uid(11),
  ]);
  await assert.rejects(approve(id), /미리보기 이후/);
});
test("승인 이후 원본 변경도 실행을 차단한다", async () => {
  await fixture();
  const id = await preview();
  await approve(id);
  await query(
    "update inventory_cost_events set metadata='{" +
      '"edited":true' +
      "}' where id=$1",
    [uid(30)],
  );
  await assert.rejects(apply(id), /미리보기 이후/);
});
test("승인 없이 실행하거나 같은 승인으로 중복 실행할 수 없다", async () => {
  await fixture();
  const id = await preview();
  await db.exec("savepoint no_approval");
  await assert.rejects(apply(id), /승인된/);
  await db.exec("rollback to no_approval");
  await approve(id);
  await apply(id);
  await assert.rejects(apply(id), /승인된/);
});
test("출고 이후 입고층을 사용하지 않는다", async () => {
  await fixture({ firstDate: "2026-09-01" });
  const id = await preview();
  const [run] = await query(
    "select affected_outbound_count,cost_after from inventory_cost_reassignment_runs where id=$1",
    [id],
  );
  assert.equal(run.affected_outbound_count, 0);
  assert.equal(run.cost_after, 400);
});
test("출고 수량 불일치와 원가층 잔량 불일치를 자동 보정하지 않고 차단한다", async () => {
  await fixture();
  await query(
    "update inventory_balances set quantity=4 where item_name='테스트'",
  );
  await assert.rejects(preview(), /실재고와 원가층 잔량/);
});
test("연결된 정산비용과 A/S·교환은 원본 배정을 보존한다", async () => {
  await fixture();
  await query(
    "insert into settlement_expenses(id,source_log_id,amount) values ($1,30,400)",
    [uid(100)],
  );
  const id = await preview();
  const [line] = await query(
    "select * from inventory_cost_reassignment_preview_lines where run_id=$1",
    [id],
  );
  assert.match(line.protected_reason, /정산비용/);
  assert.deepEqual(line.before_allocations, line.after_allocations);
});
test("원본 출고를 삭제해도 미리보기의 변경 내역은 남는다", async () => {
  await fixture();
  const id = await preview();
  await query("delete from inventory_cost_events where id=$1", [uid(30)]);
  assert.equal(
    (
      await query(
        "select * from inventory_cost_reassignment_preview_lines where run_id=$1",
        [id],
      )
    ).length,
    1,
  );
});
test("실행 중 오류가 나면 배정·원가·승인상태를 전부 롤백한다", async () => {
  await fixture();
  const id = await preview();
  await approve(id);
  const original = await snapshot();
  await db.exec(`create function test_fail() returns trigger language plpgsql as $$ begin raise exception 'TEST_FAILURE'; end $$;
    create trigger test_fail before update on inventory_cost_layers for each row execute function test_fail(); savepoint applying;`);
  await assert.rejects(apply(id), /TEST_FAILURE/);
  await db.exec("rollback to applying");
  assert.deepEqual(await snapshot(), original);
  assert.equal(
    (
      await query(
        "select status from inventory_cost_reassignment_runs where id=$1",
        [id],
      )
    )[0].status,
    "approved",
  );
});
test("일반 사용자는 실행 및 감사 기록 수정을 할 수 없다", async () => {
  await fixture();
  const id = await preview();
  await db.exec("set local role authenticated");
  await assert.rejects(
    query(
      "update inventory_cost_reassignment_runs set status='approved' where id=$1",
      [id],
    ),
    /permission denied/,
  );
});

async function receipt(layerNumber = 10) {
  const receiptId = uid(200),
    lineId = uid(201),
    orderLineId = uid(202);
  await query(
    "insert into inventory_purchase_receipts(id,arrived_on) values ($1,'2026-08-01')",
    [receiptId],
  );
  await query("insert into inventory_purchase_order_lines values ($1,3,0,3)", [
    orderLineId,
  ]);
  await query(
    "insert into inventory_purchase_receipt_lines(id,receipt_id,order_line_id,item_name,quantity,unit_price) values ($1,$2,$3,'테스트',$4,100)",
    [lineId, receiptId, orderLineId, layerNumber === 10 ? 3 : 2],
  );
  await query(
    "update inventory_cost_events set reference_id=$1,reference_line_key=$2 where id=$3",
    [receiptId, lineId, uid(layerNumber)],
  );
  await query(
    "insert into inventory_movements(item_name,movement_type,quantity_delta,reference_type,reference_id,unit_price) values ('테스트','purchase_in',$1,'purchase_receipt',$2,100)",
    [layerNumber === 10 ? 3 : 2, receiptId],
  );
  return { receiptId, lineId };
}
test("미사용 입고 단가 수정은 해당 층만 바꾸고 기존 출고는 건드리지 않는다", async () => {
  await fixture();
  const { lineId } = await receipt();
  const allocations = await query("select * from inventory_cost_allocations");
  await query(
    "update inventory_purchase_receipt_lines set unit_price=150 where id=$1",
    [lineId],
  );
  assert.equal(
    (
      await query("select unit_cost from inventory_cost_layers where id=$1", [
        uid(11),
      ])
    )[0].unit_cost,
    150,
  );
  assert.equal(
    (
      await query("select total_cost from inventory_cost_events where id=$1", [
        uid(10),
      ])
    )[0].total_cost,
    450,
  );
  assert.deepEqual(
    await query("select * from inventory_cost_allocations"),
    allocations,
  );
});
test("입고 수량 증가·감소는 잔여층과 실재고에 같은 차이만 반영한다", async () => {
  await fixture();
  const { lineId } = await receipt();
  const allocations = await query("select * from inventory_cost_allocations");
  await query(
    "update inventory_purchase_receipt_lines set quantity=5 where id=$1",
    [lineId],
  );
  assert.equal(
    (
      await query(
        "select quantity from inventory_balances where item_name='테스트'",
      )
    )[0].quantity,
    5,
  );
  assert.equal(
    (
      await query(
        "select remaining_quantity from inventory_cost_layers where id=$1",
        [uid(11)],
      )
    )[0].remaining_quantity,
    5,
  );
  await query(
    "update inventory_purchase_receipt_lines set quantity=1 where id=$1",
    [lineId],
  );
  assert.equal(
    (
      await query(
        "select quantity from inventory_balances where item_name='테스트'",
      )
    )[0].quantity,
    1,
  );
  assert.deepEqual(
    await query("select * from inventory_cost_allocations"),
    allocations,
  );
});
test("사용한 원가층은 전표 단가 수정 우회로도 변경할 수 없다", async () => {
  await fixture();
  const { lineId } = await receipt(20);
  await assert.rejects(
    query(
      "update inventory_purchase_receipt_lines set unit_price=999 where id=$1",
      [lineId],
    ),
    /이미 출고/,
  );
});
test("사용한 수량보다 감소하거나 사용한 입고를 취소할 수 없다", async () => {
  await fixture();
  const { lineId, receiptId } = await receipt(20);
  await db.exec("savepoint quantity");
  await assert.rejects(
    query(
      "update inventory_purchase_receipt_lines set quantity=1 where id=$1",
      [lineId],
    ),
    /이미 사용한/,
  );
  await db.exec("rollback to quantity");
  await assert.rejects(
    query(
      "update inventory_purchase_receipts set reversed_at=now() where id=$1",
      [receiptId],
    ),
    /COST_LAYER_ALREADY_CONSUMED/,
  );
});
test("입고일 정정은 미사용 층의 날짜에 반영되고 사용된 층은 차단된다", async () => {
  await fixture();
  const { receiptId } = await receipt();
  await query(
    "update inventory_purchase_receipts set arrived_on='2026-07-31' where id=$1",
    [receiptId],
  );
  assert.equal(
    (
      await query(
        "select (event_at at time zone 'Asia/Seoul')::date::text as day from inventory_cost_events where id=$1",
        [uid(10)],
      )
    )[0].day,
    "2026-07-31",
  );
  await query("update inventory_cost_events set reference_id=$1 where id=$2", [
    receiptId,
    uid(20),
  ]);
  await assert.rejects(
    query(
      "update inventory_purchase_receipts set arrived_on='2026-08-04' where id=$1",
      [receiptId],
    ),
    /입고일/,
  );
});
test("서비스 무료 출고도 공통 FIFO로 배정되며 판매가 0원 대신 실제 원가를 표시한다", async () => {
  await fixture();
  await query(
    `insert into logs(id,category,created_at,jsonb) values (40,'stamp','2026-08-04',$1)`,
    [
      JSON.stringify({
        items: [
          {
            itemName: "테스트",
            quantity: 1,
            inventoryAction: "out",
            remark: "서비스",
            unitPrice: 0,
          },
        ],
      }),
    ],
  );
  const [event] = await query(
    "select * from inventory_cost_events where reference_type='stamp_log' and reference_id='40'",
  );
  assert.equal(event.event_type, "service_out");
  assert.equal(event.total_cost, 100);
  const [movement] = await query(
    "insert into inventory_movements(item_name,quantity_delta,unit_price,reference_type,reference_id,inventory_action) values ('테스트',-1,0,'outbound_log','40','out') returning id",
  );
  const [prices] = await query(
    "select get_inventory_movement_unit_prices($1) prices",
    [[movement.id]],
  );
  assert.equal(prices.prices[movement.id], 100);
});
test("서비스의 미확정 원가는 무료 판매가 0원으로 대체되지 않는다", async () => {
  await fixture({ firstCost: null });
  await query(
    `insert into logs(id,category,created_at,jsonb) values (40,'stamp','2026-08-04',$1)`,
    [
      JSON.stringify({
        items: [
          {
            itemName: "테스트",
            quantity: 1,
            inventoryAction: "out",
            remark: "서비스",
          },
        ],
      }),
    ],
  );
  const [movement] = await query(
    "insert into inventory_movements(item_name,quantity_delta,unit_price,reference_type,reference_id) values ('테스트',-1,0,'outbound_log','40') returning id",
  );
  assert.equal(
    (
      await query("select get_inventory_movement_unit_prices($1) prices", [
        [movement.id],
      ])
    )[0].prices[movement.id],
    null,
  );
});
test("결제정보만 수정하면 원가층 ID와 배정 원가가 그대로 유지된다", async () => {
  await fixture();
  await query(
    `insert into logs(id,category,created_at,jsonb) values (40,'stamp','2026-08-04',$1)`,
    [
      JSON.stringify({
        items: [
          {
            itemName: "테스트",
            quantity: 1,
            inventoryAction: "out",
            remark: "서비스",
          },
        ],
      }),
    ],
  );
  const before = await query(
    "select * from inventory_cost_allocations order by id",
  );
  await query(
    `update logs set jsonb=jsonb||' {"paymentType":"cash"}'::jsonb where id=40`,
  );
  assert.deepEqual(
    await query("select * from inventory_cost_allocations order by id"),
    before,
  );
});
test("업체 교환출고는 FIFO 원가·실재고·A/S 표시가 일치한다", async () => {
  await fixture();
  await query(
    "insert into after_services(id,item_name,quantity,service_case_type,outbound_supplier_id) values(50,'테스트',2,'vendor_exchange',$1)",
    [uid(500)],
  );
  await query("select confirm_inventory_service_outbound(50)");
  assert.equal(
    (
      await query(
        "select quantity from inventory_balances where item_name='테스트'",
      )
    )[0].quantity,
    1,
  );
  const [detail] = await query(
    "select * from get_after_service_outbound_cost_details(50)",
  );
  assert.equal(detail.unit_price, 100);
  assert.equal(detail.outbound_quantity, 2);
  assert.equal(detail.cost_source, "FIFO 원가층");
  assert.equal(
    (
      await query(
        "select sum(remaining_quantity)::int qty from inventory_cost_layers where item_name='테스트'",
      )
    )[0].qty,
    1,
  );
});
test("재고 밖 매장제품 A/S 출고·삭제는 재고를 늘리거나 줄이지 않는다", async () => {
  await fixture();
  const before = await snapshot();
  await query(
    "insert into after_services(id,item_name,quantity,service_case_type,outbound_supplier_id) values(50,'테스트',2,'store_product_as',$1)",
    [uid(500)],
  );
  await query("select confirm_inventory_service_outbound(50)");
  await db.exec(
    "select set_config('app.after_service_cleanup','on',true); delete from after_services where id=50;",
  );
  assert.deepEqual(await snapshot(), before);
});
test("업체 교환출고 취소는 실제 차감한 재고와 원가층만 원복한다", async () => {
  await fixture();
  const beforeLayers = await query(
    "select * from inventory_cost_layers order by id",
  );
  await query(
    "insert into after_services(id,item_name,quantity,service_case_type,outbound_supplier_id) values(50,'테스트',2,'vendor_exchange',$1)",
    [uid(500)],
  );
  await query("select confirm_inventory_service_outbound(50)");
  await db.exec(
    "select set_config('app.after_service_cleanup','on',true); delete from after_services where id=50;",
  );
  assert.deepEqual(
    await query("select * from inventory_cost_layers order by id"),
    beforeLayers,
  );
  assert.equal(
    (
      await query(
        "select quantity from inventory_balances where item_name='테스트'",
      )
    )[0].quantity,
    3,
  );
});
test("원가 미확정 업체 출고는 실재고·원가 모두 롤백한다", async () => {
  await fixture({ firstCost: null });
  const original = await snapshot();
  await query(
    "insert into after_services(id,item_name,quantity,service_case_type,outbound_supplier_id) values(50,'테스트',2,'vendor_exchange',$1)",
    [uid(500)],
  );
  await db.exec("savepoint dispatch");
  await assert.rejects(
    query("select confirm_inventory_service_outbound(50)"),
    /미확정 원가층/,
  );
  await db.exec("rollback to dispatch");
  assert.deepEqual(await snapshot(), original);
});
test("같은 FIFO 출고 요청은 중복 차감하지 않는다", async () => {
  await fixture();
  const call =
    "select allocate_inventory_cost_fifo('sale_out','2026-08-03',null,'테스트',2,'stamp_log','30','1','sale_cogs','{}') id";
  const before = await snapshot();
  assert.equal((await query(call))[0].id, uid(30));
  assert.deepEqual(await snapshot(), before);
  await assert.rejects(
    query(call.replace("'테스트',2", "'테스트',3")),
    /기존 출고와/,
  );
});

test("승인된 0원 원가층 분리를 사용량 오류로 오인하거나 이중 배정하지 않는다", async () => {
  await fixture();
  await query(
    "update inventory_cost_events set event_at='2026-09-03' where id=$1",
    [uid(30)],
  );
  await query(
    "update inventory_cost_layers set remaining_quantity=2 where id=$1",
    [uid(11)],
  );
  await query(
    `insert into inventory_cost_events(id,event_type,event_at,item_name,direction,quantity,total_cost,reference_type,reference_id,metadata)
    values ($1,'reconciliation_in','2026-08-28','테스트','in',1,0,'cost_reconciliation','zero-split','{"manualZeroCost":true}')`,
    [uid(60)],
  );
  await query(
    `insert into inventory_cost_layers(id,source_event_id,item_name,original_quantity,remaining_quantity,unit_cost,queue_sequence,cost_status,source_layer_id)
    values ($1,$2,'테스트',1,1,0,0,'confirmed',$3)`,
    [uid(61), uid(60), uid(11)],
  );
  const id = await preview();
  const [run] = await query(
    "select cost_after from inventory_cost_reassignment_runs where id=$1",
    [id],
  );
  assert.equal(run.cost_after, 100);
  await approve(id);
  await apply(id);
  const [report] = await query(
    "select get_inventory_cost_integrity_report() report",
  );
  assert.equal(report.report.layerMismatchCount, 0);
});
test("수동 선택 소진 기록은 날짜 범위에 있어도 다른 원가층으로 옮기지 않는다", async () => {
  await fixture();
  await query(
    "update inventory_cost_events set event_type='reconciliation_out',settlement_effect='none' where id=$1",
    [uid(30)],
  );
  const id = await preview();
  const [line] = await query(
    "select * from inventory_cost_reassignment_preview_lines where run_id=$1",
    [id],
  );
  assert.match(line.protected_reason, /수동 소진/);
  assert.deepEqual(line.before_allocations, line.after_allocations);
});
test("원복된 소진 기록의 수량은 다시 차감하지 않는다", async () => {
  await fixture();
  await query(
    `update inventory_cost_events set event_type='reconciliation_out',metadata='{"restoredAt":"2026-09-01"}' where id=$1`,
    [uid(30)],
  );
  await query(
    "update inventory_cost_layers set remaining_quantity=2 where id=$1",
    [uid(21)],
  );
  await query(
    "update inventory_balances set quantity=5 where item_name='테스트'",
  );
  const before = await snapshot();
  await preview();
  assert.deepEqual(await snapshot(), before);
});
test("과거 서비스 누락 조회는 새 원가를 추정하거나 재고를 다시 차감하지 않는다", async () => {
  await fixture();
  await db.exec(
    "alter table logs disable trigger z_sync_standard_outbound_cost_ledger_trigger",
  );
  await query(
    `insert into logs(id,category,created_at,jsonb) values (40,'stamp','2026-08-04',$1)`,
    [
      JSON.stringify({
        items: [
          {
            itemName: "테스트",
            quantity: 1,
            inventoryAction: "out",
            remark: "서비스",
          },
        ],
      }),
    ],
  );
  const before = await snapshot();
  const [report] = await query(
    "select get_inventory_cost_integrity_report() report",
  );
  assert.equal(report.report.missingServiceCount, 1);
  assert.equal(report.report.missingServiceLines[0].quantity, 1);
  assert.deepEqual(await snapshot(), before);
});
test("다른 역할은 미리보기와 A/S 원가 조회 권한이 없다", async () => {
  await query("select set_config('request.jwt.claim.sub',$1,true)", [uid(999)]);
  await db.exec("savepoint permission_check");
  await assert.rejects(preview(), /MASTER_REQUIRED/);
  await db.exec("rollback to permission_check");
  await assert.rejects(
    query("select * from get_after_service_outbound_cost_details(50)"),
    /MASTER_REQUIRED/,
  );
});

test("입고 재호출은 원가층 ID·확정 단가를 보존하고 수량이 다른 요청은 차단한다", async () => {
  await fixture();
  await query("select update_inventory_cost_layer_unit_cost($1,150,'원가 확인')", [uid(11)]);
  const before = await snapshot();
  const call = "select create_inventory_cost_layer('purchase_in','2026-08-01',null,'테스트',3,100,'confirmed','back','purchase_receipt','10') id";
  assert.equal((await query(call))[0].id, uid(10));
  assert.deepEqual(await snapshot(), before);
  await assert.rejects(query(call.replace("'테스트',3", "'테스트',4")), /기존 입고층과/);
});

test("같은 전표에서 한 품목 행을 수정해도 다른 행의 출고 원가는 다시 배정하지 않는다", async () => {
  await fixture();
  const items = [
    { itemName: '테스트', quantity: 1, inventoryAction: 'out', remark: '서비스' },
    { itemName: '테스트', quantity: 1, inventoryAction: 'out', remark: '서비스' },
  ];
  await query("insert into logs(id,category,created_at,jsonb) values(40,'stamp','2026-08-04',$1)", [JSON.stringify({ items })]);
  const first = await query("select a.* from inventory_cost_allocations a join inventory_cost_events e on e.id=a.outbound_event_id where e.reference_id='40' and e.reference_line_key='1'");
  items[1].quantity = 2;
  await query('update logs set jsonb=$1 where id=40', [JSON.stringify({ items })]);
  assert.deepEqual(await query("select a.* from inventory_cost_allocations a join inventory_cost_events e on e.id=a.outbound_event_id where e.reference_id='40' and e.reference_line_key='1'"), first);
});
