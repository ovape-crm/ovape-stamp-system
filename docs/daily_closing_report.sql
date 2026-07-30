-- 종합보고서와 마감·퇴근 처리를 위한 SQL입니다.
-- Supabase SQL Editor에서 이 파일 전체를 한 번 실행해 주세요.

alter table public.work_journals
  add column if not exists expected_end_time time,
  add column if not exists input_work_hours numeric(5, 2);

create table if not exists public.daily_closing_reports (
  id uuid primary key default gen_random_uuid(),
  business_date date not null unique,
  closer_worker_name text not null,
  opening_checklist jsonb not null default '{}'::jsonb,
  closing_checklist jsonb not null default '{}'::jsonb,
  cleaning_note text,
  special_note text,
  total_sales integer not null default 0,
  expected_cash integer not null default 0,
  actual_cash integer not null default 0,
  cash_difference integer not null default 0,
  input_work_hours numeric(5, 2) not null default 0,
  report_snapshot jsonb,
  closed_work_journal boolean not null default false,
  closed_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.daily_closing_reports
  add column if not exists closed_work_journal boolean not null default false,
  add column if not exists input_work_hours numeric(5, 2) not null default 0,
  add column if not exists report_snapshot jsonb;

create table if not exists public.daily_closing_report_revisions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.daily_closing_reports(id) on delete cascade,
  revision_number integer not null,
  report_snapshot jsonb not null,
  revision_reason text not null check (length(trim(revision_reason)) > 0),
  revised_by uuid not null references auth.users(id),
  revised_by_name text not null default '관리자',
  revised_at timestamptz not null default now(),
  unique (report_id, revision_number)
);

alter table public.daily_closing_report_revisions
  add column if not exists revised_by_name text not null default '관리자';

alter table public.daily_closing_report_revisions enable row level security;

drop policy if exists "admins can read closing report revisions"
  on public.daily_closing_report_revisions;
create policy "admins can read closing report revisions"
  on public.daily_closing_report_revisions for select
  to authenticated using (
    exists (
      select 1 from public.users
      where users.id = auth.uid() and users.oss_role = 'admin'
    )
  );

alter table public.daily_closing_reports enable row level security;

drop policy if exists "authenticated users can read daily closing reports"
  on public.daily_closing_reports;
create policy "authenticated users can read daily closing reports"
  on public.daily_closing_reports for select
  to authenticated
  using (true);

drop policy if exists "authenticated users can insert daily closing reports"
  on public.daily_closing_reports;
create policy "authenticated users can insert daily closing reports"
  on public.daily_closing_reports for insert
  to authenticated
  with check (auth.uid() = created_by);

drop policy if exists "admins can update daily closing reports"
  on public.daily_closing_reports;
create policy "admins can update daily closing reports"
  on public.daily_closing_reports for update
  to authenticated
  using (
    exists (
      select 1
      from public.users
      where users.id = auth.uid()
        and users.oss_role = 'admin'
    )
  );

create index if not exists daily_closing_reports_business_date_idx
  on public.daily_closing_reports (business_date desc);

create table if not exists public.daily_closing_checklist_items (
  id uuid primary key default gen_random_uuid(),
  phase text not null check (phase in ('opening', 'closing')),
  label text not null check (length(trim(label)) > 0),
  sort_order integer not null default 0,
  is_required boolean not null default false,
  is_opening_gate boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.daily_closing_checklist_items
  add column if not exists is_required boolean not null default false,
  add column if not exists is_opening_gate boolean not null default false;

create table if not exists public.daily_opening_checklist_progress (
  business_date date primary key,
  checks jsonb not null default '{}'::jsonb,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);

alter table public.daily_opening_checklist_progress enable row level security;

drop policy if exists "authenticated users can read opening checklist progress"
  on public.daily_opening_checklist_progress;
create policy "authenticated users can read opening checklist progress"
  on public.daily_opening_checklist_progress for select
  to authenticated using (true);

drop policy if exists "authenticated users can insert opening checklist progress"
  on public.daily_opening_checklist_progress;
create policy "authenticated users can insert opening checklist progress"
  on public.daily_opening_checklist_progress for insert
  to authenticated with check (auth.uid() = updated_by);

drop policy if exists "authenticated users can update opening checklist progress"
  on public.daily_opening_checklist_progress;
create policy "authenticated users can update opening checklist progress"
  on public.daily_opening_checklist_progress for update
  to authenticated using (true)
  with check (auth.uid() = updated_by);

alter table public.daily_closing_checklist_items enable row level security;

drop policy if exists "authenticated users can read daily closing checklist"
  on public.daily_closing_checklist_items;
create policy "authenticated users can read daily closing checklist"
  on public.daily_closing_checklist_items for select
  to authenticated
  using (true);

drop policy if exists "admins can insert daily closing checklist"
  on public.daily_closing_checklist_items;
create policy "admins can insert daily closing checklist"
  on public.daily_closing_checklist_items for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.users
      where users.id = auth.uid()
        and users.oss_role = 'admin'
    )
  );

