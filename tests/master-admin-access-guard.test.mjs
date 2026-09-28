import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";
import { resolve } from "node:path";

const migrationDirectory = resolve("supabase/migrations");
const guardStartMigration = "20260928000000";
const adminOnlyRoleCheck = /oss_role\s*=\s*'admin'|oss_role\s*=\s*"admin"/i;

test("새 DB 마이그레이션은 마스터를 관리자 권한에서 제외하지 않는다", async () => {
  const migrationNames = (await readdir(migrationDirectory))
    .filter(
      (name) =>
        name.endsWith(".sql") && name.slice(0, 14) >= guardStartMigration,
    )
    .sort();

  const violations = [];
  for (const migrationName of migrationNames) {
    const sql = await readFile(resolve(migrationDirectory, migrationName), "utf8");
    if (adminOnlyRoleCheck.test(sql)) violations.push(migrationName);
  }

  assert.deepEqual(
    violations,
    [],
    `관리자 공통 기능은 public.has_admin_access() 또는 oss_role in ('admin', 'master')를 사용해야 합니다: ${violations.join(", ")}`,
  );
});
