import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync('src/app/(auth)/work-journal/page.tsx', 'utf8');
const migration = readFileSync('supabase/migrations/20260922070000_payroll_other_expenses.sql', 'utf8');
const workerNameMemoMigration = readFileSync('supabase/migrations/20260922100000_add_worker_name_to_payroll_expense_note.sql', 'utf8');

test('월급 지급은 추가 기타 항목과 금액을 저장하고 합계에 반영한다', () => {
  assert.match(page, /카테고리 입력/);
  assert.match(page, /기타 추가/);
  assert.match(page, /otherExpenses/);
  assert.match(migration, /other_expenses jsonb/);
  assert.match(migration, /입력시간/);
  assert.match(migration, /총 근무 횟수/);
  assert.match(workerNameMemoMigration, /v_memo := v_worker \|\| ', 입력시간 '/);
});
