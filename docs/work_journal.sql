-- Supabase SQL Editor에서 한 번 실행하세요.
create extension if not exists pgcrypto;

create table if not exists public.work_journals (
  id uuid primary key default gen_random_uuid(),
  work_date date not null,
  worker_name text not null check (length(trim(worker_name)) > 0),
  start_time time not null,
  end_time time not null,
  work_hours numeric(5, 2) not null check (work_hours > 0 and work_hours <= 24),
  note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_journals_date_worker_unique unique (work_date, worker_name)
);

alter table public.work_journals enable row level security;

drop policy if exists "authenticated users can read work journals"
  on public.work_journals;
create policy "authenticated users can read work journals"
  on public.work_journals for select
  to authenticated using (true);

drop policy if exists "authenticated users can insert work journals"
  on public.work_journals;
create policy "authenticated users can insert work journals"
  on public.work_journals for insert
  to authenticated with check (created_by = auth.uid());

drop policy if exists "authenticated users can update work journals"
  on public.work_journals;
create policy "authenticated users can update work journals"
  on public.work_journals for update
  to authenticated using (true) with check (true);

drop policy if exists "authenticated users can delete work journals"
  on public.work_journals;
drop policy if exists "admins can delete work journals"
  on public.work_journals;
create policy "admins can delete work journals"
  on public.work_journals for delete
  to authenticated using (
    exists (
      select 1 from public.users
      where users.id = auth.uid() and users.oss_role = 'admin'
    )
  );

create index if not exists work_journals_work_date_idx
  on public.work_journals (work_date desc);
create index if not exists work_journals_worker_name_idx
  on public.work_journals (worker_name);

-- 근무자 이름만 미리 등록하는 명단
create table if not exists public.work_journal_workers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.work_journal_workers enable row level security;

drop policy if exists "authenticated users can read workers"
  on public.work_journal_workers;
create policy "authenticated users can read workers"
  on public.work_journal_workers for select
  to authenticated using (true);

drop policy if exists "authenticated users can insert workers"
  on public.work_journal_workers;
drop policy if exists "admins can insert workers"
  on public.work_journal_workers;
create policy "admins can insert workers"
  on public.work_journal_workers for insert
  to authenticated with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.users
      where users.id = auth.uid() and users.oss_role = 'admin'
    )
  );

drop policy if exists "authenticated users can update workers"
  on public.work_journal_workers;
drop policy if exists "admins can update workers"
  on public.work_journal_workers;
create policy "admins can update workers"
  on public.work_journal_workers for update
  to authenticated
  using (
    exists (
      select 1 from public.users
      where users.id = auth.uid() and users.oss_role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.users
      where users.id = auth.uid() and users.oss_role = 'admin'
    )
  );

-- 전화번호·계좌번호 등 개인정보는 이름 명단과 분리합니다.
create table if not exists public.work_journal_worker_private (
  worker_id uuid primary key references public.work_journal_workers(id) on delete cascade,
  phone_number text not null default '',
  bank_account text not null default '',
  first_work_date date not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.work_journal_worker_private enable row level security;

drop policy if exists "admins can read worker private details"
  on public.work_journal_worker_private;
create policy "admins can read worker private details"
  on public.work_journal_worker_private for select
  to authenticated using (
    exists (
      select 1 from public.users
      where users.id = auth.uid() and users.oss_role = 'admin'
    )
  );

drop policy if exists "admins can insert worker private details"
  on public.work_journal_worker_private;
create policy "admins can insert worker private details"
  on public.work_journal_worker_private for insert
  to authenticated with check (
    exists (
      select 1 from public.users
      where users.id = auth.uid() and users.oss_role = 'admin'
    )
  );

drop policy if exists "admins can update worker private details"
  on public.work_journal_worker_private;
create policy "admins can update worker private details"
  on public.work_journal_worker_private for update
  to authenticated
  using (
    exists (
      select 1 from public.users
      where users.id = auth.uid() and users.oss_role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.users
      where users.id = auth.uid() and users.oss_role = 'admin'
    )
  );

-- 기존 근무일지에 입력된 이름이 있다면 근무자 명단으로 옮깁니다.
insert into public.work_journal_workers (name, created_by)
select distinct on (worker_name) worker_name, created_by
from public.work_journals
where length(trim(worker_name)) > 0
order by worker_name, created_at
on conflict (name) do nothing;
