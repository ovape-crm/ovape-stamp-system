alter table public.inventory_purchase_order_lines
  add column if not exists demo_quantity integer not null default 0
  check (demo_quantity >= 0 and demo_quantity <= ordered_quantity);

alter table public.inventory_purchase_receipt_lines
  add column if not exists demo_quantity integer not null default 0
  check (demo_quantity >= 0 and demo_quantity <= quantity);

update public.inventory_purchase_order_lines
set demo_quantity = ordered_quantity
where handling_type = 'demo' and demo_quantity = 0;

update public.inventory_purchase_receipt_lines receipt_line
set demo_quantity = receipt_line.quantity
from public.inventory_purchase_order_lines order_line
where order_line.id = receipt_line.order_line_id
  and order_line.handling_type = 'demo'
  and receipt_line.demo_quantity = 0;

create or replace function public.create_inventory_purchase_order_with_final_amount(
  p_supplier_id uuid, p_ordered_on date, p_note text, p_lines jsonb,
  p_adjustments jsonb default '[]'::jsonb, p_entered_total_amount integer default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_order_id uuid; v_line jsonb;
begin
  if p_entered_total_amount is not null and p_entered_total_amount < 0 then raise exception 'FINAL_AMOUNT_INVALID'; end if;
  v_order_id := public.create_inventory_purchase_order(p_supplier_id,p_ordered_on,p_note,p_lines,p_adjustments);
  for v_line in select value from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) loop
    update public.inventory_purchase_order_lines
    set demo_quantity = case when coalesce(v_line->>'handling_type','none')='demo'
      then coalesce(nullif(v_line->>'demo_quantity','')::integer,0) else 0 end
    where order_id=v_order_id and item_name=btrim(v_line->>'item_name');
  end loop;
  update public.inventory_purchase_orders set entered_total_amount=p_entered_total_amount where id=v_order_id;
  return v_order_id;
end $$;

create or replace function public.update_inventory_purchase_order_details_with_final_amount(
  p_order_id uuid,p_supplier_id uuid,p_ordered_on date,p_note text,
  p_lines jsonb,p_receipts jsonb,p_entered_total_amount integer default null
) returns void language plpgsql security definer set search_path=public as $$
declare v_line jsonb;
begin
  if p_entered_total_amount is not null and p_entered_total_amount < 0 then raise exception 'FINAL_AMOUNT_INVALID'; end if;
  update public.inventory_purchase_order_lines set demo_quantity=0 where order_id=p_order_id;
  perform public.update_inventory_purchase_order_details(p_order_id,p_supplier_id,p_ordered_on,p_note,p_lines,p_receipts);
  for v_line in select value from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) loop
    update public.inventory_purchase_order_lines
    set demo_quantity = case when coalesce(v_line->>'handling_type','none')='demo'
      then coalesce(nullif(v_line->>'demo_quantity','')::integer,0) else 0 end
    where order_id=p_order_id and (
      (nullif(v_line->>'id','') is not null and id=nullif(v_line->>'id','')::uuid)
      or (nullif(v_line->>'id','') is null and item_name=btrim(v_line->>'item_name'))
    );
  end loop;
  update public.inventory_purchase_orders set entered_total_amount=p_entered_total_amount where id=p_order_id;
end $$;

