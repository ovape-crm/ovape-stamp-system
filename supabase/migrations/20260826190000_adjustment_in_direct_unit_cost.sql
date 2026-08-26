create or replace function public.resolve_adjustment_in_cost_source()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_item jsonb;
  v_index integer := 0;
  v_source uuid;
  v_unit_cost integer;
begin
  if new.category <> 'stamp' then return new; end if;
  for v_item in select value from jsonb_array_elements(coalesce(new.jsonb->'items','[]'::jsonb)) loop
    v_index := v_index + 1;
    if v_item->>'inventoryAction' <> 'adjustment_in' then continue; end if;
    v_source := nullif(v_item->>'adjustmentCostSourceReceiptLineId','')::uuid;
    v_unit_cost := nullif(v_item->>'adjustmentUnitCost','')::integer;

    if v_unit_cost is not null then
      if v_unit_cost < 0 then raise exception 'ADJUSTMENT_UNIT_COST_INVALID'; end if;
      v_source := null;
    elsif v_source is not null then
      select unit_price into v_unit_cost
      from public.inventory_purchase_receipt_lines
      where id = v_source and btrim(item_name) = btrim(v_item->>'itemName');
      if not found then raise exception 'ADJUSTMENT_COST_SOURCE_INVALID'; end if;
    else
      continue;
    end if;

    update public.inventory_cost_layers layer
    set unit_cost = v_unit_cost,
        cost_status = 'confirmed',
        source_layer_id = case when v_source is null then null else (
          select source_layer.id
          from public.inventory_cost_layers source_layer
          join public.inventory_cost_events source_event
            on source_event.id = source_layer.source_event_id
          where source_event.reference_type = 'purchase_receipt'
            and source_event.reference_line_key = v_source::text
          order by source_event.event_at desc limit 1
        ) end
    from public.inventory_cost_events event
    where event.id = layer.source_event_id
      and event.reference_type = 'stamp_log'
      and event.reference_id = new.id::text
      and event.reference_line_key = v_index::text
      and event.event_type = 'adjustment_in';

    update public.inventory_cost_events event
    set total_cost = layer.original_quantity * v_unit_cost,
        metadata = event.metadata || jsonb_strip_nulls(jsonb_build_object(
          'sourceReceiptLineId', v_source,
          'directUnitCost', case when v_source is null then v_unit_cost else null end
        ))
    from public.inventory_cost_layers layer
    where layer.source_event_id = event.id
      and event.reference_type = 'stamp_log'
      and event.reference_id = new.id::text
      and event.reference_line_key = v_index::text;
  end loop;
  return new;
end $$;
