import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('supabase/migrations/20260922080000_harden_required_system_notice_schedules.sql', 'utf8');

test('반복 공지는 한 번의 실행 잠금으로 중복 발송을 막고 실패를 기록한다', () => {
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /last_failed_at=now\(\), last_error=sqlerrm/);
  assert.match(migration, /valid_recipient_ids|v_recipient_ids/);
  assert.match(migration, /cron\.schedule/);
});
