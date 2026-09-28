import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

let db;

before(async () => {
  db = new PGlite();
  await db.exec(`
    create table public.work_journals (
      id uuid primary key,
      status text not null,
      input_work_hours numeric,
      payment_status text not null default 'unpaid'
    );
  `);
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20260928000000_require_input_work_hours_for_completed_work.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
});

after(async () => db.close());

test("종료된 근무기록은 입력 근무시간 없이는 저장할 수 없다", async () => {
  await assert.rejects(
    db.exec(`
      insert into public.work_journals (id, status, payment_status)
      values ('00000000-0000-0000-0000-000000000001', 'closed', 'unpaid');
    `),
    /work_journals_completed_input_work_hours_required/,
  );

  await db.exec(`
    insert into public.work_journals (id, status, payment_status)
    values ('00000000-0000-0000-0000-000000000002', 'working', 'unpaid');
  `);
});

test("입력 근무시간 없는 기록은 급여 지급 처리할 수 없다", async () => {
  await assert.rejects(
    db.exec(`
      update public.work_journals
      set payment_status = 'salary'
      where id = '00000000-0000-0000-0000-000000000002';
    `),
    /INPUT_WORK_HOURS_REQUIRED/,
  );
});