create or replace function public.process_purchase_arrival(p_order_id uuid,p_arrived_on date,p_note text)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_receipt_id uuid; v_line record; v_next_quantity integer; v_processed integer:=0;
  v_supplier_name text; v_demo_customer_id bigint; v_demo_log_id text;
  v_demo_items jsonb:='[]'::jsonb; v_demo_note text:=''; v_demo_remark text;
  v_demo_line_text text; v_worker_name text; v_demo_quantity integer;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if p_arrived_on is null then raise exception '도착일을 선택해 주세요.'; end if;
  select supplier.name into v_supplier_name
  from public.inventory_purchase_orders purchase_order
  join public.inventory_suppliers supplier on supplier.id=purchase_order.supplier_id
  where purchase_order.id=p_order_id and purchase_order.status in ('pending','partial')
  for update of purchase_order;
  if not found then raise exception '입고 처리할 수 없는 주문입니다.'; end if;
  if exists(select 1 from public.inventory_purchase_order_lines where order_id=p_order_id and pending_quantity>0 and quantity_checked_at is null)
    then raise exception '수량 체크가 완료되지 않은 품목이 있습니다.'; end if;
  if not exists(select 1 from public.inventory_purchase_order_lines where order_id=p_order_id and pending_quantity>0 and quantity_checked_at is not null)
    then raise exception '입고 처리할 품목이 없습니다.'; end if;
  insert into public.inventory_purchase_receipts(order_id,arrived_on,note,created_by)
  values(p_order_id,p_arrived_on,nullif(btrim(p_note),''),auth.uid()) returning id into v_receipt_id;

  for v_line in select * from public.inventory_purchase_order_lines
    where order_id=p_order_id and pending_quantity>0 and quantity_checked_at is not null for update
  loop
    v_demo_quantity := case when v_line.handling_type='demo' then least(
      v_line.pending_quantity,greatest(v_line.demo_quantity-v_line.received_quantity,0)
    ) else 0 end;
    insert into public.inventory_balances(item_name,quantity,updated_at)
    values(v_line.item_name,v_line.pending_quantity,now())
    on conflict(item_name) do update set quantity=public.inventory_balances.quantity+excluded.quantity,updated_at=now()
    returning quantity into v_next_quantity;
    insert into public.inventory_movements(item_name,movement_type,quantity_delta,quantity_after,unit_price,reference_type,reference_id,note,created_by)
    values(v_line.item_name,'purchase_in',v_line.pending_quantity,v_next_quantity,v_line.unit_price,'purchase_receipt',v_receipt_id::text,
      coalesce(nullif(btrim(p_note),''),'입고 처리'),auth.uid());
    insert into public.inventory_purchase_receipt_lines(
      receipt_id,order_line_id,item_name,quantity,unit_price,quantity_checked_by,quantity_checked_at,note,quantity_check_note,demo_quantity
    ) values(v_receipt_id,v_line.id,v_line.item_name,v_line.pending_quantity,v_line.unit_price,v_line.quantity_checked_by,
      v_line.quantity_checked_at,v_line.note,v_line.quantity_check_note,v_demo_quantity);

    if v_demo_quantity>0 then
      v_demo_remark:='시연용'||case when nullif(btrim(v_line.handling_note),'') is not null then ','||btrim(v_line.handling_note) else '' end;
      v_demo_line_text:=format('%s %s개 (%s)',v_line.item_name,v_demo_quantity,v_demo_remark);
      v_demo_note:=concat_ws(', ',nullif(v_demo_note,''),v_demo_line_text);
      v_demo_items:=v_demo_items||jsonb_build_array(jsonb_build_object(
        'itemId',coalesce((select item.id::text from public.items item where item.item_name=v_line.item_name order by item.created_at limit 1),''),
        'itemName',v_line.item_name,'quantity',v_demo_quantity,'unitPrice',0,'amount',0,'remark',v_demo_remark,
        'lineText',v_demo_line_text,'inventoryAction','out'));
    end if;
    update public.inventory_purchase_order_lines set received_quantity=received_quantity+pending_quantity,pending_quantity=0,
      quantity_checked_by=null,quantity_checked_at=null,quantity_check_note=null where id=v_line.id;
    v_processed:=v_processed+1;
  end loop;

  if jsonb_array_length(v_demo_items)>0 then
    if not exists(select 1 from pg_trigger where tgname='sync_outbound_log_inventory_trigger' and not tgisinternal)
      then raise exception 'OUTBOUND_INVENTORY_INTEGRATION_REQUIRED'; end if;
    select customer.id into v_demo_customer_id from public.customers customer where btrim(customer.name)='시연용' order by customer.created_at limit 1;
    if v_demo_customer_id is null then raise exception 'DEMO_CUSTOMER_NOT_FOUND'; end if;
    select app_user.name into v_worker_name from public.users app_user where app_user.id=auth.uid();
    insert into public.logs(admin_id,customer_id,action,note,jsonb,category)
    values(auth.uid(),v_demo_customer_id,'no-stamp',v_demo_note,jsonb_build_object(
      'paymentType','shipment_remark','totalAmount',0,'extraNote',format('%s 자동 시연용처리',v_supplier_name),
      'items',v_demo_items,'purchaseReceiptId',v_receipt_id::text,'createdWorkerName',coalesce(v_worker_name,'')),'stamp')
    returning id::text into v_demo_log_id;
    update public.inventory_purchase_receipts set demo_log_id=v_demo_log_id where id=v_receipt_id;
  end if;
  update public.inventory_purchase_orders set status=case when not exists(
    select 1 from public.inventory_purchase_order_lines where order_id=p_order_id and received_quantity<ordered_quantity
  ) then 'completed' else 'partial' end,updated_at=now() where id=p_order_id;
  return v_receipt_id;
end $$;

