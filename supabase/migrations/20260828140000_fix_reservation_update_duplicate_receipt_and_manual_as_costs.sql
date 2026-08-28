-- 예약 → 출고이력 변경이 취소되던 트리거 반환값을 바로잡는다.
create or replace function public.rollback_stamp_log_cost_ledger()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_event record; v_layer record;
begin
  if old.category<>'stamp' then return case when tg_op='UPDATE' then new else old end; end if;
  for v_layer in select layer.* from public.inventory_cost_layers layer join public.inventory_cost_events event on event.id=layer.source_event_id where event.reference_type='stamp_log' and event.reference_id=old.id::text loop
    if v_layer.remaining_quantity<>v_layer.original_quantity then raise exception 'COST_LAYER_ALREADY_CONSUMED: 후속 판매에 사용된 입고 원가가 있어 이 기록을 수정하거나 삭제할 수 없습니다.'; end if;
  end loop;
  for v_event in select allocation.source_layer_id,sum(allocation.quantity)::integer quantity from public.inventory_cost_events event join public.inventory_cost_allocations allocation on allocation.outbound_event_id=event.id where event.reference_type='stamp_log' and event.reference_id=old.id::text group by allocation.source_layer_id loop
    update public.inventory_cost_layers set remaining_quantity=remaining_quantity+v_event.quantity where id=v_event.source_layer_id;
  end loop;
  delete from public.inventory_cost_events where reference_type='stamp_log' and reference_id=old.id::text;
  if tg_op='UPDATE' then delete from public.settlement_expenses where source_log_id=old.id and category in ('고객 교환 원가차액','재고손실'); return new; end if;
  return old;
end;
$$;

-- 에비앙 사하라 30ml 중복 입고 1개(8/19 원가층, receipt d1a...)를 정식 취소한다.
do $$
declare v_next_quantity integer; v_actor uuid;
begin
  select id into v_actor from public.users where oss_role='master' order by created_at limit 1;
  if not exists(select 1 from public.inventory_purchase_receipts where id='d1a4a4ac-c7f9-46dc-8eec-644da7079e4d'::uuid and reversed_at is null) then raise exception 'DUPLICATE_EVIAN_RECEIPT_NOT_FOUND'; end if;
  if exists(select 1 from public.inventory_cost_layers l join public.inventory_cost_events e on e.id=l.source_event_id where e.reference_type='purchase_receipt' and e.reference_id='d1a4a4ac-c7f9-46dc-8eec-644da7079e4d' and l.remaining_quantity<>l.original_quantity) then raise exception 'DUPLICATE_EVIAN_RECEIPT_ALREADY_CONSUMED'; end if;
  update public.inventory_balances set quantity=quantity-1,updated_at=now() where item_name='에비앙 사하라 30ml' returning quantity into v_next_quantity;
  insert into public.inventory_movements(item_name,movement_type,quantity_delta,quantity_after,unit_price,reference_type,reference_id,note,created_by)
    values('에비앙 사하라 30ml','reversal',-1,v_next_quantity,3190,'purchase_receipt_reversal','d1a4a4ac-c7f9-46dc-8eec-644da7079e4d','중복 입고 1개 취소',v_actor);
  update public.inventory_purchase_order_lines set received_quantity=greatest(0,received_quantity-1) where id='a88778fb-0404-4ac7-b6ae-58242f1093d4'::uuid;
  update public.inventory_purchase_receipts set reversed_at=now(),reversed_by=v_actor,reversed_reason='중복 입고 1개 취소' where id='d1a4a4ac-c7f9-46dc-8eec-644da7079e4d'::uuid;
  update public.inventory_purchase_orders set status='pending',updated_at=now() where id='e245ce2e-5be1-430d-ae9b-5da8e4132007'::uuid;
end $$;

-- 이미 마스터가 입력한 젤로맥스 실버 두 건의 원가를 FIFO 층/원장으로 반영한다.
update public.inventory_cost_layers layer set unit_cost=case event.reference_id
  when '4579ec44-6c1b-4884-b0de-45b0d4d82045' then 38500
  when '8d098344-dd70-4716-99da-abb1fe372202' then 40580 end,
  cost_status='confirmed'
from public.inventory_cost_events event
where layer.source_event_id=event.id and event.reference_type='purchase_receipt'
  and event.reference_id in ('4579ec44-6c1b-4884-b0de-45b0d4d82045','8d098344-dd70-4716-99da-abb1fe372202');
update public.inventory_cost_events set total_cost=case reference_id
  when '4579ec44-6c1b-4884-b0de-45b0d4d82045' then 38500
  when '8d098344-dd70-4716-99da-abb1fe372202' then 40580 end,
  metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('manualAfterServiceCost',true)
where reference_type='purchase_receipt' and reference_id in ('4579ec44-6c1b-4884-b0de-45b0d4d82045','8d098344-dd70-4716-99da-abb1fe372202');

-- 향후 일반 고객 A/S의 수동 원가는 매입 전표는 0원으로 유지하고 FIFO 원가층만 확정한다.
create or replace function public.process_after_service_repair_receipt_with_cost(
  p_after_service_id bigint,p_arrived_on date,p_item_name text,p_quantity integer,p_match_type text,p_memo text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_after_service public.after_services%rowtype; v_receipt_id uuid; v_allocated_quantity integer; v_allocated_cost bigint; v_unit_price integer;
begin
  select * into v_after_service from public.after_services where id=p_after_service_id for update;
  if not found then raise exception 'AFTER_SERVICE_NOT_FOUND'; end if;
  select coalesce(sum(outbound_quantity-received_quantity),0)::integer,coalesce(sum(unit_price*(outbound_quantity-received_quantity)),0)::bigint into v_allocated_quantity,v_allocated_cost from public.after_service_outbound_cost_allocations where after_service_id=v_after_service.id;
  if v_allocated_quantity>0 then
    if btrim(p_item_name)<>btrim(v_after_service.item_name) or p_quantity<>v_allocated_quantity then raise exception 'MANUAL_COST_RECEIPT_MISMATCH'; end if;
    if mod(v_allocated_cost,v_allocated_quantity)<>0 then raise exception 'MANUAL_COST_ALLOCATION_INVALID'; end if;
    v_unit_price:=(v_allocated_cost/v_allocated_quantity)::integer;
  end if;
  v_receipt_id:=public.process_after_service_repair_receipt(p_after_service_id,p_arrived_on,p_item_name,p_quantity,p_match_type,p_memo);
  if v_allocated_quantity>0 then
    update public.inventory_cost_layers layer set unit_cost=v_unit_price,cost_status='confirmed'
      from public.inventory_cost_events event where layer.source_event_id=event.id and event.reference_type='purchase_receipt' and event.reference_id=v_receipt_id::text;
    update public.inventory_cost_events set total_cost=v_unit_price*quantity,metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('manualAfterServiceCost',true)
      where reference_type='purchase_receipt' and reference_id=v_receipt_id::text;
    update public.after_service_outbound_cost_allocations set received_quantity=outbound_quantity where after_service_id=v_after_service.id;
  end if;
  return v_receipt_id;
end;
$$;
revoke all on function public.process_after_service_repair_receipt_with_cost(bigint,date,text,integer,text,text) from public,anon;
grant execute on function public.process_after_service_repair_receipt_with_cost(bigint,date,text,integer,text,text) to authenticated;
