import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const inventoryPage = await readFile(
  new URL("../src/app/(auth)/inventory/InventoryPageContent.tsx", import.meta.url),
  "utf8",
);
const inventoryService = await readFile(
  new URL("../src/app/_domains/_inventory/_services/inventoryService.ts", import.meta.url),
  "utf8",
);
const settingsMigration = await readFile(
  new URL(
    "../supabase/migrations/20260921000000_inventory_movement_summary_settings.sql",
    import.meta.url,
  ),
  "utf8",
);

test("월간·연간 변동은 서버 집계 결과를 20개 품목 행씩 불러온다", () => {
  assert.match(inventoryPage, /getInventoryMovementSummary/);
  assert.match(inventoryPage, /limit: 20/);
  assert.match(inventoryPage, /summaryQuery\.fetchNextPage\(\)/);
  assert.match(inventoryPage, /더 불러오기/);
  assert.match(inventoryService, /export const getInventoryMovementSummary/);
  assert.match(inventoryService, /get_inventory_movement_summary/);
});

test("월간·연간 기본 구분은 공통 설정을 읽고 마스터만 바꾼다", () => {
  assert.match(inventoryPage, /queryKey: inventoryKeys\.movementSummarySettings/);
  assert.match(inventoryPage, /isMaster && <Dropdown\.Item/);
  assert.match(inventoryPage, /saveSummaryDefaultGroupMutation\.mutate/);
  assert.match(inventoryService, /getInventoryMovementSummaryDefaultGroup/);
  assert.match(inventoryService, /saveInventoryMovementSummaryDefaultGroup/);
  assert.match(settingsMigration, /oss_role = 'master'/);
  assert.match(settingsMigration, /authenticated users can read inventory movement summary settings/);
});

test("연도 선택은 2020년부터 2040년까지 제공한다", () => {
  assert.match(inventoryPage, /Array\.from\(\{ length: 21 \}, \(_, index\) => 2020 \+ index\)/);
});
