import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const roleUtilityPath = new URL(
  "../src/app/_domains/_user/_utils/userRole.ts",
  import.meta.url,
);
const userContextPath = new URL(
  "../src/app/_contexts/UserContext.tsx",
  import.meta.url,
);

test("master inherits every admin-level UI permission", async () => {
  const [roleUtility, userContext] = await Promise.all([
    readFile(roleUtilityPath, "utf8"),
    readFile(userContextPath, "utf8"),
  ]);

  assert.match(
    roleUtility,
    /role === "admin" \|\| role === "master"/,
  );
  assert.match(userContext, /setIsAdmin\(hasAdminAccess\(resolvedUser\.oss_role\)\);/);
});
