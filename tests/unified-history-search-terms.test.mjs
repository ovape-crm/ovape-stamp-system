import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const customerHistoryPath = new URL(
  "../src/app/(auth)/customers/[id]/page.tsx",
  import.meta.url,
);
const migrationPath = new URL(
  "../supabase/migrations/20260929020000_history_search_all_terms.sql",
  import.meta.url,
);

test("unified customer history matches every space-separated search term", async () => {
  const source = await readFile(customerHistoryPath, "utf8");
  const entry = "잽쥬스 알로에베라 30ml 2병 (니코틴 2방울)";
  const terms = "잽쥬스 니코".split(/\s+/);

  assert.equal(terms.every((term) => entry.includes(term)), true);
  assert.match(source, /historySearchTerms\.every\(\(term\) =>/);
});

test("global unified history uses the same all-terms database search", async () => {
  const source = await readFile(migrationPath, "utf8");

  assert.match(source, /regexp_split_to_table\(btrim\(coalesce\(p_keyword, ''\)\), '\\s\+'\)/);
  assert.match(source, /searchable_content not ilike '%' \|\| search_term \|\| '%'/);
});
