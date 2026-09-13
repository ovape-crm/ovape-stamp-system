-- Customer refunds are immutable financial records.  A cancellation creates a
-- separate reversal; the original shipment log is never edited.
create table if not exists public.customer_refunds (
  id uuid primary key default gen_random_uuid(),
  source_log_id bigint not null references public.logs(id),
  customer_id bigint not null references public.customers(id),
  status text not null default 'completed' check (status in ('completed', 'cancelled')),
  recovery_type text not null check (recovery_type in ('none', 'normal', 'defective')),
  refund_amount integer not null check (refund_amount > 0),
  selected_limit_amount integer not null check (selected_limit_amount >= refund_amount),
  adjustment_amount integer not null default 0,
  adjustment_reason text,
  reason text not null,
  memo text,
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id),
  cancellation_reason text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((adjustment_amount = 0 and adjustment_reason is null) or (adjustment_amount <> 0 and nullif(btrim(adjustment_reason), '') is not null))
);

create table if not exists public.customer_refund_lines (
  id uuid primary key default gen_random_uuid(),
  refund_id uuid not null references public.customer_refunds(id) on delete cascade,
  source_line_index integer not null,
  item_id bigint references public.items(id),
  item_name text not null,
  quantity integer not null check (quantity > 0),
  gross_unit_price integer not null default 0,
  allocated_discount_amount integer not null default 0,
  refundable_amount integer not null check (refundable_amount >= 0),
  recovery_type text not null check (recovery_type in ('none', 'normal', 'defective')),
  unique(refund_id, source_line_index)
);

create table if not exists public.customer_refund_payments (
  id uuid primary key default gen_random_uuid(),
  refund_id uuid not null references public.customer_refunds(id) on delete cascade,
  payment_type text not null,
  amount integer not null check (amount > 0),
  unique(refund_id, payment_type)
);

