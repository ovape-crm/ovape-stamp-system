create or replace function public.attach_after_service_id_to_cost_events()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.category = 'stamp' and nullif(new.jsonb->>'afterServiceId','') is not null then
    update public.inventory_cost_events
    set metadata = metadata || jsonb_build_object('afterServiceId', new.jsonb->>'afterServiceId')
    where reference_type = 'stamp_log' and reference_id = new.id::text;
  end if;
  return new;
end $$;
drop trigger if exists zy_attach_after_service_id_to_cost_events_trigger on public.logs;
create trigger zy_attach_after_service_id_to_cost_events_trigger after insert on public.logs
for each row execute function public.attach_after_service_id_to_cost_events();

create or replace function public.sync_purchase_receipt_cost_layer()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_receipt public.inventory_purchase_receipts%rowtype;
  v_order_line public.inventory_purchase_order_lines%rowtype;
  v_after_service public.after_services%rowtype;
  v_item_id bigint;
  v_allocation record;
  v_remaining integer;
  v_take integer;
  v_skip integer;
  v_segment integer := 0;
begin
  select * into v_receipt from public.inventory_purchase_receipts where id = new.receipt_id;
  select * into v_order_line from public.inventory_purchase_order_lines where id = new.order_line_id;
  if v_receipt.reversed_at is not null or v_order_line.handling_type = 'demo'
    or not public.is_inventory_item_tracked(new.item_name) then return new; end if;
  select id into v_item_id from public.items where btrim(item_name)=btrim(new.item_name) order by created_at limit 1;

  if v_order_line.inbound_type = 'as_exchange_in' and v_order_line.after_service_id is not null then
    select * into v_after_service from public.after_services where id=v_order_line.after_service_id;
  end if;
  if found and v_after_service.service_case_type = 'customer_as' then
    select coalesce(sum(layer.original_quantity),0)::integer into v_skip
    from public.inventory_cost_layers layer join public.inventory_cost_events event on event.id=layer.source_event_id
    where event.event_type='after_service_in' and event.metadata->>'afterServiceId'=v_after_service.id::text;
    v_remaining := new.quantity;
    for v_allocation in
      select allocation.quantity, allocation.unit_cost, allocation.source_layer_id
      from public.inventory_cost_events event
      join public.inventory_cost_allocations allocation on allocation.outbound_event_id=event.id
      where event.event_type='after_service_out'
        and (event.metadata->>'afterServiceId'=v_after_service.id::text or exists (
          select 1 from public.logs log where log.id::text=event.reference_id
            and log.jsonb->>'afterServiceId'=v_after_service.id::text
        ))
      order by event.event_at,event.id,allocation.created_at,allocation.id
    loop
      if v_skip >= v_allocation.quantity then v_skip:=v_skip-v_allocation.quantity; continue; end if;
      v_take:=least(v_remaining,v_allocation.quantity-v_skip); v_skip:=0; v_segment:=v_segment+1;
      perform public.create_inventory_cost_layer(
        'after_service_in',v_receipt.arrived_on::timestamp at time zone 'Asia/Seoul',v_item_id,new.item_name,v_take,
        v_allocation.unit_cost,case when v_allocation.unit_cost is null then 'pending' else 'confirmed' end,'back',
        'purchase_receipt',new.receipt_id::text,new.id::text||':'||v_segment::text,v_allocation.source_layer_id,
        jsonb_build_object('afterServiceId',v_after_service.id,'restoredFromOutbound',true)
      );
      v_remaining:=v_remaining-v_take; exit when v_remaining=0;
    end loop;
    if v_remaining>0 then
      v_segment:=v_segment+1;
      perform public.create_inventory_cost_layer('after_service_in',v_receipt.arrived_on::timestamp at time zone 'Asia/Seoul',
        v_item_id,new.item_name,v_remaining,null,'pending','back','purchase_receipt',new.receipt_id::text,
        new.id::text||':'||v_segment::text,null,jsonb_build_object('afterServiceId',v_after_service.id,'reason','A/S outbound cost missing'));
    end if;
    return new;
  end if;

  perform public.create_inventory_cost_layer(
    case when v_order_line.inbound_type='as_exchange_in' then 'after_service_in' else 'purchase_in' end,
    v_receipt.arrived_on::timestamp at time zone 'Asia/Seoul',v_item_id,new.item_name,new.quantity,new.unit_price,
    case when new.unit_price is null then 'pending' else 'confirmed' end,'back','purchase_receipt',new.receipt_id::text,new.id::text,null,
    jsonb_build_object('live',true,'afterServiceId',v_order_line.after_service_id)
  );
  return new;
end $$;

revoke all on function public.attach_after_service_id_to_cost_events() from public,anon,authenticated;
