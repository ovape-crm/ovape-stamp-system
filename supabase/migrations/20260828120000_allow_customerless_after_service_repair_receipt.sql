-- 기존 A/S는 고객 연결 없이도 생성될 수 있으므로, 수리입고 시 고객명을 필수로 강제하지 않는다.
create or replace function public.process_after_service_repair_receipt(
  p_after_service_id bigint, p_arrived_on date, p_item_name text, p_quantity integer, p_match_type text, p_memo text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_after_service public.after_services%rowtype; v_supplier_id uuid; v_customer_name text; v_ordered_on date;
  v_item_note text; v_order_id uuid; v_order_line_id uuid; v_receipt_id uuid; v_next_quantity integer;
begin
  if not exists(select 1 from public.users where id=auth.uid() and oss_role in ('staff','admin','master')) then raise exception 'AUTH_REQUIRED'; end if;
  if p_arrived_on is null then raise exception 'ARRIVED_ON_REQUIRED'; end if;
  if btrim(coalesce(p_item_name,''))='' then raise exception 'ITEM_REQUIRED'; end if;
  if coalesce(p_quantity,0)<=0 then raise exception 'QUANTITY_REQUIRED'; end if;
  if p_match_type not in ('match','mismatch') then raise exception 'MATCH_TYPE_REQUIRED'; end if;
  select * into v_after_service from public.after_services where id=p_after_service_id for update;
  if not found then raise exception 'AFTER_SERVICE_NOT_FOUND'; end if;
  if v_after_service.repair_receipt_id is not null then raise exception 'AFTER_SERVICE_RECEIPT_ALREADY_EXISTS'; end if;
  if nullif(btrim(coalesce(v_after_service.supplier_name,'')),'') is null or lower(btrim(v_after_service.supplier_name)) in ('나중에 선택','나중에선택','나중에 수정','나중에수정') then raise exception 'SUPPLIER_REQUIRED'; end if;
  begin v_ordered_on:=replace(nullif(btrim(coalesce(v_after_service.customer_received_date,'')),''),'/','-')::date; exception when others then raise exception 'AFTER_SERVICE_RECEIVED_DATE_REQUIRED'; end;
  if v_ordered_on is null then raise exception 'AFTER_SERVICE_RECEIVED_DATE_REQUIRED'; end if;
  select id into v_supplier_id from public.inventory_suppliers where lower(btrim(name))=lower(btrim(v_after_service.supplier_name)) and is_use=true order by created_at limit 1;
  if v_supplier_id is null then raise exception 'SUPPLIER_NOT_FOUND'; end if;
  if not exists(select 1 from public.items where btrim(item_name)=btrim(p_item_name) and is_use=true) then raise exception 'ITEM_NOT_FOUND'; end if;
  if not public.is_inventory_item_tracked(btrim(p_item_name)) then raise exception 'ITEM_NOT_INVENTORY_TRACKED'; end if;
  if p_match_type='match' and (btrim(p_item_name)<>btrim(v_after_service.item_name) or p_quantity<>v_after_service.quantity) then raise exception 'MATCH_SELECTION_INVALID'; end if;
  if p_match_type='mismatch' and btrim(p_item_name)=btrim(v_after_service.item_name) and p_quantity=v_after_service.quantity then raise exception 'MISMATCH_SELECTION_INVALID'; end if;
  select name into v_customer_name from public.customers where id=v_after_service.customer_id;
  v_item_note:='A/S 교환입고'||case when nullif(btrim(coalesce(p_memo,'')),'') is not null then '·'||btrim(p_memo) else '' end;
  insert into public.inventory_purchase_orders(supplier_id,ordered_on,status,note,created_by) values(v_supplier_id,v_ordered_on,'completed',null,auth.uid()) returning id into v_order_id;
  insert into public.inventory_purchase_order_lines(order_id,item_name,ordered_quantity,received_quantity,pending_quantity,unit_price,note,quantity_checked_by,quantity_checked_at,handling_type,handling_note,customer_id,after_service_id,inbound_type)
    values(v_order_id,btrim(p_item_name),p_quantity,p_quantity,0,0,v_item_note,auth.uid(),now(),'as_exchange_in',v_item_note,v_after_service.customer_id,v_after_service.id,'as_exchange_in') returning id into v_order_line_id;
  insert into public.inventory_purchase_receipts(order_id,arrived_on,note,created_by,after_service_id) values(v_order_id,p_arrived_on,null,auth.uid(),v_after_service.id) returning id into v_receipt_id;
  insert into public.inventory_purchase_receipt_lines(receipt_id,order_line_id,item_name,quantity,unit_price,quantity_checked_by,quantity_checked_at,note) values(v_receipt_id,v_order_line_id,btrim(p_item_name),p_quantity,0,auth.uid(),now(),v_item_note);
  insert into public.inventory_balances(item_name,quantity,updated_at) values(btrim(p_item_name),p_quantity,now()) on conflict(item_name) do update set quantity=public.inventory_balances.quantity+excluded.quantity,updated_at=now() returning quantity into v_next_quantity;
  insert into public.inventory_movements(item_name,movement_type,quantity_delta,quantity_after,unit_price,reference_type,reference_id,note,created_by,counterparty_name,counterparty_id,inventory_action,item_remark)
    values(btrim(p_item_name),'purchase_in',p_quantity,v_next_quantity,0,'purchase_receipt',v_receipt_id::text,v_item_note,auth.uid(),v_customer_name,v_after_service.customer_id::text,'as_exchange_in','A/S 교환입고');
  update public.after_services set status='repair_returned_completed',repair_receipt_order_id=v_order_id,repair_receipt_id=v_receipt_id,repair_receipt_item_name=btrim(p_item_name),repair_receipt_quantity=p_quantity,repair_receipt_match_type=p_match_type,repair_receipt_note=nullif(btrim(coalesce(p_memo,'')),''),repair_receipt_arrived_on=p_arrived_on where id=v_after_service.id;
  insert into public.logs(admin_id,customer_id,action,note,jsonb,category,after_service_id) values(auth.uid(),v_after_service.customer_id,'after-service-repair_returned_completed','입고일 : '||to_char(p_arrived_on,'YYYY/MM/DD')||case when nullif(btrim(coalesce(p_memo,'')),'') is not null then E'\n'||btrim(p_memo) else '' end,jsonb_build_object('inventoryReceiptId',v_receipt_id,'inventoryOrderId',v_order_id,'itemName',btrim(p_item_name),'quantity',p_quantity,'matchType',p_match_type,'historyNote',v_item_note),'after_service',v_after_service.id);
  return v_receipt_id;
end; $$;

-- 연결된 A/S의 고객이 비어 있는 과거 데이터도 위 입고 함수가 처리할 수 있도록 허용한다.
create or replace function public.guard_after_service_exchange_in_line()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='DELETE' then
    if old.after_service_id is not null or ((old.handling_type='as_exchange_in' or old.inbound_type='as_exchange_in') and exists(select 1 from public.inventory_purchase_receipt_lines where order_line_id=old.id)) then raise exception 'AFTER_SERVICE_EXCHANGE_IN_LINE_DELETE_FORBIDDEN'; end if;
    if (old.handling_type='as_exchange_in' or old.inbound_type='as_exchange_in') and not public.is_current_user_master() then raise exception 'MASTER_REQUIRED'; end if;
    return old;
  end if;
  if tg_op='UPDATE' and old.after_service_id is distinct from new.after_service_id then raise exception 'AFTER_SERVICE_LINE_LINK_IMMUTABLE'; end if;
  if tg_op='UPDATE' and old.handling_type='as_exchange_in' and new.handling_type is distinct from 'as_exchange_in' and exists(select 1 from public.inventory_purchase_receipt_lines where order_line_id=old.id) then raise exception 'COMPLETED_AS_EXCHANGE_IN_CLASSIFICATION_IMMUTABLE'; end if;
  if new.after_service_id is not null and new.customer_id is null then select customer_id into new.customer_id from public.after_services where id=new.after_service_id; end if;
  if new.after_service_id is null and new.handling_type='as_exchange_in' then
    if not public.is_current_user_master() then raise exception 'MASTER_REQUIRED'; end if;
    if new.customer_id is null then raise exception 'CUSTOMER_REQUIRED'; end if;
  end if;
  if new.after_service_id is not null and new.customer_id is not null and not exists(select 1 from public.after_services where id=new.after_service_id and customer_id=new.customer_id) then raise exception 'AFTER_SERVICE_CUSTOMER_MISMATCH'; end if;
  if new.after_service_id is not null or new.handling_type='as_exchange_in' then new.handling_type:='as_exchange_in'; new.inbound_type:='as_exchange_in'; else new.inbound_type:='purchase'; end if;
  return new;
end; $$;
revoke all on function public.process_after_service_repair_receipt(bigint,date,text,integer,text,text) from public,anon;
grant execute on function public.process_after_service_repair_receipt(bigint,date,text,integer,text,text) to authenticated;
