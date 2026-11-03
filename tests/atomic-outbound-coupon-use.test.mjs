import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../supabase/migrations/20261103000000_atomic_outbound_coupon_use.sql",
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
