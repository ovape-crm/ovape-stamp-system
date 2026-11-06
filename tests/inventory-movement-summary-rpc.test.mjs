import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/20261106020000_server_side_inventory_movement_summary.sql", import.meta.url),
  "utf8",
);
const page = await readFile(
  new URL("../src/app/(auth)/inventory/InventoryPageContent.tsx", import.meta.url),
  "utf8",
);

test("재고 변동 집계는 DB에서 날짜·품목·입출고별로 합산하고 시스템 보정 행을 제외한다", () => {
  assert.match(migration, /create or replace function public\.get_inventory_movement_summary/);
  assert.match(migration, /group by item_name, direction, movement_date/);
  assert.match(migration, /historical_sheet_import_repair/);
  assert.match(migration, /sum\(daily_quantity\)::integer as total_quantity/);
  assert.match(migration, /offset greatest\(p_offset, 0\)/);
  assert.match(migration, /limit least\(greatest\(p_limit, 1\), 100\)/);
});

test("월간·연간 집계 오류는 원인을 표시하고 다시 조회할 수 있다", () => {
  assert.match(page, /summaryQuery\.error instanceof Error/);
  assert.match(page, /summaryQuery\.refetch\(\)/);
});
