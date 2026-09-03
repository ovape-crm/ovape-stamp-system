-- New writes only. Never rebuild historical stock/cost allocations in this migration.
create or replace function public.sync_direct_inventory_movement_cost()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_original public.inventory_movements%rowtype; v_layer public.inventory_cost_layers%rowtype; v_event uuid;
begin
  if not public.is_inventory_item_tracked(new.item_name) then return new; end if;
  if new.movement_type in ('initial','purchase_in') and new.reference_type is null and new.quantity_delta>0 then
    perform public.create_inventory_cost_layer(case when new.movement_type='initial' then 'opening' else 'purchase_in' end,
      new.created_at,null,new.item_name,new.quantity_delta,new.unit_price,
      case when new.unit_price is null then 'pending' else 'confirmed' end,'back','inventory_movement',new.id::text,'',null,
      jsonb_build_object('directMovement',true));
  elsif new.movement_type='reversal' and new.reversed_movement_id is not null then
    select * into v_original from public.inventory_movements where id=new.reversed_movement_id;
    if v_original.reference_type is not null then return new; end if;
    perform pg_advisory_xact_lock(hashtextextended(btrim(new.item_name),0));
    select l.* into v_layer from public.inventory_cost_layers l join public.inventory_cost_events e on e.id=l.source_event_id
      where e.reference_type='inventory_movement' and e.reference_id=v_original.id::text for update of l;
    if not found then raise exception '과거 직접입고의 원가층이 없습니다. 원가 연결 확인 전 취소할 수 없습니다.'; end if;
    if v_layer.item_name<>new.item_name or new.quantity_delta<>-v_layer.original_quantity or v_layer.remaining_quantity<>v_layer.original_quantity
      or exists(select 1 from public.inventory_cost_allocations where source_layer_id=v_layer.id)
      or exists(select 1 from public.inventory_cost_layers where source_layer_id=v_layer.id)
      then raise exception '이미 사용됐거나 연결된 입고 원가는 취소할 수 없습니다.'; end if;
    insert into public.inventory_cost_events(event_type,event_at,item_name,direction,quantity,total_cost,reference_type,reference_id,metadata,created_by)
      values('reversal',new.created_at,new.item_name,'out',v_layer.original_quantity,v_layer.original_quantity*v_layer.unit_cost,
        'inventory_movement',new.id::text,jsonb_build_object('reversedMovementId',v_original.id,'directReceiptCancellation',true),auth.uid()) returning id into v_event;
    insert into public.inventory_cost_allocations(outbound_event_id,source_layer_id,quantity,unit_cost)
      values(v_event,v_layer.id,v_layer.original_quantity,v_layer.unit_cost);
    update public.inventory_cost_layers set remaining_quantity=0 where id=v_layer.id;
  end if;
  return new;
end $$;
create trigger sync_direct_inventory_movement_cost_trigger after insert on public.inventory_movements
  for each row execute function public.sync_direct_inventory_movement_cost();
revoke all on function public.sync_direct_inventory_movement_cost() from public,anon,authenticated;

-- Run after allocation, including manual demo outflows. Record actual FIFO cost once.
create or replace function public.sync_demo_receipt_settlement_expense()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_cost bigint; v_count integer; v_category uuid; v_date date;
begin
  if tg_op='DELETE' then delete from public.settlement_expenses where source_log_id=old.id and category='시연용'; return old; end if;
  delete from public.settlement_expenses where source_log_id=new.id and category='시연용';
  if new.category<>'stamp' then return new; end if;
  select count(*),case when bool_or(total_cost is null) then null else sum(total_cost) end into v_count,v_cost
    from public.inventory_cost_events where reference_type='stamp_log' and reference_id=new.id::text and event_type='demo_out';
  if v_count=0 or v_cost is null or v_cost=0 then return new; end if;
  v_date:=(new.created_at at time zone 'Asia/Seoul')::date;
  insert into public.settlement_expense_categories(name,is_active,created_by) values('시연용',true,new.admin_id)
    on conflict(name) do update set is_active=true returning id into v_category;
  insert into public.settlement_expenses(expense_date,category_id,category,amount,store,is_recurring,note,created_by,source_log_id)
    values(v_date,v_category,'시연용',v_cost,'common',false,'시연 출고 실제 배정 원가',new.admin_id,new.id);
  return new;
