create or replace function public.receive_customer_refund_inventory(p_refund_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare line record; v_next integer; v_movement_id uuid; v_allocation record; v_item_id bigint; v_remaining integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  for line in select * from public.customer_refund_lines where refund_id=p_refund_id and inventory_movement_id is null loop
    if not public.is_inventory_item_tracked(line.item_name) then continue; end if;
    insert into public.inventory_balances(item_name,quantity,updated_at) values(line.item_name,line.quantity,now())
    on conflict(item_name) do update set quantity=public.inventory_balances.quantity+excluded.quantity,updated_at=now()
    returning quantity into v_next;
    insert into public.inventory_movements(item_name,movement_type,quantity_delta,quantity_after,reference_type,reference_id,note,created_by,inventory_action)
    values(line.item_name,'exchange_in',line.quantity,v_next,'customer_refund',p_refund_id::text,'고객 환불 정상 회수',auth.uid(),'exchange_in') returning id into v_movement_id;
    update public.customer_refund_lines set inventory_movement_id=v_movement_id where id=line.id;
    select id into v_item_id from public.items where id=line.item_id or btrim(item_name)=btrim(line.item_name) order by id limit 1;
    v_remaining := line.quantity;
    for v_allocation in
      select a.quantity as allocated_quantity, a.unit_cost as allocated_unit_cost, a.source_layer_id as allocated_source_layer_id
      from public.inventory_cost_allocations a join public.inventory_cost_events e on e.id=a.outbound_event_id
      where e.reference_type='stamp_log' and e.reference_id=(select source_log_id::text from public.customer_refunds where id=p_refund_id)
        and e.reference_line_key=(line.source_line_index + 1)::text
      order by a.created_at
    loop
      exit when v_remaining <= 0;
      perform public.create_inventory_cost_layer('customer_return_in',now(),v_item_id,line.item_name,
        least(v_remaining,v_allocation.allocated_quantity),v_allocation.allocated_unit_cost,case when v_allocation.allocated_unit_cost is null then 'pending' else 'confirmed' end,
        'front','customer_refund',line.id::text,'cost-restore:'||v_allocation.allocated_source_layer_id::text,v_allocation.allocated_source_layer_id,
        jsonb_build_object('refundId',p_refund_id,'refundLineId',line.id,'sourceLogId',(select source_log_id from public.customer_refunds where id=p_refund_id)));
      v_remaining:=v_remaining-least(v_remaining,v_allocation.allocated_quantity);
    end loop;
    if v_remaining>0 then
      perform public.create_inventory_cost_layer('customer_return_in',now(),v_item_id,line.item_name,v_remaining,null,'pending','front',
        'customer_refund',line.id::text,'pending',null,jsonb_build_object('refundId',p_refund_id,'refundLineId',line.id,'reason','원출고 원가 배정 없음'));
    end if;
  end loop;
end $$;
revoke all on function public.receive_customer_refund_inventory(uuid) from public,anon,authenticated;
