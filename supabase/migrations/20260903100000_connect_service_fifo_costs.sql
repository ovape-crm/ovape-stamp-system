alter table public.inventory_cost_events drop constraint inventory_cost_events_event_type_check;
alter table public.inventory_cost_events add constraint inventory_cost_events_event_type_check check(event_type in (
  'opening','purchase_in','sale_out','service_out','customer_exchange_in','customer_exchange_out',
  'after_service_out','after_service_in','adjustment_in','adjustment_out','demo_out','loss_out','reversal','reconciliation_in','reconciliation_out'));

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

-- Do not rebuild FIFO allocations for a payment/memo-only log edit.
-- Preserve individual unchanged ordinary lines even when another line is edited.
create or replace function public.rollback_stamp_log_cost_ledger()
returns trigger language plpgsql security definer set search_path=public as $$
declare e record; a record; l record; v_keep boolean;
begin
  if old.category<>'stamp' then return case when tg_op='UPDATE' then new else old end; end if;
  if tg_op='UPDATE' and new.category=old.category and new.created_at=old.created_at
    and new.jsonb->'items' is not distinct from old.jsonb->'items' then return new; end if;
  for e in select * from public.inventory_cost_events where reference_type='stamp_log' and reference_id=old.id::text order by item_name,id loop
    v_keep:=false;
    if tg_op='UPDATE' and new.category='stamp' and new.created_at=old.created_at
      and e.reference_line_key ~ '^[1-9][0-9]*$' and e.event_type in ('sale_out','service_out','demo_out') then
      v_keep:=(new.jsonb->'items'->(e.reference_line_key::integer-1)) is not distinct from (old.jsonb->'items'->(e.reference_line_key::integer-1));
    end if;
    if v_keep then continue; end if;
    perform pg_advisory_xact_lock(hashtextextended(btrim(e.item_name),0));
    if exists(select 1 from public.inventory_cost_events child
      where child.metadata->>'sourceSaleLogId'=e.reference_id and child.metadata->>'sourceSaleLineIndex'=e.reference_line_key)
      or (e.event_type='after_service_out' and exists(select 1 from public.inventory_cost_events child
        where child.event_type='after_service_in' and child.metadata->>'afterServiceId'=e.metadata->>'afterServiceId')) then
      raise exception '반품·A/S 입고에 연결된 출고는 직접 수정하거나 삭제할 수 없습니다.';
    end if;
    for l in select * from public.inventory_cost_layers where source_event_id=e.id loop
      if l.remaining_quantity<>l.original_quantity then raise exception '후속 출고에 사용된 입고 원가가 있어 수정·삭제할 수 없습니다.'; end if;
    end loop;
    for a in select source_layer_id,sum(quantity)::integer quantity from public.inventory_cost_allocations where outbound_event_id=e.id group by source_layer_id loop
      update public.inventory_cost_layers set remaining_quantity=remaining_quantity+a.quantity where id=a.source_layer_id;
    end loop;
    delete from public.inventory_cost_events where id=e.id;
  end loop;
  if tg_op='UPDATE' then
    delete from public.settlement_expenses where source_log_id=old.id and category in ('고객 교환 원가차액','재고손실');
    return new;
  end if;
  return old;
end $$;

-- Vendor exchanges previously deducted physical inventory but used a separate receipt-
-- quantity ledger. New allocations are copied from the one actual FIFO allocation.
alter table public.after_service_outbound_cost_allocations add column cost_allocation_id uuid
  references public.inventory_cost_allocations(id);
create unique index after_service_fifo_allocation_unique on public.after_service_outbound_cost_allocations(cost_allocation_id)
  where cost_allocation_id is not null;
drop policy if exists "authenticated reads A/S outbound allocations" on public.after_service_outbound_cost_allocations;
create policy "master reads A/S outbound costs" on public.after_service_outbound_cost_allocations
for select to authenticated using (exists(select 1 from public.users where id=auth.uid() and oss_role='master'));

