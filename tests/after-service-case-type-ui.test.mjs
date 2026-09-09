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
const detailDrawer = await readFile(
  new URL(
    "../src/app/(auth)/after-services/_components/AfterServiceDetailDrawer/index.tsx",
    import.meta.url,
  ),
  "utf8",
);
const statusModal = await readFile(
  new URL(
    "../src/app/(auth)/after-services/_components/AfterServiceDetailDrawer/StatusUpdateModal.tsx",
    import.meta.url,
  ),
  "utf8",
);
test("매장제품 A/S는 원가를 수량 옆에 표시하고 별도 안내 문구를 보이지 않는다", () => {
  assert.match(
    createModal,
    /caseType === "vendor_exchange"[\s\S]*?매입 원가층 배정/,
  );
  assert.match(createModal, /grid grid-cols-2 gap-3/);
  assert.match(createModal, /A\/S 원가/);
  assert.doesNotMatch(createModal, /매입 이력이나 매장 재고를 사용하지 않습니다/);
  assert.match(createModal, /caseType !== "customer_as"[\s\S]*?매장접수일/);
});

test("매장제품 A/S는 출고 확정 없이 원가 입력 후 수리 입고를 처리한다", () => {
  assert.match(detailDrawer, /requiresOutboundConfirmation/);
  assert.match(
    detailDrawer,
    /requiresOutboundConfirmation && !afterServiceDetail\.outbound_processed_at/,
  );
  assert.match(
    detailDrawer,
    /afterServiceDetail\?\.service_case_type === "store_product_as" \|\|[\s\S]*?afterServiceDetail\.status === AfterServiceStatusEnum\.SENT_FOR_REPAIR\.value/,
  );
  assert.match(
    detailDrawer,
    /if \(requiresOutboundConfirmation && !afterServiceDetail\.outbound_processed_at\)/,
  );
  assert.doesNotMatch(
    detailDrawer,
    /if \(isInventoryServiceCase && !afterServiceDetail\.outbound_processed_at\)/,
  );
  assert.match(detailDrawer, /afterServiceDetail\.service_case_type !== "store_product_as"/);
  assert.match(statusModal, /"수리 입고 \(재고처리\)"/);
  assert.match(
    statusModal,
    /serviceCaseType === "store_product_as"[\s\S]*?REPAIR_RETURNED_COMPLETED/,
  );
});

test("업체 교환출고 수정은 특수계정 연결과 출고 원가를 보존한다", () => {
  assert.match(
    createModal,
    /isVendorExchangeInventoryLocked[\s\S]*?readOnly=\{isVendorExchangeInventoryLocked\}/,
  );
  assert.match(
    detailDrawer,
    /service_case_type === "vendor_exchange"[\s\S]*?String\(afterServiceDetail\.customer_id\)/,
  );
});
