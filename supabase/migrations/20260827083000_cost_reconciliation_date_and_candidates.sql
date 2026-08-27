drop function if exists public.add_inventory_cost_reconciliation_layer(text, integer, integer, text);

create or replace function public.add_inventory_cost_reconciliation_layer(
  p_item_name text,
  p_quantity integer,
  p_unit_cost integer,
  p_event_at timestamptz,
  p_queue_position text,
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_event_id uuid; v_reference_id text;
begin
  if not exists (select 1 from public.users where id = auth.uid() and oss_role = 'master') then raise exception 'MASTER_REQUIRED'; end if;
  if btrim(coalesce(p_item_name, '')) = '' or p_quantity is null or p_quantity <= 0 then raise exception 'INVALID_QUANTITY'; end if;
  if p_unit_cost is null or p_unit_cost < 0 then raise exception 'INVALID_UNIT_COST'; end if;
  if p_event_at is null then raise exception 'EVENT_DATE_REQUIRED'; end if;
  if p_queue_position not in ('front', 'back') then raise exception 'INVALID_QUEUE_POSITION'; end if;
  if not public.is_inventory_item_tracked(btrim(p_item_name)) then raise exception 'ITEM_NOT_TRACKED'; end if;
  v_reference_id := gen_random_uuid()::text;
  v_event_id := public.create_inventory_cost_layer(
    'reconciliation_in', p_event_at, null, btrim(p_item_name), p_quantity, p_unit_cost,
    'confirmed', p_queue_position, 'cost_reconciliation', v_reference_id, 'add', null,
    jsonb_strip_nulls(jsonb_build_object('note', nullif(btrim(p_note), ''), 'reconciliation', true))
  );
  return v_event_id;
end;
$$;

create or replace function public.get_inventory_purchase_cost_candidates(p_item_name text)
returns table(arrived_on date, unit_cost integer, supplier_name text)
language sql security definer set search_path = public stable as $$
  select receipt.arrived_on, line.unit_price, supplier.name
  from public.inventory_purchase_receipt_lines line
  join public.inventory_purchase_receipts receipt on receipt.id = line.receipt_id and receipt.reversed_at is null
  join public.inventory_purchase_orders purchase_order on purchase_order.id = receipt.order_id
  left join public.inventory_suppliers supplier on supplier.id = purchase_order.supplier_id
  where btrim(line.item_name) = btrim(p_item_name) and line.unit_price is not null
  order by receipt.arrived_on desc, receipt.created_at desc, line.id desc
  limit 5;
$$;

revoke all on function public.add_inventory_cost_reconciliation_layer(text, integer, integer, timestamptz, text, text) from public, anon;
grant execute on function public.add_inventory_cost_reconciliation_layer(text, integer, integer, timestamptz, text, text) to authenticated;
revoke all on function public.get_inventory_purchase_cost_candidates(text) from public, anon;
grant execute on function public.get_inventory_purchase_cost_candidates(text) to authenticated;
