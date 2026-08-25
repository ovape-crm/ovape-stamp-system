create table if not exists public.settlement_expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),
  is_active boolean not null default true,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.settlement_expense_categories enable row level security;
grant select, insert, update on public.settlement_expense_categories to authenticated;
revoke all on public.settlement_expense_categories from anon;

drop policy if exists "master manages settlement expense categories" on public.settlement_expense_categories;
create policy "master manages settlement expense categories"
on public.settlement_expense_categories for all to authenticated
using (exists (select 1 from public.users where id = auth.uid() and oss_role = 'master'))
with check (created_by = auth.uid() and exists (select 1 from public.users where id = auth.uid() and oss_role = 'master'));

alter table public.settlement_expenses
  add column if not exists category_id uuid references public.settlement_expense_categories(id),
  add column if not exists recurrence_day smallint check (recurrence_day between 1 and 31),
  add column if not exists recurrence_end_date date,
  add column if not exists recurrence_cancelled_on date;

update public.settlement_expenses
set recurrence_day = extract(day from expense_date)::smallint
where is_recurring = true and recurrence_day is null;
