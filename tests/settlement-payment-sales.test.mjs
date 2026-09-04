import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../src/app/_domains/_settlement/_utils/paymentSales.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { aggregatePaymentSales } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

const liveRange = {
  start: "2026-09-01T00:00:00+09:00",
  end: "2026-10-01T00:00:00+09:00",
};

test("분할결제는 결제수단과 매장별로 각각 한 번씩 합산된다", () => {
  const sales = aggregatePaymentSales({
    liveRange,
    logs: [
      {
        created_at: "2026-09-04T10:00:00+09:00",
        jsonb: {
          payments: [
            { paymentType: "card", amount: 7000 },
            { paymentType: "cash", amount: 3000 },
            { paymentType: "egu_card", amount: 5000 },
          ],
        },
      },
    ],
    historicalSales: [],
  });
  assert.deepEqual(sales, {
    ovape: { card: 7000, cash: 3000 },
    eguvape: { card: 5000 },
  });
});

test("단일결제·과거매출은 호환되고 메모 및 조회기간 밖 로그는 제외된다", () => {
  const sales = aggregatePaymentSales({
    liveRange,
    logs: [
      {
        created_at: "2026-09-04T10:00:00+09:00",
        jsonb: { paymentType: "transfer", totalAmount: 12000 },
      },
      {
        created_at: "2026-09-04T11:00:00+09:00",
        jsonb: { paymentType: "remark", totalAmount: 99999 },
      },
      {
        created_at: "2026-10-01T00:00:00+09:00",
        jsonb: { paymentType: "cash", totalAmount: 50000 },
      },
    ],
    historicalSales: [
      { store: "eguvape", payment_type: "cash", sales_amount: 4000 },
      { store: "ovape", payment_type: "card", sales_amount: 6000 },
    ],
  });
  assert.deepEqual(sales, {
    ovape: { transfer: 12000, card: 6000 },
    eguvape: { cash: 4000 },
  });
});
