create or replace function public.get_adjustment_in_cost_options(p_item_name text)
returns table(source_receipt_line_id uuid,arrived_on date,supplier_name text,received_quantity integer)
language sql stable security definer set search_path=public as $$
  select line.id,receipt.arrived_on,supplier.name,line.quantity
  from public.inventory_purchase_receipt_lines line
  join public.inventory_purchase_receipts receipt on receipt.id=line.receipt_id and receipt.reversed_at is null
  join public.inventory_purchase_orders purchase_order on purchase_order.id=receipt.order_id
  join public.inventory_suppliers supplier on supplier.id=purchase_order.supplier_id
  where auth.uid() is not null and btrim(line.item_name)=btrim(p_item_name) and line.unit_price is not null
  order by receipt.arrived_on desc,line.id desc;
$$;
revoke all on function public.get_adjustment_in_cost_options(text) from public,anon;
grant execute on function public.get_adjustment_in_cost_options(text) to authenticated;

create or replace function public.resolve_adjustment_in_cost_source()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_item jsonb; v_index integer:=0; v_source uuid; v_unit_cost integer;
begin
  if new.category<>'stamp' then return new; end if;
  for v_item in select value from jsonb_array_elements(coalesce(new.jsonb->'items','[]'::jsonb)) loop
    v_index:=v_index+1;
    if v_item->>'inventoryAction'<>'adjustment_in' then continue; end if;
    v_source:=nullif(v_item->>'adjustmentCostSourceReceiptLineId','')::uuid;
    if v_source is null then continue; end if;
    select unit_price into v_unit_cost from public.inventory_purchase_receipt_lines
    where id=v_source and btrim(item_name)=btrim(v_item->>'itemName');
    if not found then raise exception 'ADJUSTMENT_COST_SOURCE_INVALID'; end if;
    update public.inventory_cost_layers layer set unit_cost=v_unit_cost,cost_status='confirmed',source_layer_id=(
      select source_layer.id from public.inventory_cost_layers source_layer
      join public.inventory_cost_events source_event on source_event.id=source_layer.source_event_id
      where source_event.reference_type='purchase_receipt' and source_event.reference_line_key=v_source::text
      order by source_event.event_at desc limit 1
    )
    from public.inventory_cost_events event
    where event.id=layer.source_event_id and event.reference_type='stamp_log' and event.reference_id=new.id::text
      and event.reference_line_key=v_index::text and event.event_type='adjustment_in';
    update public.inventory_cost_events event set total_cost=layer.original_quantity*v_unit_cost,
      metadata=event.metadata||jsonb_build_object('sourceReceiptLineId',v_source)
    from public.inventory_cost_layers layer where layer.source_event_id=event.id
      and event.reference_type='stamp_log' and event.reference_id=new.id::text and event.reference_line_key=v_index::text;
  end loop; return new;
end $$;
drop trigger if exists zw_resolve_adjustment_in_cost_source_trigger on public.logs;
create trigger zw_resolve_adjustment_in_cost_source_trigger after insert or update of jsonb,category on public.logs
for each row execute function public.resolve_adjustment_in_cost_source();
revoke all on function public.resolve_adjustment_in_cost_source() from public,anon,authenticated;
