create table if not exists public.work_journal_manual_payments (
  id uuid primary key default gen_random_uuid(),
  worker_name text not null check (length(trim(worker_name)) > 0),
  payroll_month date not null,
  payment_kind text not null check (payment_kind in ('advance', 'salary')),
  amount integer not null check (amount > 0),
  paid_on date not null check (paid_on < date '2026-08-01'),
  note text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists work_journal_manual_payments_paid_on_idx
  on public.work_journal_manual_payments (paid_on desc, created_at desc);

alter table public.work_journal_manual_payments enable row level security;

create policy "master manages manual payroll history"
  on public.work_journal_manual_payments
  for all to authenticated
  using (
    exists (
      select 1 from public.users
      where id = auth.uid() and oss_role = 'master'
    )
  )
  with check (
    exists (
      select 1 from public.users
      where id = auth.uid() and oss_role = 'master'
    )
  );
