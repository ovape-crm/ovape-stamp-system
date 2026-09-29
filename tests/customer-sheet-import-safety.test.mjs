import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const parser = fs.readFileSync("src/app/_domains/_customer/_utils/customerSheetPaste.ts", "utf8");
const review = fs.readFileSync("src/app/(auth)/customer-sheet-import/[batchId]/page.tsx", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260929030000_apply_customer_sheet_import_batch.sql", "utf8");

test("sheet paste locates a header below blank or guide rows and keeps wrapped product text", () => {
  assert.match(parser, /const headerIndex = lines\.findIndex/);
  assert.match(parser, /\["결제", "판매가", "금액"\]/);
  assert.match(parser, /itemName = `\$\{rows\.at\(-1\)!\.itemName\}/);
});

test("only explicit review selections can apply and source/existing history overlaps become duplicate", () => {
  assert.match(review, /applyCustomerSheetImportBatch/);
  assert.match(migration, /review_status in \('matched', 'new_customer', 'x_transfer'\)/);
  assert.match(migration, /review_status = 'duplicate'/);
  assert.match(migration, /customer_sheet_import_applied_fingerprints/);
});

test("historic sheet apply does not change inventory or stamps", () => {
  assert.doesNotMatch(migration, /inventory_/i);
  assert.doesNotMatch(migration, /insert into public\.stamps/i);
  assert.match(migration, /'no-stamp'/);
});
