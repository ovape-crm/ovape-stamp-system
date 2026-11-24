import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL(
    "../supabase/migrations/20261124000000_link_renamed_inventory_items.sql",
    import.meta.url,
  ),
  "utf8",
);
const inventoryService = await readFile(
  new URL(
    "../src/app/_domains/_inventory/_services/inventoryService.ts",
    import.meta.url,
  ),
  "utf8",
);
const inventoryPage = await readFile(
  new URL(
    "../src/app/(auth)/inventory/InventoryPageContent.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("품목명 변경은 기존 재고명을 현재 품목 ID에 자동 연결한다", () => {
  assert.match(migration, /create or replace function public\.link_renamed_inventory_item/);
  assert.match(migration, /after update of item_name on public\.items/);
  assert.match(migration, /legacy_item_name[\s\S]*item_id[\s\S]*updated_by/);
  assert.match(migration, /normalize\(btrim\(old\.item_name\), NFC\)/);
  assert.match(migration, /new\.id/);
});

test("재사용된 과거 품목명은 다른 품목으로 덮어쓰지 않는다", () => {
  assert.match(migration, /on conflict \(legacy_item_name\) do update/);
  assert.match(
    migration,
    /where public\.inventory_renewal_item_links\.item_id = excluded\.item_id/,
  );
});

test("기존 이력은 하나의 품목 ID로 확정되는 과거 이름만 자동 연결한다", () => {
  assert.match(migration, /from public\.inventory_cost_events cost_event/);
  assert.match(migration, /jsonb_array_elements\(/);
  assert.match(migration, /line\.item ->> 'itemId'/);
  assert.match(migration, /having count\(distinct item_id\) = 1/);
  assert.match(migration, /on conflict \(legacy_item_name\) do nothing/);
});

test("기준일 재고도 과거 품목명을 현재 품목 ID로 합산한다", () => {
  assert.match(inventoryService, /aggregateInventorySnapshotsByItemId/);
  assert.match(inventoryService, /linkedItemIdsByLegacyName/);
  assert.match(inventoryPage, /aggregateInventorySnapshotsByItemId\(/);
  assert.match(inventoryPage, /snapshotsByItemId\.get\(item\.item_id\)/);
});
