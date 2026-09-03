import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/app/(auth)/settlement/_components/serviceCostAssessment.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { assessServiceCost, serviceCostFormula } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const candidate = (q, price, eligible = true) => ({ available_quantity: q, unit_cost: price, eligible });
const context = (quantity, candidates, event_at = "2026-08-08T00:00:00+09:00") => ({ quantity, candidates, event_at });

test("split costs with exact quantities produce a review, not a saved allocation", () => {
  const result = assessServiceCost(context(59, [candidate(9, 660), candidate(50, 550)]));
  assert.equal(result.canPrepare, true);
  assert.equal(serviceCostFormula(result.sources.map(c => ({ quantity: c.available_quantity, unit_cost: c.unit_cost }))), "9개 × 660원 + 50개 × 550원 = 33,440원");
});
test("shortage reports the exact missing quantity", () => {
  const result = assessServiceCost(context(2, [candidate(1, 2000)]));
  assert.equal(result.canPrepare, false);
  assert.match(result.reason, /1개 부족/);
});
test("surplus shared sources cannot become an arbitrary recommendation", () => {
  assert.equal(assessServiceCost(context(1, [candidate(4, 2750), candidate(3, 3080)])).canPrepare, false);
});
test("future sources and quantities already attributed elsewhere are excluded", () => {
  const result = assessServiceCost(context(1, [candidate(5, 2000, false), candidate(0, 2000)]));
  assert.equal(result.quantity, 0);
  assert.equal(result.canPrepare, false);
});
test("historical rows never use the live opening queue", () => {
  assert.equal(assessServiceCost(context(1, [candidate(1, 2000)], "2026-07-21T23:59:59+09:00")).canPrepare, false);
});
test("zero and unknown cost require evidence; unknown is not formatted as zero", () => {
  for (const price of [null, 0]) assert.equal(assessServiceCost(context(1, [candidate(1, price)])).status, "단가 확인 필요");
  assert.equal(serviceCostFormula([{ quantity: 1, unit_cost: null }]), "1개 × 미확정 = 미확정");
  assert.equal(serviceCostFormula([]), "원가 미확정");
});
