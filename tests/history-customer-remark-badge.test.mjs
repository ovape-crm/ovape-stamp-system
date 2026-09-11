import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const historyItem = await readFile(
  new URL(
    "../src/app/(auth)/histories/_components/StampHistories/StampHistoryItem.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("고객 특이사항 배지는 결제방식과 같은 크기와 글자색을 사용한다", () => {
  assert.match(
    historyItem,
    /flex h-7 w-full[^"]*bg-gray-100[^"]*text-gray-700[^"]*">\s*고객 특이사항/,
  );
});