drop policy if exists "admins can update daily closing checklist"
  on public.daily_closing_checklist_items;
create policy "admins can update daily closing checklist"
  on public.daily_closing_checklist_items for update
  to authenticated
  using (
    exists (
      select 1
      from public.users
      where users.id = auth.uid()
        and users.oss_role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.users
      where users.id = auth.uid()
        and users.oss_role = 'admin'
    )
  );

drop policy if exists "admins can delete daily closing checklist"
  on public.daily_closing_checklist_items;
create policy "admins can delete daily closing checklist"
  on public.daily_closing_checklist_items for delete
  to authenticated
  using (
    exists (
      select 1
      from public.users
      where users.id = auth.uid()
        and users.oss_role = 'admin'
    )
  );

insert into public.daily_closing_checklist_items (phase, label, sort_order)
select seed.phase, seed.label, seed.sort_order
from (
  values
    ('opening', '매장 기기 및 업무 계정 로그인 확인', 0),
    ('opening', '고객 출고 전 시재·재고 확인', 1),
    ('opening', '시연용 기기와 업무용 기기 충전 확인', 2),
    ('opening', '업무용 휴대폰 알림 확인', 3),
    ('closing', '화장실 잠금 및 정리 확인', 0),
    ('closing', '판매처별 매출과 종합 금액 확인', 1),
    ('closing', '에어컨·송풍·조명 전원 확인', 2),
    ('closing', '매장 쓰레기 정리', 3),
    ('closing', '출입문과 창문 잠금 확인', 4)
) as seed(phase, label, sort_order)
where not exists (
  select 1 from public.daily_closing_checklist_items
);

update public.daily_closing_checklist_items
set is_opening_gate = true,
    updated_at = now()
where phase = 'opening'
  and sort_order between 0 and 3;

drop function if exists public.complete_daily_closing_report(
  date, text, text, jsonb, jsonb, text, text, integer, integer, integer
);
drop function if exists public.complete_daily_closing_report(
  date, text, text, jsonb, jsonb, text, text, integer, integer, integer, numeric
);
drop function if exists public.complete_daily_closing_report(
  date, jsonb, jsonb, text, text, integer, integer, integer
);
drop function if exists public.complete_daily_closing_report(
  date, jsonb, jsonb, text, text, integer, integer, integer, jsonb
);

