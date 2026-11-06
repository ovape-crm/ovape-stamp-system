import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const inventoryService = await readFile(
  new URL("../src/app/_domains/_inventory/_services/inventoryService.ts", import.meta.url),
  "utf8",
);

test("구글시트 과거 이력 재고 보정은 재고 변동 목록과 건수에서 숨긴다", () => {
  const hiddenRepairFilter =
    /reference_type\.neq\.historical_sheet_import_repair,reference_type\.is\.null/g;
  assert.equal(
    [...inventoryService.matchAll(hiddenRepairFilter)].length,
    2,
  );
});
