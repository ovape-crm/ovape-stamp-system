-- 재고 대상 설정 함수가 Supabase API에서 보이지 않을 때 이 파일만 전체 실행하세요.
create table if not exists public.inventory_category_policies (
  category_name text primary key check (category_name = btrim(category_name) and length(category_name) > 0),
  created_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id)
);

create table if not exists public.inventory_item_policies (
  item_name text primary key check (item_name = btrim(item_name) and length(item_name) > 0),
  tracking_mode text not null check (tracking_mode in ('tracked', 'untracked')),
  created_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id)
);

drop function if exists public.save_inventory_tracking_settings_v2(jsonb, jsonb);
create function public.save_inventory_tracking_settings_v2(
  p_untracked_categories jsonb,
  p_item_modes jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  entry jsonb;
  clean_name text;
  mode text;
begin
  if not public.is_inventory_admin() then
    raise exception '관리자만 재고 관리 대상을 설정할 수 있습니다.';
  end if;

  create temporary table desired_inventory_categories_v2 (
    category_name text primary key
  ) on commit drop;
  create temporary table desired_inventory_items_v2 (
    item_name text primary key,
    tracking_mode text not null
  ) on commit drop;

  for entry in select value from jsonb_array_elements(coalesce(p_untracked_categories, '[]'::jsonb)) loop
    clean_name := btrim(entry#>>'{}');
    if clean_name <> '' then
      insert into desired_inventory_categories_v2 values (clean_name);
    end if;
  end loop;

  for entry in select value from jsonb_array_elements(coalesce(p_item_modes, '[]'::jsonb)) loop
    clean_name := btrim(entry->>'item_name');
    mode := entry->>'tracking_mode';
    if clean_name = '' or mode not in ('tracked', 'untracked') then
      raise exception '잘못된 품목별 설정입니다.';
    end if;
    insert into desired_inventory_items_v2 values (clean_name, mode);
  end loop;

  truncate table public.inventory_category_policies, public.inventory_item_policies;
  insert into public.inventory_category_policies(category_name, updated_by)
  select category_name, auth.uid() from desired_inventory_categories_v2;
  insert into public.inventory_item_policies(item_name, tracking_mode, updated_by)
  select item_name, tracking_mode, auth.uid() from desired_inventory_items_v2;
end;
$$;

revoke all on function public.save_inventory_tracking_settings_v2(jsonb, jsonb) from public, anon;
grant execute on function public.save_inventory_tracking_settings_v2(jsonb, jsonb) to authenticated;
notify pgrst, 'reload schema';

-- 정상 생성 확인
select to_regprocedure('public.save_inventory_tracking_settings_v2(jsonb,jsonb)') as created_function;
