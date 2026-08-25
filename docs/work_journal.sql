-- Supabase SQL Editor에서 한 번 실행하세요.
create extension if not exists pgcrypto;

create table if not exists public.work_journals (
  id uuid primary key default gen_random_uuid(),
  work_date date not null,
  worker_name text not null check (length(trim(worker_name)) > 0),
  start_time time not null,
  end_time time not null,
  work_hours numeric(5, 2) not null check (work_hours > 0 and work_hours <= 24),
  input_work_hours numeric(5, 2)
    check (input_work_hours > 0 and input_work_hours <= 24),
  note text,
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'advance', 'salary')),
  paid_at timestamptz,
  paid_by uuid references auth.users(id),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_journals_date_worker_unique unique (work_date, worker_name)
);

alter table public.work_journals
  add column if not exists payment_status text not null default 'unpaid',
  add column if not exists paid_at timestamptz,
  add column if not exists paid_by uuid references auth.users(id),
  add column if not exists work_type text not null default 'solo',
  add column if not exists status text not null default 'working',
  add column if not exists expected_end_time time,
  add column if not exists input_work_hours numeric(5, 2);

update public.work_journals
set expected_end_time = end_time
where expected_end_time is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'work_journals_payment_status_check'
      and conrelid = 'public.work_journals'::regclass
  ) then
    alter table public.work_journals
      add constraint work_journals_payment_status_check
      check (payment_status in ('unpaid', 'advance', 'salary'));
  end if;
end $$;

create or replace function public.guard_work_journal_payment_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  payment_changed boolean;
  current_user_is_admin boolean;
begin
  payment_changed := case
    when tg_op = 'INSERT' then
      new.payment_status <> 'unpaid'
      or new.paid_at is not null
      or new.paid_by is not null
    else
      new.payment_status is distinct from old.payment_status
      or new.paid_at is distinct from old.paid_at
      or new.paid_by is distinct from old.paid_by
  end;

  if not payment_changed then
    return new;
  end if;

  select exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and users.oss_role in ('admin', 'master')
  ) into current_user_is_admin;

  if not current_user_is_admin then
    raise exception 'Only admins can change work payment status'
      using errcode = '42501';
  end if;

  if new.payment_status = 'unpaid' then
    new.paid_at := null;
    new.paid_by := null;
  else
    new.paid_at := coalesce(new.paid_at, now());
    new.paid_by := auth.uid();
  end if;

  return new;
end;
$$;

drop trigger if exists guard_work_journal_payment_status
  on public.work_journals;
create trigger guard_work_journal_payment_status
before insert or update
on public.work_journals
for each row execute function public.guard_work_journal_payment_status();

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
      where users.id = auth.uid() and users.oss_role in ('admin', 'master')
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
  is_payroll_eligible boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 기존 설치 환경에도 월급 지급 대상 컬럼을 추가합니다.
-- 기본값이 true이므로 기존 근무자는 모두 지급 대상으로 설정됩니다.
alter table public.work_journal_workers
  add column if not exists is_payroll_eligible boolean not null default true;

comment on column public.work_journal_workers.is_payroll_eligible is
  '급여 지급 화면의 월급 지급 대상 여부. 근무시간 기록과는 독립적으로 관리한다.';

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
      where users.id = auth.uid() and users.oss_role in ('admin', 'master')
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
      where users.id = auth.uid() and users.oss_role in ('admin', 'master')
    )
  )
  with check (
    exists (
      select 1 from public.users
      where users.id = auth.uid() and users.oss_role in ('admin', 'master')
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

alter table public.work_journal_worker_private
  add column if not exists pin_hash text,
  add column if not exists pin_code text;

create or replace function public.hash_work_journal_worker_pin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.pin_hash is not null
     and new.pin_hash !~ '^\$2[aby]\$' then
    if new.pin_hash !~ '^[0-9]{4}$' then
      raise exception 'PIN must contain exactly four digits';
    end if;
    new.pin_hash := extensions.crypt(
      new.pin_hash,
      extensions.gen_salt('bf')
    );
  end if;
  return new;
end;
$$;

drop trigger if exists hash_work_journal_worker_pin
  on public.work_journal_worker_private;
create trigger hash_work_journal_worker_pin
before insert or update of pin_hash
on public.work_journal_worker_private
for each row execute function public.hash_work_journal_worker_pin();

create or replace function public.verify_work_journal_worker_pin(
  p_worker_name text,
  p_pin text
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.work_journal_workers worker
    join public.work_journal_worker_private private
      on private.worker_id = worker.id
    where worker.name = trim(p_worker_name)
      and worker.is_active = true
      and private.pin_hash is not null
      and private.pin_hash = extensions.crypt(p_pin, private.pin_hash)
  );
$$;

revoke all on function public.verify_work_journal_worker_pin(text, text)
  from public;
grant execute on function public.verify_work_journal_worker_pin(text, text)
  to authenticated;

alter table public.work_journal_worker_private enable row level security;

drop policy if exists "admins can read worker private details"
  on public.work_journal_worker_private;
create policy "admins can read worker private details"
  on public.work_journal_worker_private for select
  to authenticated using (
    exists (
      select 1 from public.users
      where users.id = auth.uid() and users.oss_role in ('admin', 'master')
    )
  );

drop policy if exists "admins can insert worker private details"
  on public.work_journal_worker_private;
create policy "admins can insert worker private details"
  on public.work_journal_worker_private for insert
  to authenticated with check (
    exists (
      select 1 from public.users
      where users.id = auth.uid() and users.oss_role in ('admin', 'master')
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
      where users.id = auth.uid() and users.oss_role in ('admin', 'master')
    )
  )
  with check (
    exists (
      select 1 from public.users
      where users.id = auth.uid() and users.oss_role in ('admin', 'master')
    )
  );

-- 기존 근무일지에 입력된 이름이 있다면 근무자 명단으로 옮깁니다.
insert into public.work_journal_workers (name, created_by)
select distinct on (worker_name) worker_name, created_by
from public.work_journals
where length(trim(worker_name)) > 0
order by worker_name, created_at
on conflict (name) do nothing;
