import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const service = await readFile(
  new URL('../src/app/_domains/_log/_services/logService.ts', import.meta.url),
  'utf8',
);
const migration = await readFile(
  new URL('../supabase/migrations/20260909050000_expand_unified_history_search.sql', import.meta.url),
  'utf8',
);

test('통합 이력 검색은 고객 정보와 로그 상세 JSON을 함께 검색한다', () => {
  assert.match(service, /search_history_log_ids/);
  assert.match(service, /query\.in\("id", matchedIds\)/);
  assert.match(migration, /customer\.name/);
  assert.match(migration, /customer\.phone/);
  assert.match(migration, /customer\.address/);
  assert.match(migration, /customer\.note/);
  assert.match(migration, /log\.jsonb::text/);
  assert.match(migration, /when 'male' then '남자'/);
  assert.match(migration, /when customer\.is_stamp_eligible is false then '미적립'/);
});