create table if not exists public.defective_inventory_holds (
  id uuid primary key default gen_random_uuid(),
  refund_line_id uuid not null unique references public.customer_refund_lines(id),
  customer_id bigint not null references public.customers(id),
  item_id bigint references public.items(id),
  item_name text not null,
  quantity integer not null check (quantity > 0),
  status text not null default 'held' check (status in ('held', 'after_service', 'returned', 'scrapped')),
  source_log_id bigint not null references public.logs(id),
  refund_id uuid not null references public.customer_refunds(id),
  reason text not null,
  memo text,
  after_service_id bigint references public.after_services(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.after_services add column if not exists refund_id uuid references public.customer_refunds(id);
alter table public.after_services add column if not exists defective_hold_id uuid references public.defective_inventory_holds(id);

alter table public.after_services drop constraint if exists after_services_service_case_type_check;
alter table public.after_services add constraint after_services_service_case_type_check check (
  service_case_type in ('customer_as', 'vendor_exchange', 'store_product_as', 'defective_return_as')
);

alter table public.customer_refunds enable row level security;
alter table public.customer_refund_lines enable row level security;
alter table public.customer_refund_payments enable row level security;
alter table public.defective_inventory_holds enable row level security;

create policy "authenticated reads refunds" on public.customer_refunds for select to authenticated using (true);
create policy "authenticated reads refund lines" on public.customer_refund_lines for select to authenticated using (true);
create policy "authenticated reads refund payments" on public.customer_refund_payments for select to authenticated using (true);
create policy "authenticated reads defective holds" on public.defective_inventory_holds for select to authenticated using (true);

create index if not exists customer_refunds_source_log_idx on public.customer_refunds(source_log_id);
create index if not exists defective_inventory_holds_item_status_idx on public.defective_inventory_holds(item_name, status);

alter table public.inventory_cost_events drop constraint if exists inventory_cost_events_event_type_check;
alter table public.inventory_cost_events add constraint inventory_cost_events_event_type_check check (event_type in (
  'opening','purchase_in','sale_out','service_out','customer_exchange_in','customer_exchange_out','after_service_out','after_service_in','adjustment_in','adjustment_out','demo_out','loss_out','reversal','reconciliation_in','reconciliation_out','customer_return_in'
));

create or replace function public.create_customer_refund(
  p_source_log_id bigint, p_recovery_type text, p_refund_amount integer,
  p_selected_limit_amount integer, p_adjustment_reason text, p_reason text,
  p_memo text, p_lines jsonb, p_payments jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_source public.logs%rowtype; v_refund_id uuid; v_line jsonb; v_payment jsonb; v_sum integer := 0;
  v_source_total integer; v_already_refunded integer; v_source_item jsonb; v_source_quantity integer;
  v_line_index integer; v_line_quantity integer; v_existing_quantity integer; v_line_sum integer := 0;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_source from public.logs where id=p_source_log_id for update;
  if not found or v_source.customer_id is null or v_source.category <> 'stamp' then raise exception 'REFUND_SOURCE_NOT_FOUND'; end if;
  v_source_total := greatest(0, coalesce((v_source.jsonb->>'totalAmount')::integer, 0));
  select coalesce(sum(refund_amount), 0) into v_already_refunded from public.customer_refunds where source_log_id = p_source_log_id and status = 'completed';
  if p_recovery_type not in ('none','normal','defective') or p_refund_amount <= 0 or p_refund_amount > v_source_total - v_already_refunded then raise exception 'INVALID_REFUND'; end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'REFUND_REASON_REQUIRED'; end if;
  select coalesce(sum((value->>'amount')::integer),0) into v_sum from jsonb_array_elements(coalesce(p_payments,'[]'::jsonb));
  if v_sum <> p_refund_amount then raise exception 'REFUND_PAYMENT_MISMATCH'; end if;
  for v_line in select value from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) loop
    v_line_index := (v_line->>'sourceLineIndex')::integer;
    v_line_quantity := (v_line->>'quantity')::integer;
    v_source_item := v_source.jsonb->'items'->v_line_index;
    v_source_quantity := coalesce((v_source_item->>'quantity')::integer, 0);
    select coalesce(sum(quantity), 0) into v_existing_quantity
    from public.customer_refund_lines line join public.customer_refunds refund on refund.id=line.refund_id
    where refund.source_log_id=p_source_log_id and refund.status='completed' and line.source_line_index=v_line_index;
    if v_source_item is null or v_line_quantity <= 0 or v_line_quantity > v_source_quantity-v_existing_quantity
      or btrim(coalesce(v_line->>'itemName','')) <> btrim(coalesce(v_source_item->>'itemName','')) then raise exception 'INVALID_REFUND_LINE'; end if;
    v_line_sum := v_line_sum + coalesce((v_line->>'refundableAmount')::integer, 0);
  end loop;
  if v_line_sum <= 0 or p_selected_limit_amount <> v_line_sum or p_refund_amount > v_line_sum then raise exception 'INVALID_REFUND_AMOUNT'; end if;
  insert into public.customer_refunds(source_log_id,customer_id,recovery_type,refund_amount,selected_limit_amount,adjustment_amount,adjustment_reason,reason,memo,created_by)
  values(p_source_log_id,v_source.customer_id,p_recovery_type,p_refund_amount,p_selected_limit_amount,p_selected_limit_amount-p_refund_amount,
    case when p_selected_limit_amount<>p_refund_amount then nullif(btrim(p_adjustment_reason),'') else null end,nullif(btrim(p_reason),''),nullif(btrim(p_memo),''),auth.uid()) returning id into v_refund_id;
  if p_selected_limit_amount<>p_refund_amount and nullif(btrim(p_adjustment_reason),'') is null then raise exception 'REFUND_ADJUSTMENT_REASON_REQUIRED'; end if;
  for v_line in select value from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) loop
    insert into public.customer_refund_lines(refund_id,source_line_index,item_id,item_name,quantity,gross_unit_price,allocated_discount_amount,refundable_amount,recovery_type)
    values(v_refund_id,(v_line->>'sourceLineIndex')::integer,nullif(v_line->>'itemId','')::bigint,v_line->>'itemName',(v_line->>'quantity')::integer,
      coalesce((v_line->>'grossUnitPrice')::integer,0),coalesce((v_line->>'allocatedDiscountAmount')::integer,0),(v_line->>'refundableAmount')::integer,p_recovery_type);
  end loop;
  for v_payment in select value from jsonb_array_elements(coalesce(p_payments,'[]'::jsonb)) loop
    insert into public.customer_refund_payments(refund_id,payment_type,amount) values(v_refund_id,v_payment->>'paymentType',(v_payment->>'amount')::integer);
  end loop;
  if p_recovery_type = 'defective' then
    insert into public.defective_inventory_holds(refund_line_id,customer_id,item_id,item_name,quantity,source_log_id,refund_id,reason,memo)
    select line.id, v_source.customer_id, line.item_id, line.item_name, line.quantity, p_source_log_id, v_refund_id, p_reason, p_memo
    from public.customer_refund_lines line where line.refund_id=v_refund_id;
  elsif p_recovery_type = 'normal' then
    perform public.receive_customer_refund_inventory(v_refund_id);
  end if;
  if p_recovery_type <> 'defective' then
    insert into public.logs(admin_id,customer_id,category,action,note,jsonb)
    values(auth.uid(),v_source.customer_id,'stamp','refund',coalesce(p_reason,''),jsonb_build_object(
      'refundId',v_refund_id,'sourceLogId',p_source_log_id,'totalAmount',-p_refund_amount,
      'payments',p_payments,'paymentType',v_source.jsonb->>'paymentType',
      'storeName',v_source.jsonb->>'storeName','recoveryType',p_recovery_type
    ));
  end if;
  return v_refund_id;
end $$;
revoke all on function public.create_customer_refund(bigint,text,integer,integer,text,text,text,jsonb,jsonb) from public,anon;
grant execute on function public.create_customer_refund(bigint,text,integer,integer,text,text,text,jsonb,jsonb) to authenticated;

create or replace function public.get_customer_refund_summary(p_source_log_id bigint)
returns jsonb language sql stable security definer set search_path = public as $$
  with completed as (
    select id, refund_amount from public.customer_refunds
    where source_log_id=p_source_log_id and status='completed'
  ), quantities as (
    select line.source_line_index, sum(line.quantity)::integer as quantity
    from public.customer_refund_lines line join completed on completed.id=line.refund_id
    group by line.source_line_index
  )
  select jsonb_build_object(
    'refunded_amount', coalesce((select sum(refund_amount) from completed), 0),
    'refunded_quantities', coalesce((select jsonb_object_agg(source_line_index::text, quantity) from quantities), '{}'::jsonb)
  )
$$;
revoke all on function public.get_customer_refund_summary(bigint) from public, anon;
grant execute on function public.get_customer_refund_summary(bigint) to authenticated;

-- A returned normal item re-enters sellable stock.  It is intentionally a
-- separate movement: the original outbound record stays immutable.
alter table public.customer_refund_lines
  add column if not exists inventory_movement_id uuid references public.inventory_movements(id);

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

create table if not exists public.supplier_refund_settlements (
  id uuid primary key default gen_random_uuid(), defective_hold_id uuid not null references public.defective_inventory_holds(id),
  supplier_id uuid references public.inventory_suppliers(id), settlement_type text not null check(settlement_type in ('supplier_credit','bank_refund')),
  amount integer not null check(amount>0), note text, created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
alter table public.supplier_refund_settlements enable row level security;
create policy "authenticated reads supplier refund settlements" on public.supplier_refund_settlements for select to authenticated using (true);

create or replace function public.cancel_customer_refund(p_refund_id uuid,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare refund public.customer_refunds%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'CANCELLATION_REASON_REQUIRED'; end if;
  select * into refund from public.customer_refunds where id=p_refund_id for update;
  if not found or refund.status<>'completed' then raise exception 'REFUND_NOT_CANCELLABLE'; end if;
  if exists(select 1 from public.customer_refund_lines where refund_id=p_refund_id and inventory_movement_id is not null) then raise exception 'REFUND_INVENTORY_ALREADY_RECEIVED'; end if;
  update public.customer_refunds set status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),cancellation_reason=btrim(p_reason),updated_at=now() where id=p_refund_id;
  insert into public.logs(admin_id,customer_id,category,action,note,jsonb) values(auth.uid(),refund.customer_id,'stamp','refund_cancel',btrim(p_reason),jsonb_build_object('refundId',p_refund_id));
end $$;
revoke all on function public.cancel_customer_refund(uuid,text) from public,anon;
grant execute on function public.cancel_customer_refund(uuid,text) to authenticated;

create or replace function public.process_defective_inventory_hold(
  p_hold_id uuid,p_action text,p_supplier_id uuid,p_settlement_type text,p_settlement_amount integer,p_note text
) returns bigint language plpgsql security definer set search_path=public as $$
declare hold public.defective_inventory_holds%rowtype; v_after_service_id bigint;
begin
  if not exists(select 1 from public.users where id=auth.uid() and oss_role='master') then raise exception 'MASTER_REQUIRED'; end if;
  select * into hold from public.defective_inventory_holds where id=p_hold_id for update;
  if not found or hold.status<>'held' then raise exception 'DEFECTIVE_HOLD_NOT_AVAILABLE'; end if;
  if p_action='after_service' then
    insert into public.after_services(customer_id,admin_id,item_type,item_name,quantity,symptom,service_case_type,status,refund_id,defective_hold_id)
    values(hold.customer_id,auth.uid(),'불량 반품',hold.item_name,hold.quantity,coalesce(nullif(btrim(p_note),''),'환불 불량품 A/S'),
      'defective_return_as','received',hold.refund_id,hold.id) returning id into v_after_service_id;
    update public.defective_inventory_holds set status='after_service',after_service_id=v_after_service_id,updated_at=now() where id=hold.id;
    return v_after_service_id;
  end if;
  if p_action not in ('supplier_return','scrap') then raise exception 'INVALID_DEFECTIVE_HOLD_ACTION'; end if;
  if p_action='supplier_return' and (p_supplier_id is null or p_settlement_type not in ('supplier_credit','bank_refund') or coalesce(p_settlement_amount,0)<=0) then raise exception 'SUPPLIER_SETTLEMENT_REQUIRED'; end if;
  if p_action='supplier_return' then insert into public.supplier_refund_settlements(defective_hold_id,supplier_id,settlement_type,amount,note,created_by) values(hold.id,p_supplier_id,p_settlement_type,p_settlement_amount,nullif(btrim(p_note),''),auth.uid()); end if;
  update public.defective_inventory_holds set status=case when p_action='scrap' then 'scrapped' else 'returned' end,updated_at=now() where id=hold.id;
  return null;
end $$;
revoke all on function public.process_defective_inventory_hold(uuid,text,uuid,text,integer,text) from public,anon;
grant execute on function public.process_defective_inventory_hold(uuid,text,uuid,text,integer,text) to authenticated;
