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
const afterServicesPage = await readFile(
  new URL("../src/app/(auth)/after-services/page.tsx", import.meta.url),
  "utf8",
);
const afterServiceService = await readFile(
  new URL("../src/app/_domains/_afterService/_services/afterService.ts", import.meta.url),
  "utf8",
);
const itemService = await readFile(
  new URL("../src/app/_domains/_item/_services/itemService.ts", import.meta.url),
  "utf8",
);
const zeroCostMigration = await readFile(
  new URL(
    "../supabase/migrations/20260911000000_allow_zero_cost_store_product_as_inbound.sql",
    import.meta.url,
  ),
  "utf8",
);
const missingCostMigration = await readFile(
  new URL(
    "../supabase/migrations/20260912000000_default_missing_store_product_as_cost_to_zero.sql",
    import.meta.url,
  ),
  "utf8",
);
test("매장제품 A/S는 원가를 수량 옆에 표시하고 별도 안내 문구를 보이지 않는다", () => {
  assert.match(
    createModal,
    /caseType === "vendor_exchange"[\s\S]*?FIFO 원가층 배정/,
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
  assert.doesNotMatch(
    createModal,
    /storeProductUnitCost <= 0/,
  );
  assert.match(zeroCostMigration, /p_unit_price < 0/);
  assert.match(zeroCostMigration, /unit_price is not null/);
  assert.match(
    missingCostMigration,
    /insert into public\.after_service_outbound_cost_allocations[\s\S]*?values \(p_after_service_id, null, 0, v_original_quantity\)/,
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
  assert.match(statusModal, /isInventoryServiceCase && Boolean\(outboundSupplierId\)/);
  assert.match(statusModal, /checked=\{isInventoryReceiptConfirmed\}[\s\S]*?disabled=\{isSubmitting\}/);
  assert.match(
    statusModal,
    /parsedReceiptQuantity > 0 &&[\s\S]*?\(isInventoryServiceCase \|\|/,
  );
  assert.match(
    statusModal,
    /serviceProgress\?\.remaining_quantity &&[\s\S]*?serviceProgress\.remaining_quantity > 0[\s\S]*?: undefined\) \?\?[\s\S]*?originalQuantity/,
  );
  assert.match(detailDrawer, /isInventoryServiceCase && values\.repairReceipt[\s\S]*?queryKey: \["inventory"\]/);
  assert.match(
    statusModal,
    /serviceCaseType === "store_product_as"[\s\S]*?REPAIR_RETURNED_COMPLETED/,
  );
});

test("매장제품 A/S와 업체 불량교환은 같은 재고 입고 처리 경로를 사용한다", () => {
  assert.match(
    detailDrawer,
    /if \(isInventoryServiceCase\) \{[\s\S]*?processInventoryServiceInbound/,
  );
  assert.match(
    statusModal,
    /serviceCaseType === "vendor_exchange" \|\|[\s\S]*?serviceCaseType === "store_product_as"/,
  );
});

test("일반 고객 A/S는 사용자가 선택한 일치 여부와 등록 거래처를 확인한다", () => {
  assert.match(
    statusModal,
    /receiptMatchType !== "" &&\s*\(isInventoryServiceCase \|\| hasRegisteredSupplier\)/,
  );
  assert.match(
    statusModal,
    /const canEditReceiptValues =\s*!editMode && receiptMatchType === "mismatch"/,
  );
  assert.doesNotMatch(
    statusModal,
    /parsedReceiptQuantity <= maximumReceiptQuantity! &&/,
  );
});

test("네 가지 A/S 접수 유형은 각 유형에 필요한 접수 정보만으로 다음 단계로 진행한다", () => {
  assert.match(
    createModal,
    /caseType === "vendor_exchange"[\s\S]*?Boolean\(selectedSupplierId\)[\s\S]*?costAllocations\.reduce/,
  );
  assert.match(
    createModal,
    /caseType === "store_product_as"[\s\S]*?receivedDate\.length > 0 && supplierSearch\.trim\(\)\.length > 0/,
  );
  assert.match(
    createModal,
    /caseType === "defective_return_as"[\s\S]*?receivedDate\.length > 0 && Boolean\(defectiveHoldId\)/,
  );
  assert.match(
    createModal,
    /purchaseDate\.length > 0[\s\S]*?supplierSearch\.trim\(\)\.length > 0/,
  );
});

test("업체 불량교환 도매처는 선택 제품의 입고 이력이 있는 거래처만 선택한다", () => {
  assert.match(
    createModal,
    /getItemPurchaseSupplierOptions/,
  );
  assert.match(afterServiceService, /get_item_purchase_supplier_options/);
  assert.match(afterServiceService, /get_item_purchase_cost_options_for_supplier/);
  assert.match(
    createModal,
    /caseType === "vendor_exchange" \? \([\s\S]*?선택한 제품의 입고 도매처를 선택하세요/,
  );
  assert.match(createModal, /selectedVendorSupplier\.name/);
  assert.match(
    createModal,
    /caseType !== "vendor_exchange" && isSupplierPickerOpen/,
  );
  assert.match(afterServicesPage, /getAfterServiceRegistrationErrorMessage/);
});

test("업체 불량교환 품목 검색은 현재 재고가 있는 품목만 허용한다", () => {
  assert.match(createModal, /caseType === "vendor_exchange"[\s\S]*?searchInStockItemOptions/);
  assert.match(itemService, /searchInStockItemOptions[\s\S]*?quantityByName\.get\(normalizeItemName\(item\.item_name\)\) \?\? 0\) > 0/);
  assert.match(itemService, /for \(let from = 0; options\.length < limit; from \+= pageSize\)/);
});

test("A/S 등록 실패는 Supabase 오류 객체의 코드와 메시지를 사용자에게 안내한다", () => {
  assert.match(afterServicesPage, /getAfterServiceRegistrationErrorMessage/);
  assert.match(afterServicesPage, /DEFECTIVE_HOLD_NOT_AVAILABLE/);
  assert.match(afterServicesPage, /INVALID_DEFECTIVE_RETURN_AS/);
  assert.match(afterServicesPage, /toast\.error\(getAfterServiceRegistrationErrorMessage\(err\)\)/);
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

test("고객 없는 업체 불량교환 수정은 문자열 null을 고객 ID로 저장하지 않는다", () => {
  assert.match(
    detailDrawer,
    /service_case_type === "vendor_exchange"[\s\S]*?customer_id\s*\?\s*String\(afterServiceDetail\.customer_id\)\s*:\s*null/,
  );
});
