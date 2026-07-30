-- 스태프 영업 시작 체크리스트 잠금 기능
-- Supabase SQL Editor에서 이 파일 전체를 한 번 실행해 주세요.

alter table public.daily_closing_checklist_items
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

-- 현재 출근·교대 확인의 1~4번을 최초 오픈 조건으로 지정한다.
-- 이후에는 체크리스트 관리 화면에서 항목별로 변경할 수 있다.
update public.daily_closing_checklist_items
set is_opening_gate = true,
    updated_at = now()
where phase = 'opening'
  and sort_order between 0 and 3;
