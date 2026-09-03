import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

// Execute the real TypeScript service with only the transport replaced.
const source = await readFile(
  new URL(
    "../src/app/_domains/_item/_services/itemService.ts",
    import.meta.url,
  ),
  "utf8",
);
const compiled = ts
  .transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  })
  .outputText.replace(
    'import supabase from "@/libs/supabaseClient";',
    "let supabase; export const setClient = client => { supabase = client; };",
  );
const service = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

function client(results) {
  const calls = [];
  return {
    calls,
    from(table) {
      const call = { table, operations: [] };
      calls.push(call);
      const chain = {
        then(resolve, reject) {
          return Promise.resolve(results[table]).then(resolve, reject);
        },
      };
      for (const method of ["select", "eq", "ilike", "order", "limit", "in"])
        chain[method] = (...args) => {
          call.operations.push([method, ...args]);
          return chain;
        };
      return chain;
    },
  };
}
test("출고 검색은 검색된 품목의 현재 재고를 한 번에 붙인다", async () => {
  const db = client({
    items: {
      data: [
        { id: "1", item_name: "품목 A" },
        { id: "2", item_name: "품목 B" },
      ],
    },
    inventory_balances: {
      data: [
        { item_name: "품목 A", quantity: 7 },
        { item_name: "품목 B", quantity: 0 },
      ],
    },
  });
  service.setClient(db);
  const items = await service.searchOutboundItems("품목");
  assert.deepEqual(
    items.map((i) => i.current_quantity),
    [7, 0],
  );
  assert.deepEqual(
    db.calls.map((c) => c.table),
    ["items", "inventory_balances"],
  );
  assert.deepEqual(db.calls[1].operations[1], [
    "in",
    "item_name",
    ["품목 A", "품목 B"],
  ]);
});
test("잔량 0·음수·재고행 없는 품목을 숨기거나 양수로 바꾸지 않는다", async () => {
  service.setClient(
    client({
      items: {
        data: [{ item_name: "A" }, { item_name: "B" }, { item_name: "C" }],
      },
      inventory_balances: {
        data: [
          { item_name: "A", quantity: 0 },
          { item_name: "B", quantity: -2 },
        ],
      },
    }),
  );
  assert.deepEqual(
    (await service.searchOutboundItems("A")).map((i) => i.current_quantity),
    [0, -2, 0],
  );
});
test("재고 조회 오류를 재고 0개나 빈 검색 결과로 바꾸지 않는다", async () => {
  service.setClient(
    client({
      items: { data: [{ item_name: "A" }] },
      inventory_balances: { data: null, error: { message: "network failure" } },
    }),
  );
  await assert.rejects(
    service.searchOutboundItems("A"),
    /재고 잔량을 불러오지 못했습니다/,
  );
});
test("빈 검색과 검색 결과가 없을 때 재고 조회를 하지 않는다", async () => {
  const db = client({ items: { data: [] } });
  service.setClient(db);
  assert.deepEqual(await service.searchOutboundItems("  "), []);
  assert.equal(db.calls.length, 0);
  assert.deepEqual(await service.searchOutboundItems("없음"), []);
  assert.equal(db.calls.length, 1);
});
test("품목 검색 실패는 그대로 오류 처리한다", async () => {
  const error = new Error("item search failed");
  const db = client({ items: { data: null, error } });
  service.setClient(db);
  await assert.rejects(service.searchOutboundItems("A"), /item search failed/);
  assert.equal(db.calls.length, 1);
});
