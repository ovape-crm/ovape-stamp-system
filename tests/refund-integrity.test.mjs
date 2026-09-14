import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../supabase/migrations/20260914060000_secure_refund_reversal_and_limits.sql",
  import.meta.url,
);

test("불량 반품을 포함한 모든 완료 환불은 원출고 한도와 품목 수량을 함께 소진한다", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /from public\.customer_refunds where source_log_id=p_source_log_id and status='completed';/i);
  assert.match(sql, /where refund\.source_log_id=p_source_log_id and refund\.status='completed' and line\.source_line_index=v_line_index;/i);
  assert.doesNotMatch(sql, /recovery_type <> 'defective'/i);
});

test("환불 취소는 원결제수단과 금액의 양수 상계 이력을 남긴다", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /action, note, jsonb\)\s*values\(auth\.uid\(\), refund\.customer_id, 'stamp', 'refund_cancel'/i);
  assert.match(sql, /'totalAmount', refund\.refund_amount/i);
  assert.match(sql, /'payments', refund_payments/i);
});

test("환불과 환불 취소 이력은 개별 삭제로 상계가 깨지지 않는다", async () => {
  const guardPath = new URL(
    "../supabase/migrations/20260914070000_protect_refund_reversal_history.sql",
    import.meta.url,
  );
  const sql = await readFile(guardPath, "utf8");

  assert.match(sql, /REFUND_HISTORY_IMMUTABLE/i);
  assert.match(sql, /target_log\.jsonb->>'refundId'/i);
});
