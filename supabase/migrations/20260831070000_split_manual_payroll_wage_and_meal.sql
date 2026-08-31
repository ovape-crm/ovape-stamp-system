alter table public.work_journal_manual_payments
  add column if not exists wage_amount integer not null default 0 check (wage_amount >= 0),
  add column if not exists meal_amount integer not null default 0 check (meal_amount >= 0);

alter table public.work_journal_manual_payments
  drop constraint if exists work_journal_manual_payments_amount_matches_parts;

alter table public.work_journal_manual_payments
  add constraint work_journal_manual_payments_amount_matches_parts
  check (amount = wage_amount + meal_amount);
