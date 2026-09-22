import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

let db;

before(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select '00000000-0000-0000-0000-000000000001'::uuid $$;
    create table public.users (id uuid primary key, oss_role text not null);
    create table public.work_journals (id uuid primary key, worker_name text not null, work_date date not null, input_work_hours numeric, payment_status text not null, paid_at timestamptz, paid_by uuid, payroll_batch_id uuid, updated_at timestamptz);
    create table public.settlement_expense_categories (id uuid primary key default gen_random_uuid(), name text unique not null, is_active boolean not null);
    create table public.settlement_expenses (id uuid primary key default gen_random_uuid(), expense_date date, category text, category_id uuid, amount integer, store text, is_recurring boolean, note text, created_by uuid);
    create table public.work_journal_payroll_batches (id uuid primary key default gen_random_uuid(), worker_name text, payroll_month date, payment_kind text, hourly_rate integer, meal_allowance integer, work_hours numeric, work_count integer, other_expenses jsonb, amount integer, expense_id uuid, paid_on date, created_by uuid);
    insert into public.users values ('00000000-0000-0000-0000-000000000001', 'master');
    insert into public.work_journals (id, worker_name, work_date, input_work_hours, payment_status) values
      ('00000000-0000-0000-0000-000000000101', '김동연', '2026-09-20', 11, 'unpaid'),
      ('00000000-0000-0000-0000-000000000102', '김동연', '2026-09-21', 11, 'unpaid');
  `);
  await db.exec(await readFile(new URL("../supabase/migrations/20260922100000_add_worker_name_to_payroll_expense_note.sql", import.meta.url), "utf8"));
});

after(async () => db.close());

test("급여 기타비용 DB 함수는 근무자 이름·카테고리별 금액을 메모와 합계에 반영한다", async () => {
  const { rows } = await db.query(`
    select * from public.process_work_journal_payroll(
      array['00000000-0000-0000-0000-000000000101'::uuid, '00000000-0000-0000-0000-000000000102'::uuid],
      'salary', 12222, 55555, '2026-09-22', null,
      '[{"name":"d아아","amount":10000},{"name":"이이","amount":20000}]'::jsonb
    )
  `);

  assert.equal(Number(rows[0].amount), 407574);
  assert.equal(rows[0].memo, "김동연, 입력시간 22시간, 시급 12,222원, 총 근무 횟수 2회, 식대 111,110원, d아아 10,000원, 이이 20,000원 = 총 407,574원");

  const { rows: expenses } = await db.query("select amount, note from public.settlement_expenses");
  assert.deepEqual(expenses, [{ amount: 407574, note: rows[0].memo }]);
});
