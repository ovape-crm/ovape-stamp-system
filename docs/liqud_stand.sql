-- Supabase SQL Editor에서 한 번 실행하세요.
-- 기존 데이터가 있으면 테이블 이름만 변경하여 그대로 보존합니다.
do $$
begin
  if to_regclass('public.liqud_stand_settings') is null and to_regclass('public.demo_stand_settings') is not null then
    alter table public.demo_stand_settings rename to liqud_stand_settings;
  end if;
  if to_regclass('public.liqud_stand_sections') is null and to_regclass('public.demo_stand_sections') is not null then
    alter table public.demo_stand_sections rename to liqud_stand_sections;
  end if;
  if to_regclass('public.liqud_stand_cells') is null and to_regclass('public.demo_stand_cells') is not null then
    alter table public.demo_stand_cells rename to liqud_stand_cells;
  end if;
end $$;
create extension if not exists pgcrypto;

create table if not exists public.liqud_stand_settings (
  id integer primary key default 1 check (id = 1),
  blue_days integer not null default 14 check (blue_days >= 1),
  red_days integer not null default 28 check (red_days > blue_days),
  updated_at timestamptz not null default now()
);
insert into public.liqud_stand_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.liqud_stand_sections (
  id uuid primary key default gen_random_uuid(),
  name text not null default '시연대',
  row_count integer not null default 4 check (row_count between 1 and 30),
  column_count integer not null default 8 check (column_count between 1 and 20),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.liqud_stand_cells (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.liqud_stand_sections(id) on delete cascade,
  row_index integer not null check (row_index >= 0),
  column_index integer not null check (column_index >= 0),
  -- 품목 데이터 재등록으로 id·코드가 바뀌어도 연결되도록 품목명을 저장합니다.
  item_name text,
  secondary_item_name text,
  consumable_type text,
  installed_on date,
  note text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (section_id, row_index, column_index)
);

-- 이전 버전(item_id 연결)을 실행한 경우 품목명을 보존한 뒤 ID 연결을 제거합니다.
alter table public.liqud_stand_cells add column if not exists item_name text;
alter table public.liqud_stand_cells add column if not exists secondary_item_name text;
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'liqud_stand_cells' and column_name = 'item_id'
  ) then
    execute 'update public.liqud_stand_cells c set item_name = i.item_name from public.items i where c.item_id = i.id and c.item_name is null';
  end if;
end $$;
alter table public.liqud_stand_cells drop column if exists item_id;
create index if not exists liqud_stand_cells_item_name_idx on public.liqud_stand_cells (item_name);
create index if not exists liqud_stand_cells_secondary_item_name_idx on public.liqud_stand_cells (secondary_item_name);

alter table public.liqud_stand_settings enable row level security;
alter table public.liqud_stand_sections enable row level security;
alter table public.liqud_stand_cells enable row level security;

drop policy if exists "authenticated users can read demo settings" on public.liqud_stand_settings;
drop policy if exists "authenticated users can read liqud settings" on public.liqud_stand_settings;
create policy "authenticated users can read liqud settings" on public.liqud_stand_settings
for select to authenticated using (true);
drop policy if exists "admins can update demo settings" on public.liqud_stand_settings;
drop policy if exists "admins can update liqud settings" on public.liqud_stand_settings;
create policy "admins can update liqud settings" on public.liqud_stand_settings
for update to authenticated using (exists (select 1 from public.users where id = auth.uid() and oss_role = 'admin'))
with check (exists (select 1 from public.users where id = auth.uid() and oss_role = 'admin'));

