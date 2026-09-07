-- Only a master may create non-customer A/S cases. This protects the rule even
-- when a client bypasses the A/S create modal.
create or replace function public.guard_non_master_inventory_service_case()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.service_case_type in ('vendor_exchange', 'store_product_as')
    and not exists (
      select 1 from public.users
      where id = auth.uid() and oss_role = 'master'
    )
  then
    raise exception 'MASTER_REQUIRED';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_non_master_inventory_service_case_trigger
  on public.after_services;
create trigger guard_non_master_inventory_service_case_trigger
before insert or update of service_case_type on public.after_services
for each row execute function public.guard_non_master_inventory_service_case();

-- A store-product A/S is not a stock dispatch. It has one pending manual-cost
-- allocation, which the master must price before the returned item is received.
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
    select 1 from public.users where id = auth.uid() and oss_role = 'master'
  ) then raise exception 'MASTER_REQUIRED'; end if;
  if coalesce(p_unit_price, 0) <= 0 then raise exception 'UNIT_PRICE_REQUIRED'; end if;

  select * into v_after_service from public.after_services
  where id = p_after_service_id for update;
  if not found then raise exception 'AFTER_SERVICE_NOT_FOUND'; end if;

  if v_after_service.service_case_type = 'store_product_as' then
    if v_after_service.status <> 'sent_for_repair'
      or v_after_service.outbound_processed_at is null
    then raise exception 'MANUAL_COST_NOT_ALLOWED'; end if;
    update public.after_service_outbound_cost_allocations
    set unit_price = p_unit_price
    where after_service_id = v_after_service.id
      and received_quantity = 0;
    if not found then raise exception 'MANUAL_COST_NOT_ALLOWED'; end if;
    return;
  end if;

  if v_after_service.service_case_type <> 'customer_as'
    or not coalesce(v_after_service.is_loaner_device_issued, false)
    or v_after_service.status <> 'sent_for_repair'
  then raise exception 'MANUAL_COST_NOT_ALLOWED'; end if;
  if exists (select 1 from public.after_service_outbound_cost_allocations where after_service_id = v_after_service.id)
  then raise exception 'COST_ALREADY_ASSIGNED'; end if;

  insert into public.after_service_outbound_cost_allocations(
    after_service_id, source_receipt_line_id, unit_price, outbound_quantity
  ) values (v_after_service.id, null, p_unit_price, v_after_service.quantity);
end;
$$;

-- Do not permit a zero-cost store-product receipt: a master must enter the
-- actual purchase cost first, so the normal inbound flow creates its cost layer.
create or replace function public.process_inventory_service_inbound_with_change(
  p_after_service_id bigint,
  p_arrived_on date,
  p_item_name text,
  p_quantity integer,
  p_memo text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_original_item_name text;
  v_original_quantity integer;
  v_case_type text;
  v_receipt_id uuid;
begin
  select item_name, quantity, service_case_type
  into v_original_item_name, v_original_quantity, v_case_type
  from public.after_services where id = p_after_service_id for update;
  if not found then raise exception 'AFTER_SERVICE_NOT_FOUND'; end if;
  if v_case_type = 'store_product_as' and not exists (
    select 1 from public.after_service_outbound_cost_allocations
    where after_service_id = p_after_service_id and unit_price > 0
  ) then raise exception 'STORE_PRODUCT_MANUAL_COST_REQUIRED'; end if;
  if nullif(btrim(coalesce(p_item_name, '')), '') is null then raise exception 'ITEM_NAME_REQUIRED'; end if;

  update public.after_services set item_name = btrim(p_item_name) where id = p_after_service_id;
  begin
    v_receipt_id := public.process_inventory_service_inbound(
      p_after_service_id, p_arrived_on, p_item_name, p_quantity, p_memo
    );
  exception when others then
    update public.after_services set item_name = v_original_item_name where id = p_after_service_id;
    raise;
  end;
  update public.after_services set
    item_name = v_original_item_name,
    repair_receipt_match_type = case
      when btrim(p_item_name) = btrim(v_original_item_name) and p_quantity = v_original_quantity then 'match'
      else 'mismatch'
    end
  where id = p_after_service_id;
  return v_receipt_id;
end;
$$;
