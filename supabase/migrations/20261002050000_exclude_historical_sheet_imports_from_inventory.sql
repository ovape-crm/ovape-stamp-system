-- 구글시트의 과거 판매 이력은 고객 이력만 보존하며, 현재 재고·원가에는 영향을 주지 않는다.
-- 2026-09-30 반영분은 기존 출고 트리거가 일반 판매로 처리한 건을 정확히 되돌린다.

create table if not exists public.historical_sheet_import_inventory_repair_audit (
  original_movement_id uuid primary key,
  log_id bigint not null references public.logs(id) on delete restrict,
  movement_snapshot jsonb not null,
  repaired_at timestamptz not null default now()
);

alter table public.historical_sheet_import_inventory_repair_audit enable row level security;
revoke all on public.historical_sheet_import_inventory_repair_audit from public, anon, authenticated;
grant select on public.historical_sheet_import_inventory_repair_audit to authenticated;
create policy "master reads historical sheet inventory repair audit"
  on public.historical_sheet_import_inventory_repair_audit for select to authenticated
  using (exists (
    select 1 from public.users where id = auth.uid() and oss_role = 'master'
  ));

create table if not exists public.historical_sheet_import_cost_repair_audit (
  original_event_id uuid primary key,
  log_id bigint not null references public.logs(id) on delete restrict,
  cost_event_snapshot jsonb not null,
  allocation_snapshots jsonb not null,
  repaired_at timestamptz not null default now()
);

alter table public.historical_sheet_import_cost_repair_audit enable row level security;
revoke all on public.historical_sheet_import_cost_repair_audit from public, anon, authenticated;
grant select on public.historical_sheet_import_cost_repair_audit to authenticated;
create policy "master reads historical sheet cost repair audit"
  on public.historical_sheet_import_cost_repair_audit for select to authenticated
  using (exists (
    select 1 from public.users where id = auth.uid() and oss_role = 'master'
  ));

-- 이후 이력 가져오기에서도 재고 상태를 생성하거나 수정하지 않는다.
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
  source_items jsonb :=
    coalesce(new.jsonb->'items', '[]'::jsonb) ||
    coalesce(old.jsonb->'items', '[]'::jsonb);
  has_managed_state boolean := false;
  effect_entry record;
  source_item jsonb;
  change_quantity integer;
  next_quantity integer;
  movement_kind text;
  actor_id uuid := coalesce(new.admin_id, old.admin_id);
  snapshot_customer_id text := coalesce(new.customer_id, old.customer_id)::text;
  snapshot_customer_name text;
