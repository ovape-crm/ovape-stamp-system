import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const servicePath = new URL(
  "../src/app/_domains/_inventory/_services/inventoryService.ts",
  import.meta.url,
);
const pagePath = new URL(
  "../src/app/(auth)/inventory/InventoryPageContent.tsx",
  import.meta.url,
);

test("fallback purchase-order history preserves saved adjustment rows", async () => {
  const source = await readFile(servicePath, "utf8");

  assert.match(source, /const attachPurchaseOrderAdjustments = async/);
  assert.match(source, /await attachPurchaseOrderAdjustments\(/);
  assert.doesNotMatch(
    source,
    /inventory_purchase_order_adjustments:\s*\[\],/,
  );
});

test("master account can see adjustments on purchase-order history cards", async () => {
  const source = await readFile(pagePath, "utf8");

  assert.match(source, /const canViewAdjustments = isAdmin \|\| isMaster;/);
  assert.match(source, /\{canViewAdjustments &&\s*adjustments\.map/);
});
