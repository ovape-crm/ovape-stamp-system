import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("성인인증 링크 생성 API는 Buly와 가까운 서울 리전에서 실행된다", async () => {
  const deployment = JSON.parse(
    await readFile(new URL("../vercel.json", import.meta.url), "utf8"),
  );
  const shortener = await readFile(
    new URL(
      "../src/app/_domains/_adultVerification/shortenVerificationUrl.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.deepEqual(
    deployment.functions["src/app/api/adult-verification/requests/route.ts"]
      .regions,
    ["icn1"],
  );
  assert.match(shortener, /BULY_REQUEST_TIMEOUT_MS = 5_000/);
});
