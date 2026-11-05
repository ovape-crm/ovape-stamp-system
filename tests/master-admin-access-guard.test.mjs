import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { resolve } from "node:path";

const masterAccessMigration = resolve(
  "supabase/migrations/20261105010000_allow_master_to_cancel_daily_closing_report.sql",
);

test("마감 취소 RPC는 관리자와 마스터 모두 과거 마감을 취소할 수 있다", async () => {
  const sql = await readFile(masterAccessMigration, "utf8");

  assert.match(sql, /users\.oss_role in \('admin', 'master'\)/i);
  assert.match(sql, /if not v_has_admin_access and p_business_date <> v_today/i);
});