begin
  if coalesce(
    (case when tg_op = 'DELETE' then old.jsonb else new.jsonb end)
      ? 'historicalSheetImport',
    false
  ) then
    delete from public.inventory_outbound_log_states where log_id = target_log_id;
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if snapshot_customer_id is not null then
    select customer.name into snapshot_customer_name
    from public.customers customer
    where customer.id::text = snapshot_customer_id;
  end if;

  select effects into old_effects
  from public.inventory_outbound_log_states
  where log_id = target_log_id
  for update;
  has_managed_state := found;
  old_effects := coalesce(old_effects, '{}'::jsonb);

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

    select item.value into source_item
    from jsonb_array_elements(source_items) item(value)
    where btrim(item.value->>'itemName') = effect_entry.item_name
    limit 1;

    insert into public.inventory_balances (item_name, quantity, updated_at)
    values (effect_entry.item_name, change_quantity, now())
    on conflict (item_name) do update
      set quantity = public.inventory_balances.quantity + excluded.quantity,
          updated_at = now()
    returning quantity into next_quantity;

    insert into public.inventory_movements (
      item_name, movement_type, quantity_delta, quantity_after,
      reference_type, reference_id, note, created_by,
      counterparty_name, counterparty_id, inventory_action, item_remark
    ) values (
      effect_entry.item_name,
      case
        when movement_kind = 'sale_out' and change_quantity > 0 then 'exchange_in'
        else movement_kind
      end,
      change_quantity,
      next_quantity,
      'outbound_log',
      target_log_id,
      case movement_kind
        when 'sale_out' then '출고 처리'
        when 'outbound_edit' then '출고 수정'
        else '출고 취소'
      end,
      actor_id,
      snapshot_customer_name,
      snapshot_customer_id,
      source_item->>'inventoryAction',
      source_item->>'remark'
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

-- 원가 원장도 같은 이력 가져오기 표시를 만나면 생성하지 않는다.
create or replace function public.sync_standard_outbound_cost_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  i jsonb;
  n integer := 0;
  v_name text;
  v_qty integer;
  v_action text;
  v_remark text;
  v_type text;
  v_effect text;
  v_available integer;
  v_missing integer;
begin
  if new.category <> 'stamp' or new.jsonb ? 'historicalSheetImport' then return new; end if;

  for i in select value from jsonb_array_elements(coalesce(new.jsonb->'items', '[]')) loop
    n := n + 1;
    if coalesce(i->>'source', '') = 'defective_hold' then continue; end if;

    v_name := btrim(coalesce(i->>'itemName', ''));
    v_qty := coalesce(nullif(i->>'quantity', '')::integer, 0);
    v_action := btrim(coalesce(i->>'inventoryAction', ''));
    v_remark := btrim(coalesce(i->>'remark', ''));
    if v_name = '' or v_qty <= 0 or not public.is_inventory_item_tracked(v_name) then continue; end if;
    if v_action in ('exchange_in', 'exchange_out') then continue; end if;
    if exists(select 1 from public.inventory_service_cost_links where log_id = new.id and line_index = n)
      or exists(select 1 from public.inventory_service_manual_costs where log_id = new.id and line_index = n) then continue; end if;

    if v_action = 'adjustment_in' then
      perform public.create_inventory_cost_layer(
        'adjustment_in', new.created_at, null, v_name, v_qty, null, 'pending', 'front',
        'stamp_log', new.id::text, n::text, null,
        jsonb_build_object('customerId', new.customer_id, 'memo', v_remark)
      );
      continue;
    end if;

    if v_action = 'adjustment_out' then
      v_type := 'adjustment_out'; v_effect := 'none';
    elsif v_action = 'as_exchange_out' then
      v_type := 'after_service_out'; v_effect := 'after_service_pending';
    elsif v_action in ('', 'out') and v_remark ~ '^시연용($|[,\s(])' then
      v_type := 'demo_out'; v_effect := 'demo_expense';
    elsif v_action in ('', 'out') and v_remark ~ '^서비스($|[,\s(])' then
      v_type := 'service_out'; v_effect := 'none';
    elsif v_action in ('', 'out') and v_remark !~ '^(교환입고|교환출고|A/S 교환출고|재고조정-(입고|출고))($|[,\s(])' then
      v_type := 'sale_out'; v_effect := 'sale_cogs';
    else
      continue;
    end if;

    perform pg_advisory_xact_lock(hashtextextended(v_name, 0));
    if not exists(
      select 1 from public.inventory_cost_events
      where reference_type = 'stamp_log'
        and reference_id = new.id::text
        and reference_line_key = n::text
        and event_type = v_type
    ) then
      select coalesce(sum(layer.remaining_quantity), 0)
      into v_available
      from public.inventory_cost_layers layer
      join public.inventory_cost_events event on event.id = layer.source_event_id
      where layer.item_name = v_name
        and layer.remaining_quantity > 0
        and event.event_at <= new.created_at;
      v_missing := greatest(0, v_qty - v_available);
      if v_missing > 0 then
        perform public.create_inventory_cost_layer(
          'opening', new.created_at - interval '1 microsecond', null, v_name,
          v_missing, null, 'pending', 'back', 'cost_missing', new.id::text,
          n::text, null, jsonb_build_object('reason', 'live cost missing')
        );
      end if;
    end if;

    perform public.allocate_inventory_cost_fifo(
      v_type, new.created_at, null, v_name, v_qty, 'stamp_log', new.id::text,
      n::text, v_effect,
      jsonb_strip_nulls(jsonb_build_object(
        'customerId', new.customer_id,
        'memo', v_remark,
        'afterServiceId', coalesce(new.jsonb->>'afterServiceId', new.after_service_id::text)
      ))
    );
  end loop;
  return new;
end;
$$;

-- 영향받은 출고 움직임을 감사 테이블에 보존한 뒤, 품목별 보정 이력 하나로 대체한다.
insert into public.historical_sheet_import_inventory_repair_audit (
  original_movement_id, log_id, movement_snapshot
)
select movement.id, log.id, to_jsonb(movement)
from public.inventory_movements movement
join public.logs log on log.id::text = movement.reference_id
where movement.reference_type = 'outbound_log'
  and log.jsonb ? 'historicalSheetImport'
on conflict (original_movement_id) do nothing;

with corrections as (
  select
    movement.item_name,
    -sum(movement.quantity_delta)::integer as quantity_delta,
    (array_agg(movement.created_by order by movement.created_at))[1] as created_by
  from public.inventory_movements movement
  join public.logs log on log.id::text = movement.reference_id
  where movement.reference_type = 'outbound_log'
    and log.jsonb ? 'historicalSheetImport'
  group by movement.item_name
), updated_balances as (
  insert into public.inventory_balances (item_name, quantity, updated_at)
  select item_name, quantity_delta, now()
  from corrections
  on conflict (item_name) do update
    set quantity = public.inventory_balances.quantity + excluded.quantity,
        updated_at = now()
  returning item_name, quantity
)
insert into public.inventory_movements (
  item_name, movement_type, quantity_delta, quantity_after,
  reference_type, reference_id, note, created_by, inventory_action, item_remark
)
select
  correction.item_name,
  'adjustment',
  correction.quantity_delta,
  balance.quantity,
  'historical_sheet_import_repair',
  '2026-09-30',
  '구글시트 과거 이력 반영분 재고 보정',
  correction.created_by,
  'adjustment_in',
  '과거 이력은 현재 재고에 반영하지 않음'
from corrections correction
join updated_balances balance on balance.item_name = correction.item_name;

delete from public.inventory_movements movement
using public.logs log
where movement.reference_type = 'outbound_log'
  and log.id::text = movement.reference_id
  and log.jsonb ? 'historicalSheetImport';

delete from public.inventory_outbound_log_states state
using public.logs log
where state.log_id = log.id::text
  and log.jsonb ? 'historicalSheetImport';

-- 가짜 판매 원가 이벤트와 배분을 감사 테이블에 보존하고, 소진한 원가층을 복구한다.
insert into public.historical_sheet_import_cost_repair_audit (
  original_event_id, log_id, cost_event_snapshot, allocation_snapshots
)
select
  event.id,
  log.id,
  to_jsonb(event),
  coalesce(jsonb_agg(to_jsonb(allocation)) filter (where allocation.id is not null), '[]'::jsonb)
from public.inventory_cost_events event
join public.logs log on log.id::text = event.reference_id
left join public.inventory_cost_allocations allocation on allocation.outbound_event_id = event.id
where event.reference_type = 'stamp_log'
  and log.jsonb ? 'historicalSheetImport'
group by event.id, log.id
on conflict (original_event_id) do nothing;

do $$
declare
  target_event record;
  allocation record;
begin
  for target_event in
    select event.id, event.item_name, event.reference_id
    from public.inventory_cost_events event
    join public.logs log on log.id::text = event.reference_id
    where event.reference_type = 'stamp_log'
      and log.jsonb ? 'historicalSheetImport'
    order by event.item_name, event.id
  loop
    perform pg_advisory_xact_lock(hashtextextended(btrim(target_event.item_name), 0));

    for allocation in
      select source_layer_id, sum(quantity)::integer as quantity
      from public.inventory_cost_allocations
      where outbound_event_id = target_event.id
      group by source_layer_id
    loop
      update public.inventory_cost_layers
      set remaining_quantity = remaining_quantity + allocation.quantity
      where id = allocation.source_layer_id;
    end loop;

    delete from public.inventory_cost_events where id = target_event.id;
    perform public.cleanup_unused_outbound_missing_layers(
      target_event.reference_id,
      target_event.reference_id::bigint
    );
  end loop;
end;
$$;

notify pgrst, 'reload schema';
