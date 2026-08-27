-- 이전 원가층 소진 기능은 실제 재고보다 많이 줄일 수 있어 반대쪽 불일치를 만들 수 있었다.
-- 적용된 모든 원가층 소진 기록은 원본 원가층 잔량으로 즉시 되돌리고, 이력에는 원복 사실만 남긴다.
do $$
declare
  v_layer record;
begin
  for v_layer in
    select allocation.source_layer_id, sum(allocation.quantity)::integer as quantity
    from public.inventory_cost_events event
    join public.inventory_cost_allocations allocation on allocation.outbound_event_id = event.id
    where event.event_type = 'reconciliation_out'
      and event.reference_type = 'cost_reconciliation'
      and event.metadata->>'restoredAt' is null
    group by allocation.source_layer_id
  loop
    update public.inventory_cost_layers
    set remaining_quantity = remaining_quantity + v_layer.quantity
    where id = v_layer.source_layer_id;
  end loop;

  update public.inventory_cost_events
  set metadata = metadata || jsonb_build_object('restoredAt', now()::text, 'restoredReason', 'over-consumption guard')
  where event_type = 'reconciliation_out'
    and reference_type = 'cost_reconciliation'
    and metadata->>'restoredAt' is null;
end;
$$;

create or replace function public.consume_inventory_cost_reconciliation_layer(
  p_layer_id uuid,
  p_quantity integer,
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_layer public.inventory_cost_layers%rowtype;
  v_event_id uuid;
  v_reference_id text;
  v_actual_quantity integer;
  v_layer_quantity integer;
  v_consumable_quantity integer;
begin
  if not exists (select 1 from public.users where id = auth.uid() and oss_role = 'master') then
    raise exception 'MASTER_REQUIRED';
  end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'INVALID_QUANTITY'; end if;

  select * into v_layer from public.inventory_cost_layers where id = p_layer_id for update;
  if not found then raise exception 'COST_LAYER_NOT_FOUND'; end if;

  perform pg_advisory_xact_lock(hashtext(btrim(v_layer.item_name)));
  select coalesce(quantity, 0)::integer into v_actual_quantity
  from public.inventory_balances
  where btrim(item_name) = btrim(v_layer.item_name);
  v_actual_quantity := coalesce(v_actual_quantity, 0);

  select coalesce(sum(remaining_quantity), 0)::integer into v_layer_quantity
  from public.inventory_cost_layers
  where btrim(item_name) = btrim(v_layer.item_name);
  v_consumable_quantity := greatest(v_layer_quantity - v_actual_quantity, 0);

  if p_quantity > v_layer.remaining_quantity then raise exception 'COST_LAYER_QUANTITY_EXCEEDED'; end if;
  if p_quantity > v_consumable_quantity then raise exception 'COST_LAYER_RECONCILIATION_EXCESS_EXCEEDED'; end if;

  v_reference_id := gen_random_uuid()::text;
  insert into public.inventory_cost_events(
    event_type, event_at, item_id, item_name, direction, quantity, total_cost,
    reference_type, reference_id, reference_line_key, settlement_effect, metadata, created_by
  ) values (
    'reconciliation_out', now(), v_layer.item_id, v_layer.item_name, 'out', p_quantity,
    case when v_layer.unit_cost is null then null else p_quantity * v_layer.unit_cost end,
    'cost_reconciliation', v_reference_id, v_layer.id::text, 'none',
    jsonb_strip_nulls(jsonb_build_object('note', nullif(btrim(p_note), ''), 'reconciliation', true, 'sourceLayerId', v_layer.id)),
    auth.uid()
  ) returning id into v_event_id;
  insert into public.inventory_cost_allocations(outbound_event_id, source_layer_id, quantity, unit_cost)
  values(v_event_id, v_layer.id, p_quantity, v_layer.unit_cost);
  update public.inventory_cost_layers set remaining_quantity = remaining_quantity - p_quantity where id = v_layer.id;
  return v_event_id;
end;
$$;
