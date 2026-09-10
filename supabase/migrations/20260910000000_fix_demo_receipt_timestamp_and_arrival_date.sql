-- A receipt records the date it is processed, while its paired demo outbound
-- log records the actual processing timestamp rather than midnight.
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
    insert into public.logs(admin_id,customer_id,action,note,jsonb,category,created_at)
    values(auth.uid(),v_demo_customer_id,'no-stamp',v_demo_note,jsonb_build_object(
      'paymentType','shipment_remark','totalAmount',0,'extraNote',format('%s 자동 시연용처리',v_supplier_name),
      'items',v_demo_items,'purchaseReceiptId',v_receipt_id::text,'createdWorkerName',coalesce(v_worker_name,'')),'stamp',now())
    returning id::text into v_demo_log_id;
    update public.inventory_purchase_receipts set demo_log_id=v_demo_log_id where id=v_receipt_id;
  end if;
  update public.inventory_purchase_orders set status=case when not exists(
    select 1 from public.inventory_purchase_order_lines where order_id=p_order_id and received_quantity<ordered_quantity
  ) then 'completed' else 'partial' end,updated_at=now() where id=p_order_id;
  return v_receipt_id;
end $$;

-- Correct only today's demo logs that were created by the former midnight rule.
-- Updating a historical log normally invokes the authenticated outbound workflow;
-- this deployment-only correction changes the timestamp alone and preserves the
-- existing stock and FIFO allocations.
do $$
declare
  v_target_count integer;
begin
  select count(*) into v_target_count
  from public.logs log
  join public.inventory_purchase_receipts receipt on receipt.demo_log_id = log.id::text
  where receipt.arrived_on = (now() at time zone 'Asia/Seoul')::date
    and log.created_at = ((now() at time zone 'Asia/Seoul')::date::timestamp at time zone 'Asia/Seoul');

  if v_target_count > 2 then
    raise exception 'EXPECTED_AT_MOST_TWO_TODAY_DEMO_LOGS_TO_CORRECT: %', v_target_count;
  end if;

  alter table public.logs disable trigger user;
  update public.logs log
  set created_at = now()
  from public.inventory_purchase_receipts receipt
  where receipt.demo_log_id = log.id::text
    and receipt.arrived_on = (now() at time zone 'Asia/Seoul')::date
    and log.created_at = ((now() at time zone 'Asia/Seoul')::date::timestamp at time zone 'Asia/Seoul');
  alter table public.logs enable trigger user;
end $$;