create or replace function public.process_inventory_service_outbound(p_after_service_id bigint,p_case_type text,p_supplier_id uuid,p_allocations jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare s public.after_services%rowtype; a record; v_event uuid; v_stock integer; v_at timestamptz:=now();
begin
  if not exists(select 1 from public.users where id=auth.uid() and oss_role='master') then raise exception 'MASTER_REQUIRED'; end if;
  select * into s from public.after_services where id=p_after_service_id for update;
  if not found then raise exception 'AFTER_SERVICE_NOT_FOUND'; end if;
  if s.customer_id is not null or p_case_type not in ('vendor_exchange','store_product_as') or p_case_type<>s.service_case_type then raise exception 'INVALID_SERVICE_CASE_TYPE'; end if;
  if s.outbound_processed_at is not null or exists(select 1 from public.after_service_outbound_cost_allocations where after_service_id=s.id) then raise exception 'OUTBOUND_ALREADY_PROCESSED'; end if;
  if p_supplier_id is null or p_supplier_id is distinct from s.outbound_supplier_id then raise exception 'SUPPLIER_REQUIRED'; end if;
  if p_case_type='store_product_as' then
    -- Existing policy: these are already outside stock. Dispatch does not deduct again.
    insert into public.after_service_outbound_cost_allocations(after_service_id,unit_price,outbound_quantity) values(s.id,0,s.quantity);
  else
    perform pg_advisory_xact_lock(hashtextextended(btrim(s.item_name),0));
    select quantity into v_stock from public.inventory_balances where item_name=s.item_name for update;
    if coalesce(v_stock,0)<s.quantity then raise exception 'INSUFFICIENT_INVENTORY'; end if;
    v_event:=public.allocate_inventory_cost_fifo('after_service_out',v_at,null,s.item_name,s.quantity,'after_service_outbound',s.id::text,'','after_service_pending',jsonb_build_object('afterServiceId',s.id));
    if exists(select 1 from public.inventory_cost_allocations where outbound_event_id=v_event and unit_cost is null) then raise exception '미확정 원가층이 있습니다. 원가를 확인한 후 업체 출고하세요.'; end if;
    -- Legacy clients submitting manual receipt choices must not silently get different prices.
    if p_allocations is not null and p_allocations<>'[]'::jsonb then
      if (select sum((x->>'quantity')::integer) from jsonb_array_elements(p_allocations) x) is distinct from s.quantity
        or (select sum((x->>'quantity')::bigint*(x->>'unitPrice')::integer) from jsonb_array_elements(p_allocations) x)
          is distinct from (select total_cost::bigint from public.inventory_cost_events where id=v_event) then
        raise exception '요청한 원가와 실제 FIFO 원가가 다릅니다. 다시 확인하세요.';
      end if;
    end if;
    for a in select allocation.*,source.reference_type,source.reference_line_key from public.inventory_cost_allocations allocation
      join public.inventory_cost_layers layer on layer.id=allocation.source_layer_id
      join public.inventory_cost_events source on source.id=layer.source_event_id where allocation.outbound_event_id=v_event order by allocation.created_at,allocation.id
    loop
      insert into public.after_service_outbound_cost_allocations(after_service_id,source_receipt_line_id,unit_price,outbound_quantity,cost_allocation_id)
      values(s.id,case when a.reference_type='purchase_receipt' then
        (select id from public.inventory_purchase_receipt_lines where id::text=split_part(a.reference_line_key,':',1)) else null end,a.unit_cost,a.quantity,a.id);
      update public.inventory_balances set quantity=quantity-a.quantity,updated_at=now() where item_name=s.item_name returning quantity into v_stock;
      insert into public.inventory_movements(item_name,movement_type,quantity_delta,quantity_after,unit_price,reference_type,reference_id,note,created_by,inventory_action,item_remark)
      values(s.item_name,'sale_out',-a.quantity,v_stock,a.unit_cost,'after_service_outbound',s.id::text,'업체 교환출고',auth.uid(),p_case_type,'업체 교환출고');
    end loop;
  end if;
  update public.after_services set outbound_processed_at=v_at,status='sent_for_repair' where id=s.id;
end $$;

create or replace function public.confirm_inventory_service_outbound(p_after_service_id bigint)
returns void language plpgsql security definer set search_path=public as $$
declare s public.after_services%rowtype;
begin
  if not exists(select 1 from public.users where id=auth.uid() and oss_role='master') then raise exception 'MASTER_REQUIRED'; end if;
  select * into s from public.after_services where id=p_after_service_id for update;
  if not found then raise exception 'AFTER_SERVICE_NOT_FOUND'; end if;
  perform public.process_inventory_service_outbound(s.id,s.service_case_type,s.outbound_supplier_id,null);
end $$;

create or replace function public.restore_inventory_service_outbound_on_as_delete()
returns trigger language plpgsql security definer set search_path=public as $$
declare a record; v_qty integer; v_stock integer;
begin
  if coalesce(current_setting('app.after_service_cleanup',true),'')<>'on' then raise exception 'AFTER_SERVICE_LINKED_RECORD'; end if;
  perform pg_advisory_xact_lock(hashtextextended(btrim(old.item_name),0));
  -- Restore only stock actually deducted, never the zero-stock store-product dispatch.
  select coalesce(-sum(quantity_delta),0)::integer into v_qty from public.inventory_movements
    where reference_type in ('after_service_outbound','after_service_outbound_reversal') and reference_id=old.id::text and item_name=old.item_name;
  if v_qty<0 then raise exception 'A/S 재고 원복 이력이 일치하지 않습니다.'; end if;
  if exists(select 1 from public.inventory_cost_events where reference_type='after_service_outbound' and reference_id=old.id::text)
    and v_qty is distinct from (select sum(quantity)::integer from public.inventory_cost_events where reference_type='after_service_outbound' and reference_id=old.id::text) then
    raise exception 'A/S 재고와 원가 수량이 달라 원복을 중단했습니다.';
  end if;
  for a in select allocation.source_layer_id,sum(allocation.quantity)::integer quantity
    from public.inventory_cost_allocations allocation join public.inventory_cost_events e on e.id=allocation.outbound_event_id
    where e.reference_type='after_service_outbound' and e.reference_id=old.id::text group by allocation.source_layer_id
  loop update public.inventory_cost_layers set remaining_quantity=remaining_quantity+a.quantity where id=a.source_layer_id; end loop;
  delete from public.after_service_outbound_cost_allocations where after_service_id=old.id;
  delete from public.inventory_cost_events where reference_type='after_service_outbound' and reference_id=old.id::text;
  if v_qty>0 then
    update public.inventory_balances set quantity=quantity+v_qty,updated_at=now() where item_name=old.item_name returning quantity into v_stock;
    if not found then raise exception 'A/S 원복 대상 재고가 없습니다.'; end if;
    insert into public.inventory_movements(item_name,movement_type,quantity_delta,quantity_after,reference_type,reference_id,note,created_by,inventory_action,item_remark)
    values(old.item_name,'reversal',v_qty,v_stock,'after_service_outbound_reversal',old.id::text,'A/S 삭제로 인한 출고 취소',auth.uid(),old.service_case_type,'A/S 출고 취소');
  end if;
  return old;
end $$;

-- Cost is not selling price: when an allocation exists, NULL stays unknown rather than
-- falling back to the movement's zero selling price. Inbound receipt prices remain intact.
create or replace function public.get_inventory_movement_unit_prices(p_movement_ids uuid[])
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_object_agg(m.id::text,case
    when m.reference_type='after_service_outbound' and m.unit_price is not null then m.unit_price
    when m.quantity_delta<0 and c.n>0 then c.unit_cost
    else coalesce(m.unit_price,c.unit_cost) end),'{}'::jsonb)
  from public.inventory_movements m
  cross join lateral(select count(*) n,case when bool_or(e.total_cost is null) then null
    else round(sum(e.total_cost)::numeric/nullif(sum(e.quantity),0))::integer end unit_cost
    from public.inventory_cost_events e where e.item_name=btrim(m.item_name) and e.reference_id=m.reference_id
      and ((m.reference_type='outbound_log' and e.reference_type='stamp_log'
          and e.direction=case when m.inventory_action in ('exchange_in','adjustment_in') then 'in' else 'out' end)
        or (m.reference_type='after_service_outbound' and e.reference_type='after_service_outbound')
        or (m.reference_type in ('purchase_receipt','purchase_receipt_reversal') and e.reference_type='purchase_receipt'))
  ) c
  where m.id=any(coalesce(p_movement_ids,array[]::uuid[]))
    and exists(select 1 from public.users where id=auth.uid() and oss_role='master');