drop policy if exists "authenticated users can read demo sections" on public.liqud_stand_sections;
drop policy if exists "authenticated users can read liqud sections" on public.liqud_stand_sections;
create policy "authenticated users can read liqud sections" on public.liqud_stand_sections
for select to authenticated using (true);
drop policy if exists "admins can manage demo sections" on public.liqud_stand_sections;
drop policy if exists "admins can manage liqud sections" on public.liqud_stand_sections;
create policy "admins can manage liqud sections" on public.liqud_stand_sections
for all to authenticated using (exists (select 1 from public.users where id = auth.uid() and oss_role = 'admin'))
with check (exists (select 1 from public.users where id = auth.uid() and oss_role = 'admin'));

drop policy if exists "authenticated users can read demo cells" on public.liqud_stand_cells;
drop policy if exists "authenticated users can read liqud cells" on public.liqud_stand_cells;
create policy "authenticated users can read liqud cells" on public.liqud_stand_cells
for select to authenticated using (true);
drop policy if exists "admins can manage demo cells" on public.liqud_stand_cells;
drop policy if exists "admins can manage liqud cells" on public.liqud_stand_cells;
drop policy if exists "authenticated users can insert liqud cells" on public.liqud_stand_cells;
drop policy if exists "authenticated users can update liqud cells" on public.liqud_stand_cells;
drop policy if exists "admins can delete liqud cells" on public.liqud_stand_cells;
create policy "authenticated users can insert liqud cells" on public.liqud_stand_cells
for insert to authenticated with check (true);
create policy "authenticated users can update liqud cells" on public.liqud_stand_cells
for update to authenticated using (true) with check (true);
create policy "admins can delete liqud cells" on public.liqud_stand_cells
for delete to authenticated using (exists (select 1 from public.users where id = auth.uid() and oss_role = 'admin'));

insert into public.liqud_stand_sections (name, sort_order)
select '시연대 1', 0
where not exists (select 1 from public.liqud_stand_sections);

-- 같은 구역 또는 다른 구역으로 칸을 안전하게 이동·교환합니다.
create or replace function public.move_liqud_stand_cell(
  source_section_id uuid,
  source_row integer,
  source_column integer,
  target_section_id uuid,
  target_row integer,
  target_column integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  source_cell public.liqud_stand_cells%rowtype;
  target_cell public.liqud_stand_cells%rowtype;
  target_exists boolean := false;
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid() and oss_role = 'admin'
  ) then
    raise exception 'Only admins can move liqud stand cells' using errcode = '42501';
  end if;

  select * into source_cell from public.liqud_stand_cells
  where section_id = source_section_id and row_index = source_row and column_index = source_column;
  if not found then raise exception 'Source cell is empty'; end if;

  select * into target_cell from public.liqud_stand_cells
  where section_id = target_section_id and row_index = target_row and column_index = target_column;
  target_exists := found;

  delete from public.liqud_stand_cells
  where (section_id = source_section_id and row_index = source_row and column_index = source_column)
     or (section_id = target_section_id and row_index = target_row and column_index = target_column);

  insert into public.liqud_stand_cells
    (section_id, row_index, column_index, item_name, secondary_item_name, consumable_type, installed_on, note, updated_by, updated_at)
  values
    (target_section_id, target_row, target_column, source_cell.item_name, source_cell.secondary_item_name, source_cell.consumable_type, source_cell.installed_on, source_cell.note, auth.uid(), now());

  if target_exists then
    insert into public.liqud_stand_cells
      (section_id, row_index, column_index, item_name, secondary_item_name, consumable_type, installed_on, note, updated_by, updated_at)
    values
      (source_section_id, source_row, source_column, target_cell.item_name, target_cell.secondary_item_name, target_cell.consumable_type, target_cell.installed_on, target_cell.note, auth.uid(), now());
  end if;
end;
$$;
revoke all on function public.move_liqud_stand_cell(uuid, integer, integer, uuid, integer, integer) from public;
grant execute on function public.move_liqud_stand_cell(uuid, integer, integer, uuid, integer, integer) to authenticated;

-- 새 RPC 함수를 PostgREST가 즉시 인식하도록 스키마 캐시를 갱신합니다.
notify pgrst, 'reload schema';
