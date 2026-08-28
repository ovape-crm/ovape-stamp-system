-- 과거 재고처리 고객 A/S에는 실제 원가를 추정하지 않고, 마스터가 직접 입력한다.
create or replace function public.set_after_service_manual_cost(
  p_after_service_id bigint,
  p_unit_price integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_after_service public.after_services%rowtype;
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid() and oss_role = 'master'
  ) then raise exception 'MASTER_REQUIRED'; end if;
  if coalesce(p_unit_price, 0) <= 0 then raise exception 'UNIT_PRICE_REQUIRED'; end if;

  select * into v_after_service
  from public.after_services
  where id = p_after_service_id
  for update;
  if not found then raise exception 'AFTER_SERVICE_NOT_FOUND'; end if;
  if v_after_service.service_case_type <> 'customer_as'
    or not coalesce(v_after_service.is_loaner_device_issued, false)
    or v_after_service.status <> 'sent_for_repair'
  then raise exception 'MANUAL_COST_NOT_ALLOWED'; end if;
  if exists (
    select 1 from public.after_service_outbound_cost_allocations
    where after_service_id = v_after_service.id
  ) then raise exception 'COST_ALREADY_ASSIGNED'; end if;

  insert into public.after_service_outbound_cost_allocations(
    after_service_id, source_receipt_line_id, unit_price, outbound_quantity
  ) values (v_after_service.id, null, p_unit_price, v_after_service.quantity);
end;
$$;

-- 일반 고객 A/S 수리입고도, 원가가 직접 배정된 과거 건이면 그 원가층을 그대로 사용한다.
create or replace function public.process_after_service_repair_receipt_with_cost(
  p_after_service_id bigint,
  p_arrived_on date,
  p_item_name text,
  p_quantity integer,
  p_match_type text,
  p_memo text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_after_service public.after_services%rowtype;
  v_receipt_id uuid;
  v_allocated_quantity integer;
  v_allocated_cost bigint;
  v_unit_price integer;
begin
  select * into v_after_service
  from public.after_services
  where id = p_after_service_id
  for update;
  if not found then raise exception 'AFTER_SERVICE_NOT_FOUND'; end if;

  select
    coalesce(sum(outbound_quantity - received_quantity), 0)::integer,
    coalesce(sum(unit_price * (outbound_quantity - received_quantity)), 0)::bigint
  into v_allocated_quantity, v_allocated_cost
  from public.after_service_outbound_cost_allocations
  where after_service_id = v_after_service.id;

  if v_allocated_quantity > 0 then
    if btrim(p_item_name) <> btrim(v_after_service.item_name)
      or p_quantity <> v_allocated_quantity
    then raise exception 'MANUAL_COST_RECEIPT_MISMATCH'; end if;
    if mod(v_allocated_cost, v_allocated_quantity) <> 0 then
      raise exception 'MANUAL_COST_ALLOCATION_INVALID'; end if;
    v_unit_price := (v_allocated_cost / v_allocated_quantity)::integer;
  end if;

  v_receipt_id := public.process_after_service_repair_receipt(
    p_after_service_id, p_arrived_on, p_item_name, p_quantity, p_match_type, p_memo
  );

  if v_allocated_quantity > 0 then
    update public.inventory_purchase_order_lines
    set unit_price = v_unit_price
    where after_service_id = p_after_service_id and inbound_type = 'as_exchange_in';
    update public.inventory_purchase_receipt_lines
    set unit_price = v_unit_price
    where receipt_id = v_receipt_id;
    update public.inventory_movements
    set unit_price = v_unit_price
    where reference_type = 'purchase_receipt' and reference_id = v_receipt_id::text;
    update public.after_service_outbound_cost_allocations
    set received_quantity = outbound_quantity
    where after_service_id = p_after_service_id;
  end if;

  return v_receipt_id;
end;
$$;

revoke all on function public.set_after_service_manual_cost(bigint, integer) from public, anon, authenticated;
revoke all on function public.process_after_service_repair_receipt_with_cost(bigint, date, text, integer, text, text) from public, anon, authenticated;
grant execute on function public.set_after_service_manual_cost(bigint, integer) to authenticated;
grant execute on function public.process_after_service_repair_receipt_with_cost(bigint, date, text, integer, text, text) to authenticated;
