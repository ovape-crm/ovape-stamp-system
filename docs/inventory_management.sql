-- 재고관리 기반: 품목명 내부 띄어쓰기는 보존하고 앞뒤 공백만 제거합니다.
create extension if not exists pgcrypto;

create table if not exists public.inventory_settings (
  id boolean primary key default true check (id),
  initialized_at timestamptz,
  initialized_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

insert into public.inventory_settings (id) values (true)
on conflict (id) do nothing;

create table if not exists public.inventory_balances (
  item_name text primary key check (item_name = btrim(item_name) and length(item_name) > 0),
  quantity integer not null default 0,
  updated_at timestamptz not null default now()
);

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

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  item_name text not null check (item_name = btrim(item_name) and length(item_name) > 0),
  movement_type text not null check (movement_type in ('initial', 'purchase_in', 'adjustment', 'reversal', 'sale_out')),
  quantity_delta integer not null check (quantity_delta <> 0),
  quantity_after integer not null,
  unit_price integer check (unit_price is null or unit_price >= 0),
  reference_type text,
  reference_id text,
  reversed_movement_id uuid references public.inventory_movements(id),
  note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (reversed_movement_id)
);

create index if not exists inventory_movements_item_name_created_at_idx
  on public.inventory_movements (item_name, created_at desc);
create index if not exists inventory_movements_created_at_idx
  on public.inventory_movements (created_at desc);

alter table public.inventory_settings enable row level security;
alter table public.inventory_balances enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.inventory_category_policies enable row level security;
alter table public.inventory_item_policies enable row level security;

revoke all on table public.inventory_settings from anon;
revoke all on table public.inventory_balances from anon;
revoke all on table public.inventory_movements from anon;
revoke all on table public.inventory_category_policies from anon;
revoke all on table public.inventory_item_policies from anon;

grant select on table public.inventory_settings to authenticated;
grant select on table public.inventory_balances to authenticated;
grant select on table public.inventory_movements to authenticated;
grant select on table public.inventory_category_policies to authenticated;
grant select on table public.inventory_item_policies to authenticated;

drop policy if exists "authenticated users can read inventory settings" on public.inventory_settings;
create policy "authenticated users can read inventory settings"
  on public.inventory_settings for select to authenticated using (true);

drop policy if exists "authenticated users can read inventory balances" on public.inventory_balances;
create policy "authenticated users can read inventory balances"
  on public.inventory_balances for select to authenticated using (true);

drop policy if exists "authenticated users can read inventory movements" on public.inventory_movements;
create policy "authenticated users can read inventory movements"
  on public.inventory_movements for select to authenticated using (true);

drop policy if exists "authenticated users can read inventory category policies" on public.inventory_category_policies;
create policy "authenticated users can read inventory category policies" on public.inventory_category_policies for select to authenticated using (true);
drop policy if exists "authenticated users can read inventory item policies" on public.inventory_item_policies;
create policy "authenticated users can read inventory item policies" on public.inventory_item_policies for select to authenticated using (true);

create or replace function public.is_inventory_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where users.id = auth.uid() and users.oss_role = 'admin'
  );
$$;

