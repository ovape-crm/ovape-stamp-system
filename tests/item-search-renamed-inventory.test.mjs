import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const quantityService = await readFile(
  new URL(
    "../src/app/_domains/_inventory/_services/inventoryItemQuantityService.ts",
    import.meta.url,
  ),
  "utf8",
);
const productSearchService = await readFile(
  new URL(
    "../src/app/_domains/_item/_services/productSearchService.ts",
    import.meta.url,
  ),
  "utf8",
);
const itemService = await readFile(
  new URL(
    "../src/app/_domains/_item/_services/itemService.ts",
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

test("품목 검색 재고는 현재 품목 ID와 과거 재고명 연결을 함께 조회한다", () => {
  assert.match(quantityService, /inventory_renewal_item_links/);
  assert.match(quantityService, /\.in\("item_id", itemIdBatch\)/);
  assert.match(quantityService, /chunk\(itemIds\)/);
  assert.match(quantityService, /chunk\(\[\.\.\.itemIdByName\.keys\(\)\]\)/);
  assert.match(quantityService, /quantitiesByItemId\.set/);
});

test("상품검색과 입출고 품목 검색은 공통 ID 기준 재고 조회를 사용한다", () => {
  assert.match(productSearchService, /getInventoryQuantitiesByItemId/);
  assert.match(productSearchService, /quantityByItemId\.get\(String\(item\.id\)\)/);
  assert.match(itemService, /getInventoryQuantitiesByItemId\(items\)/);
  assert.match(itemService, /quantityByItemId\.get\(String\(item\.id\)\)/);
});

test("입고 등록 품목 추가는 연결된 재고 개요 수량을 표시한다", () => {
  assert.match(inventoryPage, /const renewalItemsQuery = useQuery\(/);
  assert.match(inventoryPage, /queryKey: \[\.\.\.inventoryKeys\.overview, "renewal"\]/);
  assert.match(inventoryPage, /renewalItemsQuery\.data\?\.items \?\? allItems/);
});
