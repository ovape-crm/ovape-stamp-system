create or replace function public.sync_purchase_receipt_cost_layer()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_receipt public.inventory_purchase_receipts%rowtype; v_order_line public.inventory_purchase_order_lines%rowtype; v_item_id bigint;
begin
  select * into v_receipt from public.inventory_purchase_receipts where id = new.receipt_id;
  select * into v_order_line from public.inventory_purchase_order_lines where id = new.order_line_id;
  if v_receipt.reversed_at is not null or v_order_line.handling_type = 'demo'
    or not public.is_inventory_item_tracked(new.item_name) then return new; end if;
  select id into v_item_id from public.items where btrim(item_name) = btrim(new.item_name) order by created_at limit 1;
  perform public.create_inventory_cost_layer(
    case when v_order_line.inbound_type = 'as_exchange_in' then 'after_service_in' else 'purchase_in' end,
    v_receipt.arrived_on::timestamp at time zone 'Asia/Seoul', v_item_id,
    new.item_name, new.quantity, new.unit_price,
    case when new.unit_price is null then 'pending' else 'confirmed' end,
    'back', 'purchase_receipt', new.receipt_id::text, new.id::text, null,
    jsonb_build_object('live', true, 'afterServiceId', v_order_line.after_service_id)
  );
  return new;
end $$;

drop trigger if exists sync_purchase_receipt_cost_layer_trigger on public.inventory_purchase_receipt_lines;
create trigger sync_purchase_receipt_cost_layer_trigger after insert on public.inventory_purchase_receipt_lines
for each row execute function public.sync_purchase_receipt_cost_layer();

create or replace function public.sync_standard_outbound_cost_ledger()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_item jsonb; v_index integer := 0; v_name text; v_quantity integer; v_action text; v_remark text;
  v_event_type text; v_effect text; v_available integer; v_missing integer;
begin
  if new.category <> 'stamp' then return new; end if;
  for v_item in select value from jsonb_array_elements(coalesce(new.jsonb->'items', '[]'::jsonb)) loop
    v_index := v_index + 1; v_name := btrim(coalesce(v_item->>'itemName',''));
    v_quantity := coalesce(nullif(v_item->>'quantity','')::integer,0);
    v_action := btrim(coalesce(v_item->>'inventoryAction','')); v_remark := btrim(coalesce(v_item->>'remark',''));
    if v_name = '' or v_quantity <= 0 or not public.is_inventory_item_tracked(v_name) then continue; end if;
    if v_action in ('exchange_in','exchange_out') then continue; end if;
    if v_action = 'adjustment_in' then
      perform public.create_inventory_cost_layer('adjustment_in',new.created_at,null,v_name,v_quantity,null,'pending','back',
        'stamp_log',new.id::text,v_index::text,null,jsonb_build_object('customerId',new.customer_id,'memo',v_remark));
      continue;
    end if;
    if v_action = 'adjustment_out' then v_event_type := 'adjustment_out'; v_effect := 'none';
    elsif v_action = 'as_exchange_out' then v_event_type := 'after_service_out'; v_effect := 'after_service_pending';
    elsif v_action in ('','out') and v_remark !~ '^(서비스|시연용|교환입고|교환출고|A/S 교환출고|재고조정-(입고|출고))($|[,\s(])'
      then v_event_type := 'sale_out'; v_effect := 'sale_cogs';
    else continue; end if;
    select coalesce(sum(remaining_quantity),0)::integer into v_available from public.inventory_cost_layers
      where item_name=v_name and remaining_quantity>0;
    v_missing := greatest(0,v_quantity-v_available);
    if v_missing>0 then perform public.create_inventory_cost_layer('opening',new.created_at-interval '1 microsecond',null,v_name,
      v_missing,null,'pending','back','cost_missing',new.id::text,v_index::text,null,jsonb_build_object('reason','live cost missing')); end if;
    perform public.allocate_inventory_cost_fifo(v_event_type,new.created_at,null,v_name,v_quantity,'stamp_log',new.id::text,
      v_index::text,v_effect,jsonb_build_object('customerId',new.customer_id,'memo',v_remark));
  end loop; return new;
end $$;

drop trigger if exists z_sync_standard_outbound_cost_ledger_trigger on public.logs;
create trigger z_sync_standard_outbound_cost_ledger_trigger after insert on public.logs
for each row execute function public.sync_standard_outbound_cost_ledger();

revoke all on function public.sync_purchase_receipt_cost_layer() from public,anon,authenticated;
revoke all on function public.sync_standard_outbound_cost_ledger() from public,anon,authenticated;