create or replace function public.complete_daily_closing_report(
  p_business_date date,
  p_opening_checklist jsonb,
  p_closing_checklist jsonb,
  p_cleaning_note text,
  p_special_note text,
  p_total_sales integer,
  p_expected_cash integer,
  p_actual_cash integer,
  p_report_snapshot jsonb
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_worker_names text;
  v_input_work_hours numeric;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.cash_register_closings
    where business_date = p_business_date
  ) then
    raise exception 'CASH_CLOSING_REQUIRED';
  end if;

  if exists (
    select 1
    from public.cash_register_closings
    where business_date = p_business_date
      and coalesce(actual_cash, 0) <> coalesce(expected_cash, 0)
  ) or coalesce(p_actual_cash, 0) <> coalesce(p_expected_cash, 0) then
    raise exception 'CASH_BALANCE_MISMATCH';
  end if;

  if not exists (
    select 1 from public.work_journals
    where work_date = p_business_date
  ) then
    raise exception 'WORK_JOURNAL_NOT_FOUND';
  end if;

  if exists (
    select 1 from public.work_journals
    where work_date = p_business_date
      and coalesce(status, 'working') in ('working', 'handover_pending')
  ) then
    raise exception 'OPEN_WORK_JOURNAL_EXISTS';
  end if;

  if exists (
    select 1
    from public.daily_closing_reports
    where business_date = p_business_date
  ) then
    raise exception 'ALREADY_CLOSED';
  end if;

  select
    string_agg(worker_name, ', ' order by start_time),
    coalesce(sum(input_work_hours), 0)
  into v_worker_names, v_input_work_hours
  from public.work_journals
  where work_date = p_business_date;

  insert into public.daily_closing_reports (
    business_date,
    closer_worker_name,
    opening_checklist,
    closing_checklist,
    cleaning_note,
    special_note,
    total_sales,
    expected_cash,
    actual_cash,
    cash_difference,
    input_work_hours,
    report_snapshot,
    closed_work_journal,
    created_by
  )
  values (
    p_business_date,
    coalesce(v_worker_names, '근무자 미등록'),
    coalesce(p_opening_checklist, '{}'::jsonb),
    coalesce(p_closing_checklist, '{}'::jsonb),
    nullif(trim(p_cleaning_note), ''),
    nullif(trim(p_special_note), ''),
    coalesce(p_total_sales, 0),
    coalesce(p_expected_cash, 0),
    coalesce(p_actual_cash, 0),
    coalesce(p_actual_cash, 0) - coalesce(p_expected_cash, 0),
    v_input_work_hours,
    p_report_snapshot,
    false,
    auth.uid()
  );
end;
$$;

revoke all on function public.complete_daily_closing_report(
  date, jsonb, jsonb, text, text, integer, integer, integer, jsonb
) from public;
grant execute on function public.complete_daily_closing_report(
  date, jsonb, jsonb, text, text, integer, integer, integer, jsonb
) to authenticated;

create or replace function public.revise_daily_closing_report(
  p_report_id uuid,
  p_report_snapshot jsonb,
  p_revision_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next_revision integer;
  v_admin_name text;
begin
  if not exists (
    select 1 from public.users
    where users.id = auth.uid() and users.oss_role = 'admin'
  ) then
    raise exception 'ADMIN_REQUIRED';
  end if;

  if nullif(trim(p_revision_reason), '') is null then
    raise exception 'REVISION_REASON_REQUIRED';
  end if;

  select coalesce(max(revision_number), 0) + 1
  into v_next_revision
  from public.daily_closing_report_revisions
  where report_id = p_report_id;

  select coalesce(nullif(trim(name), ''), '관리자')
  into v_admin_name
  from public.users
  where id = auth.uid();

  insert into public.daily_closing_report_revisions (
    report_id,
    revision_number,
    report_snapshot,
    revision_reason,
    revised_by,
    revised_by_name
  ) values (
    p_report_id,
    v_next_revision,
    p_report_snapshot,
    trim(p_revision_reason),
    auth.uid(),
    coalesce(v_admin_name, '관리자')
  );
end;
$$;

revoke all on function public.revise_daily_closing_report(uuid, jsonb, text)
  from public;
grant execute on function public.revise_daily_closing_report(uuid, jsonb, text)
  to authenticated;

create or replace function public.cancel_daily_closing_report(
  p_business_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report public.daily_closing_reports%rowtype;
  v_is_admin boolean;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and users.oss_role = 'admin'
  ) into v_is_admin;

  if not v_is_admin and p_business_date <> v_today then
    raise exception 'CANCEL_NOT_ALLOWED';
  end if;

  select *
  into v_report
  from public.daily_closing_reports
  where business_date = p_business_date
  for update;

  if not found then
    raise exception 'CLOSING_REPORT_NOT_FOUND';
  end if;

  if v_report.closed_work_journal then
    update public.work_journals
    set
      end_time = coalesce(expected_end_time, end_time),
      input_work_hours = null,
      status = 'working',
      updated_at = now()
    where work_date = p_business_date
      and worker_name = v_report.closer_worker_name;
  else
    update public.work_journals
    set
      input_work_hours = null,
      updated_at = now()
    where work_date = p_business_date
      and worker_name = v_report.closer_worker_name;
  end if;

  delete from public.daily_closing_reports
  where id = v_report.id;
end;
$$;

revoke all on function public.cancel_daily_closing_report(date) from public;
grant execute on function public.cancel_daily_closing_report(date)
  to authenticated;
