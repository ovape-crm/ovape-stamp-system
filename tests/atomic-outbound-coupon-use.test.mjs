import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../supabase/migrations/20261103000000_atomic_outbound_coupon_use.sql",
  import.meta.url,
);
const couponHistoryMigrationPath = new URL(
  "../supabase/migrations/20261104000000_keep_coupon_history_separate_from_sales.sql",
  import.meta.url,
);
const couponEditReconciliationMigrationPath = new URL(
  "../supabase/migrations/20261105001000_reconcile_outbound_coupon_on_edit.sql",
  import.meta.url,
);
const couponEditChangeMigrationPath = new URL(
  "../supabase/migrations/20261105002000_reconcile_outbound_coupon_change_on_edit.sql",
  import.meta.url,
);
const staffOutboundEditMigrationPath = new URL(
  "../supabase/migrations/20261106060000_allow_staff_atomic_outbound_edits.sql",
  import.meta.url,
);

test("출고와 쿠폰 사용은 하나의 RPC 트랜잭션으로 저장한다", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /apply_stamp_log_operation_v2[\s\S]*?v_total_delta := p_stamp_delta - v_coupon_delta/i);
  assert.match(sql, /returning id into v_log_id;[\s\S]*?couponSourceOutboundLogId/i);
  assert.match(sql, /if v_total_delta < 0 then raise exception 'INSUFFICIENT_STAMPS'/i);
  assert.match(sql, /v_coupon_jsonb := \(coalesce\(p_jsonb, '\{\}'::jsonb\) - 'clientRequestId'\)/i);
  assert.match(sql, /새 DB 함수가 먼저 배포된 뒤 이전 프런트가 쿠폰 차감을 다시 요청해도/i);
  assert.match(sql, /p_action ~ '\^coupon-\[0-9\]\+\$'[\s\S]*?couponSourceOutboundLogId/i);
});

test("예약 확정도 쿠폰 사용을 원자적으로 처리한다", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /confirm_reservation_stamp_operation_v2[\s\S]*?v_total_delta := stamp_amount - v_coupon_delta/i);
  assert.match(sql, /v_coupon_jsonb := \(coalesce\(target_log\.jsonb, '\{\}'::jsonb\) - 'clientRequestId'\)/i);
});

test("쿠폰 이력에는 판매 금액·결제수단·품목을 복제하지 않는다", async () => {
  const sql = await readFile(couponHistoryMigrationPath, "utf8");

  assert.match(
    sql,
    /v_coupon_jsonb := jsonb_strip_nulls\(jsonb_build_object\([\s\S]*?'couponSourceOutboundLogId',[\s\S]*?'createdWorkerName'/i,
  );
  assert.doesNotMatch(sql, /'totalAmount'|'paymentType'|'payments'|'items'/i);
  assert.match(sql, /values \(auth\.uid\(\), p_customer_id, format\('coupon-%s', v_coupon_delta\), v_coupon_note, v_coupon_jsonb, 'stamp'\)/i);
  assert.match(sql, /values \(auth\.uid\(\), target_log\.customer_id, format\('coupon-%s', v_coupon_delta\), v_coupon_note, v_coupon_jsonb, 'stamp'\)/i);
});

test("출고 수정에서 쿠폰을 취소하면 연결 쿠폰 이력과 스탬프를 함께 복구한다", async () => {
  const sql = await readFile(couponEditReconciliationMigrationPath, "utf8");

  assert.match(sql, /update_outbound_log_with_coupon_reconciliation/i);
  assert.match(sql, /couponSourceOutboundLogId' = target_log\.id::text/i);
  assert.match(sql, /coupon_restore_delta := coupon_restore_delta/i);
  assert.match(sql, /set count = count \+ total_delta/i);
  assert.match(sql, /delete from public\.logs[\s\S]*?couponSourceOutboundLogId' = target_log\.id::text/i);
  assert.match(sql, /set note = p_note,[\s\S]*?jsonb = coalesce\(p_jsonb, '\{\}'::jsonb\),[\s\S]*?action = p_action/i);
});

test("출고 수정에서 쿠폰 장수를 바꾸면 차이만큼 스탬프와 연결 이력을 조정한다", async () => {
  const sql = await readFile(couponEditChangeMigrationPath, "utf8");

  assert.match(sql, /existing_coupon_delta - next_coupon_delta/i);
  assert.match(sql, /set action = format\('coupon-%s', next_coupon_delta\)/i);
  assert.match(sql, /when 'event' then ' · 이벤트'/i);
  assert.match(sql, /when 'basic' then ' · 기본'/i);
});

test("출고 저장 성공 전에 별도 쿠폰 차감 요청을 보내지 않는다", async () => {
  const section = await readFile(
    new URL("../src/app/(auth)/customers/[id]/_components/StampSection.tsx", import.meta.url),
    "utf8",
  );
  const handleAdd = section.match(/const handleAdd =[\s\S]*?const handleReserve =/);

  assert.ok(handleAdd);
  assert.match(handleAdd[0], /await addStamp\(/);
  assert.doesNotMatch(handleAdd[0], /removeStamp\(/);
});

test("직원 출고 수정은 로그·쿠폰·적립을 한 RPC에서 함께 갱신한다", async () => {
  const sql = await readFile(staffOutboundEditMigrationPath, "utf8");
  const logService = await readFile(
    new URL("../src/app/_domains/_log/_services/logService.ts", import.meta.url),
    "utf8",
  );

  assert.match(sql, /oss_role in \('staff', 'admin', 'master'\)/i);
  assert.match(sql, /total_delta := next_amount - previous_amount \+ existing_coupon_delta - next_coupon_delta/i);
  assert.match(sql, /update public\.logs set note = p_note, jsonb = coalesce\(p_jsonb, '\{\}'::jsonb\), action = p_action/i);
  assert.match(logService, /const requiresOutboundReconciliation =[\s\S]*?existing\?\.category === LogCategoryEnum\.STAMP\.value[\s\S]*?action !== undefined[\s\S]*?logMeta !== undefined;/);
  assert.match(logService, /if \(requiresOutboundReconciliation\)[\s\S]*?update_outbound_log_with_coupon_reconciliation/);
});
