import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const logService = await readFile(
  new URL("../src/app/_domains/_log/_services/logService.ts", import.meta.url),
  "utf8",
);
const unifiedHistory = await readFile(
  new URL("../src/app/(auth)/histories/_components/StampHistories/index.tsx", import.meta.url),
  "utf8",
);
const customerHistory = await readFile(
  new URL(
    "../src/app/(auth)/customers/[id]/_components/CustomersDetailStampsHistories/index.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("이력 관리 RPC의 table 반환값에서 변경된 한 건을 추출한다", () => {
  assert.match(logService, /const updated = data\?\.\[0\]/);
  assert.match(logService, /return updated as/);
});

test("이력 관리 저장 후 통합·고객 이력 캐시를 즉시 갱신한다", () => {
  for (const source of [unifiedHistory, customerHistory]) {
    assert.match(source, /invalidateQueries\(\{ queryKey: logKeys\.all\(\) \}\)/);
    assert.match(source, /invalidateQueries\(\{ queryKey: customerKeys\.all\(\) \}\)/);
  }
});

test("로그 삭제 뒤 RPC가 반환한 총 스탬프를 고객 상세 캐시에 즉시 반영한다", () => {
  for (const source of [unifiedHistory, customerHistory]) {
    assert.match(source, /const \{ deletedLogIds, stampCount \} = await deleteLog\(log\.id\)/);
    assert.match(source, /if \(stampCount !== undefined\)/);
    assert.match(source, /stamps: \[\{ count: stampCount \}\]/);
  }
});

test("DB 숫자 ID와 URL 문자열 ID가 달라도 고객 상세 캐시 키를 문자열로 통일한다", async () => {
  const customerPage = await readFile(
    new URL("../src/app/(auth)/customers/[id]/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(customerPage, /id: customerId/);
  assert.match(unifiedHistory, /const customerId = String\(log\.customer_id\)/);
});
