import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../supabase/migrations/20260902060000_secure_stamp_operations_and_fix_log_id_type.sql",
  import.meta.url,
);

test("출고 스탬프 RPC는 실제 로그 ID bigint를 반환하고 직원 역할을 요구한다", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /apply_stamp_log_operation_v2[\s\S]*?returns bigint/i);
  assert.match(sql, /v_log_id bigint/i);
  assert.match(sql, /oss_role in \('staff', 'admin', 'master'\)/i);
  assert.match(sql, /revoke all on function public\.apply_stamp_log_operation_v2[\s\S]*?from public, anon/i);
});

test("로그 삭제 RPC는 관리자/마스터 역할과 명시적 실행 권한을 요구한다", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /cancel_or_delete_log_operation[\s\S]*?oss_role in \('admin', 'master'\)/i);
  assert.match(sql, /revoke all on function public\.cancel_or_delete_log_operation\(text\) from public, anon/i);
  assert.match(sql, /grant execute on function public\.cancel_or_delete_log_operation\(text\) to authenticated/i);
});
