import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const createModal = await readFile(
  new URL(
    "../src/app/(auth)/after-services/_components/AfterServiceCreateModal.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("매장제품 A/S에는 매입 이력 자동 배분 안내를 표시하지 않는다", () => {
  assert.match(
    createModal,
    /caseType === "vendor_exchange"[\s\S]*?기존 매입 이력에서 원가가 자동 배분됩니다/,
  );
  assert.match(
    createModal,
    /caseType === "store_product_as"[\s\S]*?매입 이력이나 매장 재고를 사용하지 않습니다/,
  );
  assert.doesNotMatch(
    createModal,
    /caseType !== "customer_as" && itemNameKeyword\.trim\(\)/,
  );
});
