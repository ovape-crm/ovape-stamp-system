-- Payment/memo edits must not allocate legacy service quantities again.
create or replace function public.sync_standard_outbound_cost_ledger()
returns trigger language plpgsql security definer set search_path=public as $$
declare i jsonb; n integer:=0; v_name text; v_qty integer; v_action text; v_remark text;
  v_type text; v_effect text; v_available integer; v_missing integer;
begin
  if new.category<>'stamp' then return new; end if;
  for i in select value from jsonb_array_elements(coalesce(new.jsonb->'items','[]')) loop
    n:=n+1; v_name:=btrim(coalesce(i->>'itemName','')); v_qty:=coalesce(nullif(i->>'quantity','')::integer,0);
    v_action:=btrim(coalesce(i->>'inventoryAction','')); v_remark:=btrim(coalesce(i->>'remark',''));
    if v_name='' or v_qty<=0 or not public.is_inventory_item_tracked(v_name) then continue; end if;
    if v_action in ('exchange_in','exchange_out') then continue; end if;
    if exists(select 1 from public.inventory_service_cost_links where log_id=new.id and line_index=n)
      or exists(select 1 from public.inventory_service_manual_costs where log_id=new.id and line_index=n) then continue; end if;
    if v_action='adjustment_in' then
      perform public.create_inventory_cost_layer('adjustment_in',new.created_at,null,v_name,v_qty,null,'pending','front',
        'stamp_log',new.id::text,n::text,null,jsonb_build_object('customerId',new.customer_id,'memo',v_remark));
      continue;
    end if;
    if v_action='adjustment_out' then v_type:='adjustment_out'; v_effect:='none';
    elsif v_action='as_exchange_out' then v_type:='after_service_out'; v_effect:='after_service_pending';
    elsif v_action in ('','out') and v_remark ~ '^시연용($|[,\s(])' then v_type:='demo_out'; v_effect:='demo_expense';
    elsif v_action in ('','out') and v_remark ~ '^서비스($|[,\s(])' then v_type:='service_out'; v_effect:='none';
    elsif v_action in ('','out') and v_remark !~ '^(교환입고|교환출고|A/S 교환출고|재고조정-(입고|출고))($|[,\s(])' then v_type:='sale_out'; v_effect:='sale_cogs';
    else continue; end if;
    perform pg_advisory_xact_lock(hashtextextended(v_name,0));
    if not exists(select 1 from public.inventory_cost_events where reference_type='stamp_log' and reference_id=new.id::text and reference_line_key=n::text and event_type=v_type) then
      select coalesce(sum(l.remaining_quantity),0) into v_available from public.inventory_cost_layers l
        join public.inventory_cost_events e on e.id=l.source_event_id
        where l.item_name=v_name and l.remaining_quantity>0 and e.event_at<=new.created_at;
      v_missing:=greatest(0,v_qty-v_available);
      if v_missing>0 then
        perform public.create_inventory_cost_layer('opening',new.created_at-interval '1 microsecond',null,v_name,v_missing,null,'pending','back',
          'cost_missing',new.id::text,n::text,null,jsonb_build_object('reason','live cost missing'));
      end if;
    end if;
    perform public.allocate_inventory_cost_fifo(v_type,new.created_at,null,v_name,v_qty,'stamp_log',new.id::text,n::text,v_effect,
      jsonb_strip_nulls(jsonb_build_object('customerId',new.customer_id,'memo',v_remark,'afterServiceId',coalesce(new.jsonb->>'afterServiceId',new.after_service_id::text))));
  end loop;
  return new;
end $$;
