import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const customersPage = await readFile(
  new URL("../src/app/(auth)/customers/page.tsx", import.meta.url),
  "utf8",
);
const customerDetail = await readFile(
  new URL("../src/app/(auth)/customers/[id]/page.tsx", import.meta.url),
  "utf8",
);
const rlsMigration = await readFile(
  new URL(
    "../supabase/migrations/20260903020000_master_only_inventory_adjustment_log_visibility.sql",
    import.meta.url,
  ),
  "utf8",
);
const summaryMigration = await readFile(
  new URL(
    "../supabase/migrations/20260904010000_inventory_adjustment_safe_summaries.sql",
    import.meta.url,
  ),
  "utf8",
);
const historyRowsMigration = await readFile(
  new URL(
    "../supabase/migrations/20260904020000_inventory_adjustment_history_rows.sql",
    import.meta.url,
  ),
  "utf8",
);
const historyItem = await readFile(
  new URL(
    "../src/app/(auth)/histories/_components/StampHistories/StampHistoryItem.tsx",
    import.meta.url,
  ),
  "utf8",
);
const histories = await readFile(
  new URL(
    "../src/app/(auth)/histories/_components/StampHistories/index.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("스태프에게 재고조정 바로가기는 보이되 상세 진입은 잠근다", () => {
  assert.match(customersPage, /🔒 재고조정 · 상세 조회 제한/);
  assert.match(
    customersPage,
    /definition\.key === "adjustment"[\s\S]*?user\?\.oss_role !== "master"/,
  );
  assert.match(customersPage, /!customer \|\| isLockedAdjustment/);
});

test("URL 직접 접근과 DB 직접 조회도 마스터 이외에는 차단한다", () => {
  assert.match(
    customerDetail,
    /customer\.name\.trim\(\) === "재고조정" && user\?\.oss_role !== "master"/,
  );
  assert.match(rlsMigration, /as restrictive/i);
  assert.match(rlsMigration, /app_user\.oss_role = 'master'/i);
});

test("기존 요약 RPC는 민감한 상세 필드를 반환하지 않는다", () => {
  assert.match(summaryMigration, /returns table \([\s\S]*?log_id bigint,[\s\S]*?occurred_at timestamptz,[\s\S]*?actor_name text[\s\S]*?\)/i);
  assert.doesNotMatch(
    summaryMigration.match(/returns table \([\s\S]*?\)\s*language/i)?.[0] ?? "",
    /jsonb|note|quantity|amount|item_name/i,
  );
  assert.match(summaryMigration, /oss_role in \('staff', 'admin', 'master'\)/i);
  assert.match(summaryMigration, /revoke all[\s\S]*?from public, anon/i);
  assert.doesNotMatch(histories, /summary\.(?:jsonb|note|quantity|amount|item_name)/);
});

test("재고조정은 기존 이력 내용으로 표시하되 상세 동작을 잠근다", () => {
  assert.match(historyRowsMigration, /get_inventory_adjustment_logs_for_history/i);
  assert.match(historyRowsMigration, /'action',[\s\S]*?'note',[\s\S]*?'jsonb'/i);
  assert.match(historyRowsMigration, /security definer/i);
  assert.match(historyRowsMigration, /oss_role in \('staff', 'admin', 'master'\)/i);
  assert.match(histories, /history\.kind === "log"/);
  assert.match(histories, /<StampHistoryItem[\s\S]*?isLocked/);
  assert.match(historyItem, /disabled=\{isLocked\}/);
  assert.match(historyItem, /showCopy && !isLocked/);
  assert.match(historyItem, /isAdmin && !isLocked/);
  assert.match(historyItem, /🔒 열람 제한/);
});
