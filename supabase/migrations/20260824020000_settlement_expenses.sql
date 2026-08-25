create table if not exists public.settlement_expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null,
  category text not null check (length(trim(category)) > 0),
  amount integer not null check (amount > 0),
  store text not null check (store in ('ovape', 'eguvape', 'common', 'other')),
  is_recurring boolean not null default false,
  note text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists settlement_expenses_date_idx
  on public.settlement_expenses (expense_date desc);

alter table public.settlement_expenses enable row level security;
grant select, insert, update, delete on public.settlement_expenses to authenticated;
revoke all on public.settlement_expenses from anon;

drop policy if exists "master manages settlement expenses" on public.settlement_expenses;
create policy "master manages settlement expenses"
on public.settlement_expenses for all to authenticated
using (
  exists (select 1 from public.users where id = auth.uid() and oss_role = 'master')
)
with check (
  created_by = auth.uid()
  and exists (select 1 from public.users where id = auth.uid() and oss_role = 'master')
);
