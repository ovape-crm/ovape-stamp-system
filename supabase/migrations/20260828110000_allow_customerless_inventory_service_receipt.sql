-- 재고 처리 A/S 입고는 연결된 고객을 주문라인으로 자동 승계한다.
-- 매장제품 A/S처럼 고객이 없는 재고 건은 고객 없이도 입고할 수 있다.
create or replace function public.guard_after_service_exchange_in_line()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_old_is_generic_as boolean := false;
  v_new_is_generic_as boolean := false;
  v_case_type text;
begin
  if tg_op = 'DELETE' then
    if old.after_service_id is not null then raise exception 'AFTER_SERVICE_EXCHANGE_IN_LINE_DELETE_FORBIDDEN'; end if;
    if (old.handling_type = 'as_exchange_in' or old.inbound_type = 'as_exchange_in')
      and exists(select 1 from public.inventory_purchase_receipt_lines where order_line_id = old.id) then raise exception 'AFTER_SERVICE_EXCHANGE_IN_LINE_DELETE_FORBIDDEN'; end if;
    if (old.handling_type = 'as_exchange_in' or old.inbound_type = 'as_exchange_in') and not public.is_current_user_master() then raise exception 'MASTER_REQUIRED'; end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.after_service_id is distinct from new.after_service_id then raise exception 'AFTER_SERVICE_LINE_LINK_IMMUTABLE'; end if;
  if tg_op = 'UPDATE' and old.handling_type = 'as_exchange_in' and new.handling_type is distinct from 'as_exchange_in'
    and exists(select 1 from public.inventory_purchase_receipt_lines where order_line_id = old.id) then raise exception 'COMPLETED_AS_EXCHANGE_IN_CLASSIFICATION_IMMUTABLE'; end if;
  if tg_op = 'UPDATE' then v_old_is_generic_as := old.after_service_id is null and (old.handling_type = 'as_exchange_in' or old.inbound_type = 'as_exchange_in'); end if;
  v_new_is_generic_as := new.after_service_id is null and new.handling_type = 'as_exchange_in';
  if (tg_op = 'INSERT' and v_new_is_generic_as) or (tg_op = 'UPDATE' and v_old_is_generic_as is distinct from v_new_is_generic_as) then
    if not public.is_current_user_master() then raise exception 'MASTER_REQUIRED'; end if;
  end if;
  if new.after_service_id is not null and new.customer_id is null then
    select customer_id, service_case_type into new.customer_id, v_case_type from public.after_services where id = new.after_service_id;
  elsif new.after_service_id is not null then
    select service_case_type into v_case_type from public.after_services where id = new.after_service_id;
  end if;
  if (new.after_service_id is null and new.handling_type = 'as_exchange_in') or (new.after_service_id is not null and v_case_type = 'customer_as') then
    if new.customer_id is null then raise exception 'CUSTOMER_REQUIRED'; end if;
  end if;
  if new.after_service_id is not null and new.customer_id is not null and not exists(select 1 from public.after_services where id = new.after_service_id and customer_id = new.customer_id) then raise exception 'AFTER_SERVICE_CUSTOMER_MISMATCH'; end if;
  if new.after_service_id is not null or new.handling_type = 'as_exchange_in' then
    new.handling_type := 'as_exchange_in'; new.inbound_type := 'as_exchange_in';
  else new.inbound_type := 'purchase'; end if;
  return new;
end;
$$;