create or replace function public.is_inventory_item_tracked(p_item_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when policy.tracking_mode = 'tracked' then true
    when policy.tracking_mode = 'untracked' then false
    when category_policy.category_name is not null then false
    else true
  end
  from (select btrim(p_item_name) as item_name) input
  left join public.inventory_item_policies policy on policy.item_name = input.item_name
  left join public.items item on item.item_name = input.item_name
  left join public.item_categories category on category.id = item.category_id
  left join public.inventory_category_policies category_policy on category_policy.category_name = category.name
  limit 1;
$$;

create or replace function public.save_inventory_tracking_settings_v2(p_untracked_categories jsonb, p_item_modes jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare entry jsonb; clean_name text; mode text;
begin
  if not public.is_inventory_admin() then raise exception '관리자만 재고 관리 대상을 설정할 수 있습니다.'; end if;
  create temporary table desired_inventory_categories (category_name text primary key) on commit drop;
  create temporary table desired_inventory_items (item_name text primary key, tracking_mode text not null) on commit drop;
  for entry in select value from jsonb_array_elements(coalesce(p_untracked_categories, '[]'::jsonb)) loop
    clean_name := btrim(entry#>>'{}');
    if clean_name <> '' then insert into desired_inventory_categories values(clean_name); end if;
  end loop;
  for entry in select value from jsonb_array_elements(coalesce(p_item_modes, '[]'::jsonb)) loop
    clean_name := btrim(entry->>'item_name'); mode := entry->>'tracking_mode';
    if clean_name = '' or mode not in ('tracked','untracked') then raise exception '잘못된 품목별 설정입니다.'; end if;
    insert into desired_inventory_items values(clean_name, mode);
  end loop;

  truncate table public.inventory_category_policies, public.inventory_item_policies;
  insert into public.inventory_category_policies(category_name, updated_by)
  select category_name, auth.uid() from desired_inventory_categories;
  insert into public.inventory_item_policies(item_name, tracking_mode, updated_by)
  select item_name, tracking_mode, auth.uid() from desired_inventory_items;
end;
$$;

create or replace function public.initialize_inventory(p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  entry jsonb;
  clean_name text;
  input_quantity integer;
  seen_names text[] := array[]::text[];
begin
  if not public.is_inventory_admin() then
    raise exception '관리자만 기초재고를 등록할 수 있습니다.';
  end if;
  if (select initialized_at is not null from public.inventory_settings where id = true) then
    raise exception '기초재고가 이미 등록되어 있습니다.';
  end if;

  for entry in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    clean_name := btrim(entry->>'item_name');
    input_quantity := coalesce((entry->>'quantity')::integer, 0);
    if clean_name is null or clean_name = '' then
      raise exception '품목명이 비어 있습니다.';
    end if;
    if not public.is_inventory_item_tracked(clean_name) then continue; end if;
    if clean_name = any(seen_names) then
      raise exception '중복된 품목명이 있습니다: %', clean_name;
    end if;
    seen_names := array_append(seen_names, clean_name);
    if input_quantity < 0 then
      raise exception '기초재고는 0개 이상이어야 합니다: %', clean_name;
    end if;
    if exists (select 1 from public.inventory_balances where item_name = clean_name) then
      raise exception '중복된 품목명이 있습니다: %', clean_name;
    end if;

    insert into public.inventory_balances (item_name, quantity)
    values (clean_name, input_quantity);
    if input_quantity > 0 then
      insert into public.inventory_movements
        (item_name, movement_type, quantity_delta, quantity_after, note, created_by)
      values
        (clean_name, 'initial', input_quantity, input_quantity, '기초재고', auth.uid());
    end if;
  end loop;

  update public.inventory_settings
  set initialized_at = now(), initialized_by = auth.uid(), updated_at = now()
  where id = true;
end;
$$;

-- 기존 재고를 덮어쓰지 않고 신규 품목의 기초재고만 추가한다.
create or replace function public.add_initial_inventory_entries(p_items jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare entry jsonb; clean_name text; input_quantity integer; seen_names text[]:=array[]::text[];
begin
  if not public.is_inventory_admin() then raise exception '관리자만 기초재고를 등록할 수 있습니다.'; end if;
  for entry in select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    clean_name:=btrim(entry->>'item_name'); input_quantity:=(entry->>'quantity')::integer;
    if clean_name='' or input_quantity is null or input_quantity<0 then raise exception '품목명과 0개 이상의 수량을 확인해 주세요.'; end if;
    if clean_name=any(seen_names) then raise exception '중복된 품목명이 있습니다: %',clean_name; end if;
    seen_names:=array_append(seen_names,clean_name);
    if not public.is_inventory_item_tracked(clean_name) then raise exception '재고 관리 대상이 아닌 품목입니다: %',clean_name; end if;
    if exists(select 1 from public.inventory_balances where item_name=clean_name) then raise exception '이미 재고가 등록된 품목입니다: %',clean_name; end if;
    insert into public.inventory_balances(item_name,quantity) values(clean_name,input_quantity);
    if input_quantity > 0 then
      insert into public.inventory_movements(item_name,movement_type,quantity_delta,quantity_after,note,created_by)
      values(clean_name,'initial',input_quantity,input_quantity,'기초재고 추가 등록',auth.uid());
    end if;
  end loop;
end $$;

create or replace function public.reset_inventory_for_reinitialization()
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_inventory_admin() then raise exception '관리자만 재고를 초기화할 수 있습니다.'; end if;
  delete from public.inventory_movements where id is not null;
  delete from public.inventory_balances where item_name is not null;
  if to_regclass('public.inventory_outbound_log_states') is not null then
    execute 'delete from public.inventory_outbound_log_states where log_id is not null';
  end if;
  update public.inventory_settings set initialized_at=null,initialized_by=null,updated_at=now() where id=true;
end $$;

create or replace function public.receive_inventory(p_items jsonb, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  entry jsonb;
  clean_name text;
  input_quantity integer;
  input_unit_price integer;
  next_quantity integer;
begin
  if not public.is_inventory_admin() then
    raise exception '관리자만 입고를 등록할 수 있습니다.';
  end if;
  if not (select initialized_at is not null from public.inventory_settings where id = true) then
    raise exception '기초재고를 먼저 등록해 주세요.';
  end if;

  for entry in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    clean_name := btrim(entry->>'item_name');
    input_quantity := (entry->>'quantity')::integer;
    input_unit_price := nullif(entry->>'unit_price', '')::integer;
    if clean_name is null or clean_name = '' or input_quantity is null or input_quantity <= 0 then
      raise exception '입고 품목과 1개 이상의 수량을 입력해 주세요.';
    end if;
    if not public.is_inventory_item_tracked(clean_name) then raise exception '재고 미관리 품목은 입고할 수 없습니다: %', clean_name; end if;

    insert into public.inventory_balances (item_name, quantity, updated_at)
    values (clean_name, input_quantity, now())
    on conflict (item_name) do update
      set quantity = public.inventory_balances.quantity + excluded.quantity,
          updated_at = now()
    returning quantity into next_quantity;

    insert into public.inventory_movements
      (item_name, movement_type, quantity_delta, quantity_after, unit_price, note, created_by)
    values
      (clean_name, 'purchase_in', input_quantity, next_quantity, input_unit_price, nullif(btrim(p_note), ''), auth.uid());
  end loop;
end;
$$;

create or replace function public.adjust_inventory(p_item_name text, p_quantity integer, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_name text := btrim(p_item_name);
  previous_quantity integer;
  delta integer;
begin
  if not public.is_inventory_admin() then
    raise exception '관리자만 재고를 조정할 수 있습니다.';
  end if;
  if nullif(btrim(p_note), '') is null then
    raise exception '조정 사유를 입력해 주세요.';
  end if;
  if not public.is_inventory_item_tracked(clean_name) then raise exception '재고 미관리 품목은 조정할 수 없습니다: %', clean_name; end if;

  select quantity into previous_quantity
  from public.inventory_balances where item_name = clean_name for update;
  previous_quantity := coalesce(previous_quantity, 0);
  delta := p_quantity - previous_quantity;
  if delta = 0 then return; end if;

  insert into public.inventory_balances (item_name, quantity, updated_at)
  values (clean_name, p_quantity, now())
  on conflict (item_name) do update set quantity = excluded.quantity, updated_at = now();

  insert into public.inventory_movements
    (item_name, movement_type, quantity_delta, quantity_after, note, created_by)
  values
    (clean_name, 'adjustment', delta, p_quantity, btrim(p_note), auth.uid());
end;
$$;

create or replace function public.reverse_inventory_movement(p_movement_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  original public.inventory_movements%rowtype;
  next_quantity integer;
begin
  if not public.is_inventory_admin() then
    raise exception '관리자만 입고를 취소할 수 있습니다.';
  end if;
  select * into original from public.inventory_movements where id = p_movement_id for update;
  if not found or original.movement_type <> 'purchase_in' then
    raise exception '취소할 수 있는 입고 기록이 아닙니다.';
  end if;
  if exists (select 1 from public.inventory_movements where reversed_movement_id = original.id) then
    raise exception '이미 취소된 입고 기록입니다.';
  end if;

  update public.inventory_balances
  set quantity = quantity - original.quantity_delta, updated_at = now()
  where item_name = original.item_name
  returning quantity into next_quantity;

  insert into public.inventory_movements
    (item_name, movement_type, quantity_delta, quantity_after, unit_price, reversed_movement_id, note, created_by)
  values
    (original.item_name, 'reversal', -original.quantity_delta, next_quantity, original.unit_price, original.id,
     coalesce(nullif(btrim(p_note), ''), '입고 취소'), auth.uid());
end;
$$;

revoke all on function public.is_inventory_admin() from public, anon;
revoke all on function public.initialize_inventory(jsonb) from public, anon;
revoke all on function public.add_initial_inventory_entries(jsonb) from public, anon;
revoke all on function public.reset_inventory_for_reinitialization() from public, anon;
revoke all on function public.receive_inventory(jsonb, text) from public, anon;
revoke all on function public.adjust_inventory(text, integer, text) from public, anon;
revoke all on function public.reverse_inventory_movement(uuid, text) from public, anon;

grant execute on function public.is_inventory_admin() to authenticated;
grant execute on function public.initialize_inventory(jsonb) to authenticated;
grant execute on function public.add_initial_inventory_entries(jsonb) to authenticated;
grant execute on function public.reset_inventory_for_reinitialization() to authenticated;
grant execute on function public.receive_inventory(jsonb, text) to authenticated;
grant execute on function public.adjust_inventory(text, integer, text) to authenticated;
grant execute on function public.reverse_inventory_movement(uuid, text) to authenticated;
revoke all on function public.is_inventory_item_tracked(text) from public, anon;
revoke all on function public.save_inventory_tracking_settings_v2(jsonb, jsonb) from public, anon;
grant execute on function public.is_inventory_item_tracked(text) to authenticated;
grant execute on function public.save_inventory_tracking_settings_v2(jsonb, jsonb) to authenticated;
notify pgrst, 'reload schema';

-- 내비게이션 설정 테이블이 이미 있는 환경에서는 상품 관리 메뉴에도 등록합니다.
do $$
begin
  if to_regclass('public.navigation_menu_settings') is not null then
    insert into public.navigation_menu_settings (href, label, group_key, sort_order)
    values ('/inventory', '재고/입고', 'product', 2)
    on conflict (href) do update
      set label = excluded.label,
          group_key = excluded.group_key,
          sort_order = excluded.sort_order,
          updated_at = now();

    update public.navigation_menu_settings
    set sort_order = case href
      when '/comparison' then 3
      when '/liqud-stand' then 4
      else sort_order
    end,
    updated_at = now()
    where href in ('/comparison', '/liqud-stand');
  end if;
end
$$;
