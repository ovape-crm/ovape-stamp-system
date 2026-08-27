-- 실재고 수량은 변경하지 않고 FIFO 원가층만 맞추는 마스터 전용 조정 기록이다.
alter table public.inventory_cost_events
  drop constraint if exists inventory_cost_events_event_type_check;
alter table public.inventory_cost_events
  add constraint inventory_cost_events_event_type_check check (event_type in (
    'opening', 'purchase_in', 'sale_out',
    'customer_exchange_in', 'customer_exchange_out',
    'after_service_out', 'after_service_in',
    'adjustment_in', 'adjustment_out', 'demo_out', 'loss_out', 'reversal',
    'reconciliation_in', 'reconciliation_out'
  ));

create or replace function public.add_inventory_cost_reconciliation_layer(
  p_item_name text,
  p_quantity integer,
  p_unit_cost integer,
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_event_id uuid; v_reference_id text;
begin
  if not exists (select 1 from public.users where id = auth.uid() and oss_role = 'master') then
    raise exception 'MASTER_REQUIRED';
  end if;
  if btrim(coalesce(p_item_name, '')) = '' or p_quantity is null or p_quantity <= 0 then
    raise exception 'INVALID_QUANTITY';
  end if;
  if p_unit_cost is null or p_unit_cost < 0 then raise exception 'INVALID_UNIT_COST'; end if;
  if not public.is_inventory_item_tracked(btrim(p_item_name)) then raise exception 'ITEM_NOT_TRACKED'; end if;
  v_reference_id := gen_random_uuid()::text;
  v_event_id := public.create_inventory_cost_layer(
    'reconciliation_in', now(), null, btrim(p_item_name), p_quantity, p_unit_cost,
    'confirmed', 'back', 'cost_reconciliation', v_reference_id, 'add', null,
    jsonb_strip_nulls(jsonb_build_object('note', nullif(btrim(p_note), ''), 'reconciliation', true))
  );
  return v_event_id;
end;
$$;

create or replace function public.consume_inventory_cost_reconciliation_layer(
  p_layer_id uuid,
  p_quantity integer,
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_layer public.inventory_cost_layers%rowtype; v_event_id uuid; v_reference_id text;
begin
  if not exists (select 1 from public.users where id = auth.uid() and oss_role = 'master') then
    raise exception 'MASTER_REQUIRED';
  end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'INVALID_QUANTITY'; end if;
  select * into v_layer from public.inventory_cost_layers where id = p_layer_id for update;
  if not found then raise exception 'COST_LAYER_NOT_FOUND'; end if;
  if p_quantity > v_layer.remaining_quantity then raise exception 'COST_LAYER_QUANTITY_EXCEEDED'; end if;
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

revoke all on function public.add_inventory_cost_reconciliation_layer(text, integer, integer, text) from public, anon;
grant execute on function public.add_inventory_cost_reconciliation_layer(text, integer, integer, text) to authenticated;
revoke all on function public.consume_inventory_cost_reconciliation_layer(uuid, integer, text) from public, anon;
grant execute on function public.consume_inventory_cost_reconciliation_layer(uuid, integer, text) to authenticated;