$$;

create or replace function public.get_after_service_outbound_cost_details(p_after_service_id bigint)
returns table(id uuid,unit_price integer,outbound_quantity integer,received_quantity integer,cost_source text)
language plpgsql stable security definer set search_path=public as $$
begin
  if not exists(select 1 from public.users where users.id=auth.uid() and oss_role='master') then raise exception 'MASTER_REQUIRED'; end if;
  return query
  select a.id,a.unit_price,a.outbound_quantity,a.received_quantity,
    case when a.cost_allocation_id is not null then 'FIFO 원가층' else '기존·수동 원가 기록' end
    from public.after_service_outbound_cost_allocations a where a.after_service_id=p_after_service_id
      and (a.cost_allocation_id is not null or not exists(select 1 from public.inventory_cost_events e
        join public.inventory_cost_allocations core on core.outbound_event_id=e.id
        where e.event_type='after_service_out' and (e.metadata->>'afterServiceId'=p_after_service_id::text
          or exists(select 1 from public.logs log where log.id::text=e.reference_id and e.reference_type='stamp_log'
            and (log.after_service_id=p_after_service_id or log.jsonb->>'afterServiceId'=p_after_service_id::text)))))
  union all
  select a.id,a.unit_cost,a.quantity,
    greatest(0,least(a.quantity,coalesce((select sum(l.original_quantity) from public.inventory_cost_layers l join public.inventory_cost_events src on src.id=l.source_event_id
      where l.source_layer_id=a.source_layer_id and src.event_type='after_service_in' and src.metadata->>'afterServiceId'=p_after_service_id::text),0)
      -coalesce(sum(a.quantity) over(partition by a.source_layer_id order by e.event_at,e.id,a.id rows between unbounded preceding and 1 preceding),0)))::integer,
    'FIFO 원가층'::text
  from public.inventory_cost_allocations a join public.inventory_cost_events e on e.id=a.outbound_event_id
  where e.event_type='after_service_out' and (e.metadata->>'afterServiceId'=p_after_service_id::text
      or exists(select 1 from public.logs log where log.id::text=e.reference_id and e.reference_type='stamp_log'
        and (log.after_service_id=p_after_service_id or log.jsonb->>'afterServiceId'=p_after_service_id::text)))
    and not exists(select 1 from public.after_service_outbound_cost_allocations s where s.cost_allocation_id=a.id)
  order by id;
end $$;
revoke all on function public.get_after_service_outbound_cost_details(bigint) from public,anon;
grant execute on function public.get_after_service_outbound_cost_details(bigint) to authenticated;
revoke all on function public.process_inventory_service_outbound(bigint,text,uuid,jsonb) from public,anon;
grant execute on function public.process_inventory_service_outbound(bigint,text,uuid,jsonb) to authenticated;