end $$;
drop trigger if exists sync_demo_receipt_settlement_expense_trigger on public.logs;
create trigger zzzzz_sync_demo_receipt_settlement_expense_trigger after insert or update of jsonb,category,created_at or delete on public.logs
  for each row execute function public.sync_demo_receipt_settlement_expense();

create or replace function public.process_customer_exchange_cost_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer public.customers%rowtype;
  v_item jsonb;
  v_index integer := 0;
  v_name text;
  v_quantity integer;
  v_action text;
  v_available integer;
  v_missing integer;
  v_out_event uuid;
  v_source_event uuid;
  v_source_allocation record;
  v_restore_remaining integer;
  v_restore_quantity integer;
  v_returned integer; v_requested_total integer;
  v_segment integer;
  v_out_cost integer;
  v_in_cost integer;
  v_difference integer;
  v_category_id uuid;
  v_out_summary text := '';
  v_in_summary text := '';
begin
  if new.category <> 'stamp' or new.customer_id is null then return new; end if;
  if not exists (
    select 1 from jsonb_array_elements(coalesce(new.jsonb->'items', '[]'::jsonb)) entry(item)
    where entry.item->>'inventoryAction' in ('exchange_in', 'exchange_out')
  ) then return new; end if;
  select * into v_customer from public.customers where id = new.customer_id;
  for v_name in select distinct btrim(x->>'itemName') from jsonb_array_elements(new.jsonb->'items') x where x->>'inventoryAction' in ('exchange_in','exchange_out') order by 1 loop
    perform pg_advisory_xact_lock(hashtextextended(v_name,0));
  end loop;

  -- 같은 처리 안에서는 교환출고를 먼저 기존 FIFO에서 차감합니다.
  for v_item in select value from jsonb_array_elements(coalesce(new.jsonb->'items', '[]'::jsonb))
    with ordinality entry(value, ordinality)
    where value->>'inventoryAction' = 'exchange_out'
    order by ordinality
  loop
    v_index := v_index + 1;
    v_name := btrim(v_item->>'itemName');
    v_quantity := (v_item->>'quantity')::integer;
    select coalesce(sum(remaining_quantity), 0)::integer into v_available
    from public.inventory_cost_layers l join public.inventory_cost_events e on e.id=l.source_event_id where l.item_name = v_name and l.remaining_quantity > 0 and e.event_at<=new.created_at;
    v_missing := greatest(0, v_quantity - v_available);
    if v_missing > 0 then
      perform public.create_inventory_cost_layer(
        'opening', new.created_at - interval '1 microsecond', null, v_name,
        v_missing, null, 'pending', 'back', 'cost_missing', new.id::text,
        'exchange-out:' || v_index::text, null,
        jsonb_build_object('reason', 'customer exchange outbound cost missing')
      );
    end if;
    v_out_event := public.allocate_inventory_cost_fifo(
      'customer_exchange_out', new.created_at, null, v_name, v_quantity,
      'stamp_log', new.id::text, 'exchange-out:' || v_index::text,
      'customer_exchange_difference',
      jsonb_build_object('customerId', new.customer_id)
    );
    v_out_summary := concat_ws(', ', nullif(v_out_summary, ''), v_name || ' ' || v_quantity || '개');
  end loop;

  v_index := 0;
  for v_item in select value from jsonb_array_elements(coalesce(new.jsonb->'items', '[]'::jsonb))
    with ordinality entry(value, ordinality)
    where value->>'inventoryAction' = 'exchange_in'
    order by ordinality
  loop
    v_index := v_index + 1;
    v_name := btrim(v_item->>'itemName');
    v_quantity := (v_item->>'quantity')::integer;
    v_restore_remaining := v_quantity;
    v_segment := 0;
    if exists(select 1 from public.inventory_cost_events where reference_type='stamp_log' and reference_id=new.id::text and reference_line_key like 'exchange-in:'||v_index::text||':%' and event_type='customer_exchange_in') then
      if (select sum(quantity) from public.inventory_cost_events where reference_type='stamp_log' and reference_id=new.id::text and reference_line_key like 'exchange-in:'||v_index::text||':%' and event_type='customer_exchange_in')<>v_quantity then raise exception '기존 교환입고 수량과 요청이 다릅니다.'; end if;
      v_in_summary := concat_ws(', ',nullif(v_in_summary,''),v_name||' '||v_quantity||'개');
      continue;
    end if;
    select event.id into v_source_event
    from public.inventory_cost_events event
    where event.reference_type = 'stamp_log'
      and event.reference_id = nullif(v_item->>'costSourceSaleLogId', '')
      and event.reference_line_key = coalesce(v_item->>'costSourceSaleLineIndex', '')
      and event.event_type = 'sale_out'
    and event.item_name=v_name and event.event_at<=new.created_at
      and exists(select 1 from public.logs sale where sale.id::text=event.reference_id and sale.customer_id=new.customer_id)
    order by event.created_at desc limit 1 for update;

    if nullif(v_item->>'costSourceSaleLogId','') is not null and v_source_event is null then raise exception '교환 원본 판매의 품목·고객·날짜를 확인해 주세요.'; end if;
    if v_source_event is not null then
      select coalesce(sum(quantity),0) into v_returned from public.inventory_cost_events
        where event_type='customer_exchange_in' and metadata->>'sourceSaleLogId'=v_item->>'costSourceSaleLogId'
          and metadata->>'sourceSaleLineIndex'=v_item->>'costSourceSaleLineIndex' and reference_id<>new.id::text;
      select coalesce(sum((x->>'quantity')::integer),0) into v_requested_total from jsonb_array_elements(new.jsonb->'items')x
        where x->>'inventoryAction'='exchange_in' and x->>'costSourceSaleLogId'=v_item->>'costSourceSaleLogId'
          and x->>'costSourceSaleLineIndex'=v_item->>'costSourceSaleLineIndex';
      if v_returned+v_requested_total>(select quantity from public.inventory_cost_events where id=v_source_event)
        then raise exception '이미 교환입고한 수량을 포함해 원래 판매 수량을 초과합니다.'; end if;
      for v_source_allocation in
        select allocation.*, layer.item_id
        from public.inventory_cost_allocations allocation
        join public.inventory_cost_layers layer on layer.id = allocation.source_layer_id
        where allocation.outbound_event_id = v_source_event
        order by layer.queue_sequence, allocation.created_at, allocation.id
      loop
        exit when v_restore_remaining = 0;
        select coalesce(sum(l.original_quantity),0) into v_returned
          from public.inventory_cost_layers l join public.inventory_cost_events r on r.id=l.source_event_id
          where l.source_layer_id=v_source_allocation.source_layer_id and r.event_type='customer_exchange_in'
            and r.metadata->>'sourceSaleLogId'=v_item->>'costSourceSaleLogId'
            and r.metadata->>'sourceSaleLineIndex'=v_item->>'costSourceSaleLineIndex'
            and not(r.reference_id=new.id::text and r.reference_line_key like 'exchange-in:'||v_index::text||':%');
        if v_returned>v_source_allocation.quantity then raise exception '기존 교환입고의 원가층별 수량이 맞지 않습니다. 원본 확인이 필요합니다.'; end if;
        v_restore_quantity := least(v_restore_remaining, v_source_allocation.quantity-v_returned);
        if v_restore_quantity=0 then continue; end if;
        v_segment := v_segment + 1;
        perform public.create_inventory_cost_layer(
          'customer_exchange_in', new.created_at, v_source_allocation.item_id,
          v_name, v_restore_quantity, v_source_allocation.unit_cost,
          case when v_source_allocation.unit_cost is null then 'pending' else 'confirmed' end,
          'front', 'stamp_log', new.id::text,
          'exchange-in:' || v_index::text || ':' || v_segment::text,
          v_source_allocation.source_layer_id,
          jsonb_build_object(
            'customerId', new.customer_id,
            'sourceSaleLogId', v_item->>'costSourceSaleLogId',
            'sourceSaleLineIndex', v_item->>'costSourceSaleLineIndex',
            'sourceAllocationId',v_source_allocation.id
          )
        );
        v_restore_remaining := v_restore_remaining - v_restore_quantity;
      end loop;
    end if;
    if v_source_event is not null and v_restore_remaining>0 then raise exception '교환 원본의 남은 원가 수량이 부족합니다.'; end if;
    if v_restore_remaining > 0 then
      v_segment := v_segment + 1;
      perform public.create_inventory_cost_layer(
        'customer_exchange_in', new.created_at, null, v_name,
        v_restore_remaining, null, 'pending', 'front', 'stamp_log', new.id::text,
        'exchange-in:' || v_index::text || ':' || v_segment::text, null,
        jsonb_build_object(
          'customerId', new.customer_id,
          'sourceSaleLogId', v_item->>'costSourceSaleLogId',
          'sourceSaleLineIndex', v_item->>'costSourceSaleLineIndex',
          'reason', 'original sale cost missing'
        )
      );
    end if;
    v_in_summary := concat_ws(', ', nullif(v_in_summary, ''), v_name || ' ' || v_quantity || '개');
  end loop;

  select case when count(*) filter(where total_cost is null) > 0 then null else coalesce(sum(total_cost), 0)::integer end
  into v_out_cost from public.inventory_cost_events
  where reference_type = 'stamp_log' and reference_id = new.id::text
    and event_type = 'customer_exchange_out';
  select case when count(*) filter(where total_cost is null) > 0 then null else coalesce(sum(total_cost), 0)::integer end
  into v_in_cost from public.inventory_cost_events
  where reference_type = 'stamp_log' and reference_id = new.id::text
    and event_type = 'customer_exchange_in';

  if v_out_cost is not null and v_in_cost is not null then
    v_difference := v_out_cost - v_in_cost;
    if v_difference <> 0 then
      insert into public.settlement_expense_categories(name, is_active, created_by)
      values ('고객 교환 원가차액', true, new.admin_id)
      on conflict(name) do update set is_active = true returning id into v_category_id;
      insert into public.settlement_expenses(
        expense_date, category_id, category, amount, store, is_recurring,
        note, created_by, source_log_id
      ) values (
        (new.created_at at time zone 'Asia/Seoul')::date, v_category_id,
        '고객 교환 원가차액', v_difference, 'common', false,
        coalesce(nullif(btrim(v_customer.name), ''), '고객 미지정') || ',' ||
        coalesce(nullif(btrim(v_customer.phone), ''), '번호 없음') ||
        ' 교환출고 ' || coalesce(nullif(v_out_summary, ''), '없음') ||
        ' / 교환입고 ' || coalesce(nullif(v_in_summary, ''), '없음'),
        new.admin_id, new.id
      ) on conflict(source_log_id) where source_log_id is not null and category = '고객 교환 원가차액'
      do update set amount = excluded.amount, note = excluded.note, updated_at = now();
    end if;
  end if;
  return new;
