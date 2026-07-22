-- 출고 로그와 재고를 품목명 기준으로 안전하게 연결합니다.
-- inventory_management.sql 실행 후 이 파일을 Supabase SQL Editor에서 실행하세요.

alter table public.inventory_movements
  drop constraint if exists inventory_movements_movement_type_check;
alter table public.inventory_movements
  add constraint inventory_movements_movement_type_check
  check (movement_type in (
    'initial', 'purchase_in', 'adjustment', 'reversal', 'sale_out',
    'exchange_in', 'outbound_edit', 'outbound_cancel'
  ));

create table if not exists public.inventory_outbound_log_states (
  log_id text primary key,
  effects jsonb not null default '{}'::jsonb,
  applied_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- logs.id는 프로젝트에 따라 bigint 또는 uuid일 수 있으므로 text로 통일합니다.
-- 이전 버전(uuid) SQL을 이미 실행한 경우에도 이 파일 재실행만으로 보정됩니다.
drop trigger if exists sync_outbound_log_inventory_trigger on public.logs;
drop function if exists public.sync_outbound_log_inventory();
drop function if exists public.preview_outbound_inventory(jsonb, uuid);
drop function if exists public.preview_outbound_inventory(jsonb, text);
alter table public.inventory_outbound_log_states
  alter column log_id type text using log_id::text;

alter table public.inventory_outbound_log_states enable row level security;
revoke all on table public.inventory_outbound_log_states from public, anon, authenticated;

create or replace function public.outbound_inventory_effects(p_items jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select coalesce(jsonb_object_agg(item_name, quantity_delta), '{}'::jsonb)
  from (
    select
      btrim(item->>'itemName') as item_name,
      sum(
        case coalesce(item->>'inventoryAction', 'out')
          when 'exchange_in' then 1
          when 'adjustment_in' then 1
          else -1
        end * greatest(coalesce(nullif(item->>'quantity', '')::integer, 0), 0)
      )::integer as quantity_delta
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) item
    where nullif(btrim(item->>'itemName'), '') is not null
    group by btrim(item->>'itemName')
  ) grouped
  where quantity_delta <> 0;
$$;

create or replace function public.preview_outbound_inventory(
  p_items jsonb,
  p_log_id text default null
)
returns table (
  item_name text,
  current_quantity integer,
  requested_quantity integer,
  resulting_quantity integer
)
language sql
stable
security definer
set search_path = public
as $$
  with desired as (
    select key as item_name, value::text::integer as effect
    from jsonb_each(public.outbound_inventory_effects(p_items))
  ), previous as (
    select key as item_name, value::text::integer as effect
    from public.inventory_outbound_log_states state,
         jsonb_each(state.effects)
    where state.log_id = p_log_id
  ), changes as (
    select
      coalesce(desired.item_name, previous.item_name) as item_name,
      coalesce(desired.effect, 0) - coalesce(previous.effect, 0) as effect
    from desired full join previous using (item_name)
  )
  select
    changes.item_name,
    coalesce(balance.quantity, 0)::integer,
    (-changes.effect)::integer,
    (coalesce(balance.quantity, 0) + changes.effect)::integer
  from changes
  left join public.inventory_balances balance using (item_name)
  where changes.effect < 0
    and public.is_inventory_item_tracked(changes.item_name)
    and coalesce(balance.quantity, 0) + changes.effect < 0
  order by changes.item_name;
$$;

create or replace function public.sync_outbound_log_inventory()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_log_id text := coalesce(new.id, old.id)::text;
  old_effects jsonb := '{}'::jsonb;
  new_effects jsonb := '{}'::jsonb;
  has_managed_state boolean := false;
  effect_entry record;
  change_quantity integer;
  next_quantity integer;
  movement_kind text;
  actor_id uuid := coalesce(new.admin_id, old.admin_id);
begin
  select effects into old_effects
  from public.inventory_outbound_log_states
  where log_id = target_log_id
  for update;
  has_managed_state := found;
  old_effects := coalesce(old_effects, '{}'::jsonb);

  -- SQL 설치 전에 이미 확정되어 있던 출고는 연동 이전 데이터입니다.
  -- 상태 기록이 없는 기존 출고는 수정하거나 삭제해도 재고를 변경하지 않습니다.
  if tg_op = 'DELETE' and not has_managed_state then
    return old;
  end if;

  if tg_op = 'UPDATE'
     and not has_managed_state
     and not (old.category = 'reservation' and new.category = 'stamp') then
    return new;
  end if;

  if tg_op <> 'DELETE' and new.category = 'stamp' then
    new_effects := public.outbound_inventory_effects(new.jsonb->'items');
  end if;

  movement_kind := case
    when tg_op = 'DELETE' then 'outbound_cancel'
    when old_effects = '{}'::jsonb then 'sale_out'
    else 'outbound_edit'
  end;

  for effect_entry in
    select key as item_name
    from (
      select key from jsonb_each(old_effects)
      union
      select key from jsonb_each(new_effects)
    ) names
  loop
    change_quantity :=
      coalesce((new_effects->>effect_entry.item_name)::integer, 0) -
      coalesce((old_effects->>effect_entry.item_name)::integer, 0);

    if change_quantity = 0 or not public.is_inventory_item_tracked(effect_entry.item_name) then
      continue;
    end if;

    insert into public.inventory_balances (item_name, quantity, updated_at)
    values (effect_entry.item_name, change_quantity, now())
    on conflict (item_name) do update
      set quantity = public.inventory_balances.quantity + excluded.quantity,
          updated_at = now()
    returning quantity into next_quantity;

    insert into public.inventory_movements (
      item_name, movement_type, quantity_delta, quantity_after,
      reference_type, reference_id, note, created_by
    ) values (
      effect_entry.item_name,
      case
        when movement_kind = 'sale_out' and change_quantity > 0 then 'exchange_in'
        else movement_kind
      end,
      change_quantity,
      next_quantity,
      'outbound_log',
      target_log_id::text,
      case movement_kind
        when 'sale_out' then '출고 처리'
        when 'outbound_edit' then '출고 수정'
        else '출고 취소'
      end,
      actor_id
    );
  end loop;

  if tg_op = 'DELETE' then
    delete from public.inventory_outbound_log_states where log_id = target_log_id;
    return old;
  end if;

  insert into public.inventory_outbound_log_states (log_id, effects, updated_at)
  values (target_log_id, new_effects, now())
  on conflict (log_id) do update
    set effects = excluded.effects, updated_at = now();
  return new;
end;
$$;

drop trigger if exists sync_outbound_log_inventory_trigger on public.logs;
create trigger sync_outbound_log_inventory_trigger
after insert or update or delete on public.logs
for each row execute function public.sync_outbound_log_inventory();

revoke all on function public.outbound_inventory_effects(jsonb) from public, anon, authenticated;
revoke all on function public.preview_outbound_inventory(jsonb, text) from public, anon;
grant execute on function public.preview_outbound_inventory(jsonb, text) to authenticated;

notify pgrst, 'reload schema';
