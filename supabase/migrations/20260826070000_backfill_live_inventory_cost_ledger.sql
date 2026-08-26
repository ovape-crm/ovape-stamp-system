do $$
declare
  v_actor uuid;
  v_record record;
  v_item jsonb;
  v_name text;
  v_quantity integer;
  v_unit_cost integer;
  v_item_id bigint;
  v_action text;
  v_remark text;
  v_available integer;
  v_missing integer;
  v_event_type text;
  v_effect text;
  v_position text;
  v_index integer;
begin
  select id into v_actor from public.users
  where oss_role = 'master' order by created_at limit 1;
  if v_actor is null then raise exception 'MASTER_REQUIRED_FOR_COST_BACKFILL'; end if;
  perform set_config('request.jwt.claim.sub', v_actor::text, true);

  for v_record in
    select * from (
      select
        'receipt'::text as record_type,
        (receipt.arrived_on::timestamp at time zone 'Asia/Seoul') as record_at,
        receipt.id::text || ':' || line.id::text as record_key,
        jsonb_build_object(
          'receiptId', receipt.id,
          'lineId', line.id,
          'itemName', line.item_name,
          'quantity', line.quantity,
          'unitCost', line.unit_price,
          'inboundType', order_line.inbound_type,
          'handlingType', order_line.handling_type
        ) as payload,
        receipt.created_by as actor_id,
        null::bigint as customer_id
      from public.inventory_purchase_receipts receipt
      join public.inventory_purchase_receipt_lines line on line.receipt_id = receipt.id
      join public.inventory_purchase_order_lines order_line on order_line.id = line.order_line_id
      where receipt.reversed_at is null and receipt.arrived_on >= '2026-07-22'

      union all

      select
        'log', log.created_at, log.id::text,
        log.jsonb, log.admin_id, log.customer_id
      from public.logs log
      where log.category = 'stamp' and log.created_at >= '2026-07-22 00:00:00+09'
    ) records
    order by record_at, case when record_type = 'receipt' then 0 else 1 end, record_key
  loop
    if v_record.record_type = 'receipt' then
      if coalesce(v_record.payload->>'handlingType', '') = 'demo' then continue; end if;
      v_name := btrim(coalesce(v_record.payload->>'itemName', ''));
      v_quantity := coalesce(nullif(v_record.payload->>'quantity', '')::integer, 0);
      v_unit_cost := nullif(v_record.payload->>'unitCost', '')::integer;
      if v_name = '' or v_quantity <= 0 or not public.is_inventory_item_tracked(v_name) then continue; end if;
      select item.id into v_item_id from public.items item
      where btrim(item.item_name) = v_name order by item.created_at limit 1;
      perform public.create_inventory_cost_layer(
        case when coalesce(v_record.payload->>'inboundType', '') = 'as_exchange_in'
          then 'after_service_in' else 'purchase_in' end,
        v_record.record_at, v_item_id, v_name, v_quantity, v_unit_cost,
        case when v_unit_cost is null then 'pending' else 'confirmed' end,
        'back', 'purchase_receipt', v_record.payload->>'receiptId',
        v_record.payload->>'lineId', null,
        jsonb_build_object('backfilled', true)
      );
      continue;
    end if;

    v_index := 0;
    for v_item in select value from jsonb_array_elements(coalesce(v_record.payload->'items', '[]'::jsonb))
    loop
      v_index := v_index + 1;
      v_name := btrim(coalesce(v_item->>'itemName', ''));
      v_quantity := coalesce(nullif(v_item->>'quantity', '')::integer, 0);
      v_action := btrim(coalesce(v_item->>'inventoryAction', ''));
      v_remark := btrim(coalesce(v_item->>'remark', ''));
      v_item_id := case when coalesce(v_item->>'itemId', '') ~ '^[0-9]+$'
        then (v_item->>'itemId')::bigint else null end;
      if v_item_id is not null and not exists (select 1 from public.items where id = v_item_id)
        then v_item_id := null; end if;
      if v_name = '' or v_quantity <= 0 or not public.is_inventory_item_tracked(v_name) then continue; end if;

      if v_action in ('exchange_in', 'adjustment_in') then
        v_event_type := case when v_action = 'exchange_in'
          then 'customer_exchange_in' else 'adjustment_in' end;
        v_position := case when v_action = 'exchange_in' then 'front' else 'back' end;
        perform public.create_inventory_cost_layer(
          v_event_type, v_record.record_at, v_item_id, v_name, v_quantity,
          null, 'pending', v_position, 'stamp_log', v_record.record_key,
          v_index::text, null,
          jsonb_build_object('customerId', v_record.customer_id, 'backfilled', true)
        );
        continue;
      end if;
      if v_action not in ('', 'out', 'exchange_out', 'as_exchange_out', 'adjustment_out') then continue; end if;

      if v_action in ('', 'out') and v_remark ~ '^시연용($|[,\s(])' then
        v_event_type := 'demo_out'; v_effect := 'demo_expense';
      elsif v_action in ('', 'out') and v_remark ~ '^(서비스|교환입고|교환출고|A/S 교환출고|재고조정-(입고|출고))($|[,\s(])' then
        continue;
      else
        v_event_type := case v_action
          when 'exchange_out' then 'customer_exchange_out'
          when 'as_exchange_out' then 'after_service_out'
          when 'adjustment_out' then 'adjustment_out'
          else 'sale_out' end;
        v_effect := case v_event_type
          when 'sale_out' then 'sale_cogs'
          when 'customer_exchange_out' then 'customer_exchange_difference'
          when 'after_service_out' then 'after_service_pending'
          else 'none' end;
      end if;

      select coalesce(sum(remaining_quantity), 0)::integer into v_available
      from public.inventory_cost_layers where item_name = v_name and remaining_quantity > 0;
      v_missing := greatest(0, v_quantity - v_available);
      if v_missing > 0 then
        perform public.create_inventory_cost_layer(
          'opening', v_record.record_at - interval '1 microsecond', v_item_id,
          v_name, v_missing, null, 'pending', 'back', 'cost_missing',
          v_record.record_key, v_index::text, null,
          jsonb_build_object('reason', 'live FIFO quantity missing')
        );
      end if;
      perform public.allocate_inventory_cost_fifo(
        v_event_type, v_record.record_at, v_item_id, v_name, v_quantity,
        'stamp_log', v_record.record_key, v_index::text, v_effect,
        jsonb_build_object('customerId', v_record.customer_id, 'backfilled', true)
      );
    end loop;
  end loop;
end;
$$;