end;
$$;


create or replace function public.sync_purchase_receipt_cost_layer()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_receipt public.inventory_purchase_receipts%rowtype; v_order_line public.inventory_purchase_order_lines%rowtype;
  v_after_service public.after_services%rowtype; v_item_id bigint; v_cost_quantity integer;
  v_allocation record; v_remaining integer; v_take integer; v_skip integer; v_segment integer:=0;
begin
  select * into v_receipt from public.inventory_purchase_receipts where id=new.receipt_id;
  select * into v_order_line from public.inventory_purchase_order_lines where id=new.order_line_id;
  v_cost_quantity:=new.quantity; -- Demo is deducted exactly once by its outbound allocation.
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
      'items',v_demo_items,'purchaseReceiptId',v_receipt_id::text,'createdWorkerName',coalesce(v_worker_name,'')),'stamp',p_arrived_on::timestamp at time zone 'Asia/Seoul')
    returning id::text into v_demo_log_id;
    update public.inventory_purchase_receipts set demo_log_id=v_demo_log_id where id=v_receipt_id;
  end if;
  update public.inventory_purchase_orders set status=case when not exists(
    select 1 from public.inventory_purchase_order_lines where order_id=p_order_id and received_quantity<ordered_quantity
  ) then 'completed' else 'partial' end,updated_at=now() where id=p_order_id;
  return v_receipt_id;
end $$;
