import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../src/libs/authSessionRecovery.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { isInvalidRefreshTokenError, recoverSession } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

const session = (expiresAt, refreshToken = "refresh-token") => ({
  access_token: "access-token",
  refresh_token: refreshToken,
  expires_in: 3600,
  expires_at: expiresAt,
  token_type: "bearer",
  user: { id: "user-id" },
});

test("폐기된 refresh token은 로그아웃 API 없이 저장 세션을 즉시 제거한다", async () => {
  const removed = [];
  let refreshCalls = 0;
  let invalidNotifications = 0;
  const result = await recoverSession({
    auth: {
      getSession: async () => ({
        data: { session: session(100) },
        error: null,
      }),
      refreshSession: async () => {
        refreshCalls += 1;
        return {
          data: { session: null },
          error: { message: "Invalid Refresh Token: Refresh Token Not Found" },
        };
      },
    },
    storage: { removeItem: (key) => removed.push(key) },
    storageKey: "sb-project-auth-token",
    onInvalidSession: () => {
      invalidNotifications += 1;
    },
    now: 100_000,
  });

  assert.deepEqual(result, { session: null, recovered: true });
  assert.equal(refreshCalls, 1);
  assert.deepEqual(removed, [
    "sb-project-auth-token",
    "sb-project-auth-token-user",
  ]);
  assert.equal(invalidNotifications, 1);
});

test("유효 세션은 갱신하지 않고, 만료 임박 세션은 한 번만 갱신한다", async () => {
  for (const [expiresAt, expectedRefreshes] of [
    [200, 0],
    [120, 1],
  ]) {
    let refreshCalls = 0;
    const original = session(expiresAt);
    const refreshed = session(500, "new-refresh-token");
    const result = await recoverSession({
      auth: {
        getSession: async () => ({ data: { session: original }, error: null }),
        refreshSession: async () => {
          refreshCalls += 1;
          return { data: { session: refreshed }, error: null };
        },
      },
      storage: { removeItem: () => assert.fail("must not clear storage") },
      storageKey: "auth",
      now: 100_000,
    });
    assert.equal(refreshCalls, expectedRefreshes);
    assert.equal(result.session, expectedRefreshes ? refreshed : original);
  }
});

test("네트워크 오류는 만료 토큰으로 오인해 삭제하지 않는다", async () => {
  const networkError = new Error("Failed to fetch");
  await assert.rejects(
    recoverSession({
      auth: {
        getSession: async () => ({ data: { session: null }, error: networkError }),
        refreshSession: async () => assert.fail("must not refresh"),
      },
      storage: { removeItem: () => assert.fail("must not clear storage") },
      storageKey: "auth",
    }),
    networkError,
  );
  assert.equal(isInvalidRefreshTokenError(networkError), false);
});
