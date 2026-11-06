import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const confirmModal = await readFile(
  new URL(
    "../src/app/(auth)/customers/_components/StampConfirmModal.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("시연용·재고조정 최종 확인은 상단 확인 없이 품목표를 즉시 표시한다", () => {
  assert.match(
    confirmModal,
    /const shouldShowFinalItemList =\s*hasAcknowledgedFinalSummary \|\|\s*customerMode === "demo" \|\|\s*customerMode === "adjustment"/,
  );
  assert.match(confirmModal, /showFinalItemList=\{shouldShowFinalItemList\}/);
});
