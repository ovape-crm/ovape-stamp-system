-- Purchase costs are master-only data. Non-master inventory editors keep the
-- existing price without receiving it from PostgREST.

revoke select on table public.inventory_purchase_order_lines from authenticated;
grant select (
  id, order_id, item_name, ordered_quantity, received_quantity,
  pending_quantity, note, quantity_checked_by, quantity_checked_at,
  quantity_check_note, handling_type, handling_note, customer_id,
  reservation_log_id, after_service_id, inbound_type
) on table public.inventory_purchase_order_lines to authenticated;

revoke select on table public.inventory_purchase_receipt_lines from authenticated;
grant select (
  id, receipt_id, order_line_id, item_name, quantity,
  quantity_checked_by, quantity_checked_at, note, quantity_check_note
) on table public.inventory_purchase_receipt_lines to authenticated;

revoke select on table public.inventory_movements from authenticated;
grant select (
  id, item_name, movement_type, quantity_delta, quantity_after,
  reference_type, reference_id, reversed_movement_id, note, created_by,
  created_at, counterparty_name, counterparty_id, inventory_action, item_remark
) on table public.inventory_movements to authenticated;

create or replace function public.get_inventory_purchase_order_unit_prices(
  p_line_ids uuid[]
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid() and oss_role = 'master'
  ) then
    raise exception 'MASTER_REQUIRED';
  end if;

  select coalesce(jsonb_object_agg(id::text, unit_price), '{}'::jsonb)
  into v_result
  from public.inventory_purchase_order_lines
  where id = any(coalesce(p_line_ids, array[]::uuid[]));

  return v_result;
end;
$$;

create or replace function public.get_inventory_purchase_receipt_unit_prices(
  p_start_date date,
  p_end_date date
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid() and oss_role = 'master'
  ) then
    raise exception 'MASTER_REQUIRED';
  end if;
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date then
    raise exception 'INVALID_DATE_RANGE';
  end if;

  select coalesce(jsonb_object_agg(line.id::text, line.unit_price), '{}'::jsonb)
  into v_result
  from public.inventory_purchase_receipt_lines line
  join public.inventory_purchase_receipts receipt on receipt.id = line.receipt_id
  where receipt.reversed_at is null
    and receipt.order_id in (
      select ranged_receipt.order_id
      from public.inventory_purchase_receipts ranged_receipt
      where ranged_receipt.arrived_on between p_start_date and p_end_date
        and ranged_receipt.reversed_at is null
    );

  return v_result;
end;
$$;

create or replace function public.get_inventory_movement_unit_prices(
  p_movement_ids bigint[]
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid() and oss_role = 'master'
  ) then
    raise exception 'MASTER_REQUIRED';
  end if;

  select coalesce(jsonb_object_agg(id::text, unit_price), '{}'::jsonb)
  into v_result
  from public.inventory_movements
  where id = any(coalesce(p_movement_ids, array[]::bigint[]));

  return v_result;
end;
$$;

revoke all on function public.get_inventory_purchase_order_unit_prices(uuid[]) from public, anon;
revoke all on function public.get_inventory_purchase_receipt_unit_prices(date, date) from public, anon;
revoke all on function public.get_inventory_movement_unit_prices(bigint[]) from public, anon;
grant execute on function public.get_inventory_purchase_order_unit_prices(uuid[]) to authenticated;
grant execute on function public.get_inventory_purchase_receipt_unit_prices(date, date) to authenticated;
grant execute on function public.get_inventory_movement_unit_prices(bigint[]) to authenticated;

create or replace function public.require_inventory_purchase_unit_price()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_master boolean := exists (
    select 1 from public.users
    where id = auth.uid() and oss_role = 'master'
  );
begin
  if tg_op = 'INSERT' then
    if new.unit_price is not null and new.unit_price < 0 then
      raise exception 'PURCHASE_UNIT_PRICE_REQUIRED';
    end if;
    if new.unit_price is not null
      and new.after_service_id is null
      and not v_is_master then
      raise exception 'MASTER_REQUIRED';
    end if;
    return new;
  end if;

  if new.unit_price is distinct from old.unit_price then
    if not v_is_master then
      new.unit_price := old.unit_price;
      return new;
    end if;
    if new.unit_price is null or new.unit_price < 0 then
      raise exception 'PURCHASE_UNIT_PRICE_REQUIRED';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.require_inventory_purchase_receipt_unit_price()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_master boolean := exists (
    select 1 from public.users
    where id = auth.uid() and oss_role = 'master'
  );
  v_order_unit_price integer;
begin
  if tg_op = 'UPDATE' and new.unit_price is distinct from old.unit_price
    and not v_is_master then
    new.unit_price := old.unit_price;
    return new;
  end if;

  if tg_op = 'INSERT' and not v_is_master then
    select unit_price into v_order_unit_price
    from public.inventory_purchase_order_lines
    where id = new.order_line_id;
    if v_order_unit_price is null then
      raise exception 'PURCHASE_UNIT_PRICE_REQUIRED';
    end if;
    new.unit_price := v_order_unit_price;
  end if;

  if new.unit_price is null or new.unit_price < 0 then
    raise exception 'PURCHASE_UNIT_PRICE_REQUIRED';
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
