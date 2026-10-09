import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const saveVerificationMigration = await readFile(
  new URL(
    "../supabase/migrations/20261003010000_fix_daily_closing_transfer_verification_comparison.sql",
    import.meta.url,
  ),
  "utf8",
);
const invalidationMigration = await readFile(
  new URL(
    "../supabase/migrations/20261009000000_reverify_transfer_after_payer_change.sql",
    import.meta.url,
  ),
  "utf8",
);

test("스태프·어드민·마스터 모두 이체 확인을 저장할 수 있다", () => {
  assert.match(
    saveVerificationMigration,
    /if auth\.uid\(\) is null then raise exception 'AUTH_REQUIRED'; end if;/,
  );
  assert.doesNotMatch(saveVerificationMigration, /oss_role|has_admin_access/i);
  assert.match(
    saveVerificationMigration,
    /grant execute on function public\.save_daily_closing_transfer_verification\(date, jsonb\) to authenticated;/,
  );
});

test("이체자 정보 변경 무효화는 역할별 이체 목록 재조회에 의존하지 않는다", () => {
  assert.match(
    invalidationMigration,
    /after update of jsonb on public\.logs/,
  );
  assert.match(
    invalidationMigration,
    /delete from public\.daily_closing_transfer_verifications/,
  );
  assert.doesNotMatch(invalidationMigration, /with payment_rows|jsonb_array_elements/i);
  assert.doesNotMatch(invalidationMigration, /oss_role|has_admin_access/i);
});