create or replace function public.sync_demo_receipt_settlement_expense()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_receipt_id uuid; v_receipt_date date; v_category_id uuid; v_amount integer; v_note text;
begin
  if tg_op='DELETE' then delete from public.settlement_expenses where source_log_id=old.id and category='시연용'; return old; end if;
  if new.category<>'stamp' or coalesce(new.jsonb->>'purchaseReceiptId','')='' or not exists(
    select 1 from jsonb_array_elements(coalesce(new.jsonb->'items','[]'::jsonb)) entry(item)
    where coalesce(entry.item->>'remark','')~'^시연용(?:$|[,\s(])') then return new; end if;
  v_receipt_id:=(new.jsonb->>'purchaseReceiptId')::uuid;
  select receipt.arrived_on,coalesce(sum(line.demo_quantity*line.unit_price),0)::integer,
    string_agg(line.item_name||' '||line.demo_quantity::text||'개',', ' order by line.id)
  into v_receipt_date,v_amount,v_note from public.inventory_purchase_receipts receipt
  join public.inventory_purchase_receipt_lines line on line.receipt_id=receipt.id
  where receipt.id=v_receipt_id and line.demo_quantity>0 group by receipt.arrived_on;
  if v_receipt_date is null or coalesce(v_amount,0)<=0 then return new; end if;
  insert into public.settlement_expense_categories(name,is_active,created_by) values('시연용',true,new.admin_id)
    on conflict(name) do update set is_active=true returning id into v_category_id;
  insert into public.settlement_expenses(expense_date,category_id,category,amount,store,is_recurring,note,created_by,source_log_id)
  values(v_receipt_date,v_category_id,'시연용',v_amount,'common',false,coalesce(v_note,'시연용 처리'),new.admin_id,new.id)
  on conflict(source_log_id) where source_log_id is not null and category='시연용'
  do update set expense_date=excluded.expense_date,category_id=excluded.category_id,amount=excluded.amount,store='common',note=excluded.note,updated_at=now();
  return new;
end $$;

create or replace function public.sync_purchase_receipt_cost_layer()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_receipt public.inventory_purchase_receipts%rowtype; v_order_line public.inventory_purchase_order_lines%rowtype;
  v_after_service public.after_services%rowtype; v_item_id bigint; v_cost_quantity integer;
  v_allocation record; v_remaining integer; v_take integer; v_skip integer; v_segment integer:=0;
begin
  select * into v_receipt from public.inventory_purchase_receipts where id=new.receipt_id;
  select * into v_order_line from public.inventory_purchase_order_lines where id=new.order_line_id;
  v_cost_quantity:=new.quantity-coalesce(new.demo_quantity,0);
  if v_receipt.reversed_at is not null or v_cost_quantity<=0
    or not public.is_inventory_item_tracked(new.item_name) then return new; end if;
  select id into v_item_id from public.items where btrim(item_name)=btrim(new.item_name) order by created_at limit 1;
  if v_order_line.inbound_type='as_exchange_in' and v_order_line.after_service_id is not null then
    select * into v_after_service from public.after_services where id=v_order_line.after_service_id;
  end if;
  if found and v_after_service.service_case_type='customer_as' then
    select coalesce(sum(layer.original_quantity),0)::integer into v_skip
    from public.inventory_cost_layers layer join public.inventory_cost_events event on event.id=layer.source_event_id
    where event.event_type='after_service_in' and event.metadata->>'afterServiceId'=v_after_service.id::text;
    v_remaining:=v_cost_quantity;
    for v_allocation in select allocation.quantity,allocation.unit_cost,allocation.source_layer_id
      from public.inventory_cost_events event join public.inventory_cost_allocations allocation on allocation.outbound_event_id=event.id
      where event.event_type='after_service_out' and (event.metadata->>'afterServiceId'=v_after_service.id::text or exists(
        select 1 from public.logs log where log.id::text=event.reference_id and log.jsonb->>'afterServiceId'=v_after_service.id::text))
      order by event.event_at,event.id,allocation.created_at,allocation.id
    loop
      if v_skip>=v_allocation.quantity then v_skip:=v_skip-v_allocation.quantity; continue; end if;
      v_take:=least(v_remaining,v_allocation.quantity-v_skip); v_skip:=0; v_segment:=v_segment+1;
      perform public.create_inventory_cost_layer('after_service_in',v_receipt.arrived_on::timestamp at time zone 'Asia/Seoul',
        v_item_id,new.item_name,v_take,v_allocation.unit_cost,case when v_allocation.unit_cost is null then 'pending' else 'confirmed' end,
        'back','purchase_receipt',new.receipt_id::text,new.id::text||':'||v_segment::text,v_allocation.source_layer_id,
        jsonb_build_object('afterServiceId',v_after_service.id,'restoredFromOutbound',true));
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
  perform public.create_inventory_cost_layer('purchase_in',v_receipt.arrived_on::timestamp at time zone 'Asia/Seoul',
    v_item_id,new.item_name,v_cost_quantity,new.unit_price,case when new.unit_price is null then 'pending' else 'confirmed' end,
    'back','purchase_receipt',new.receipt_id::text,new.id::text,null,jsonb_build_object('live',true,'demoQuantity',new.demo_quantity));
  return new;
end $$;

revoke all on function public.process_purchase_arrival(uuid,date,text) from public,anon;
grant execute on function public.process_purchase_arrival(uuid,date,text) to authenticated;
revoke all on function public.sync_demo_receipt_settlement_expense() from public,anon,authenticated;
revoke all on function public.sync_purchase_receipt_cost_layer() from public,anon,authenticated;
notify pgrst,'reload schema';
