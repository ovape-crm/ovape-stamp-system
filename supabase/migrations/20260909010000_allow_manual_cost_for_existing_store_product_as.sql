-- 기존 운영 화면에서 이미 출고 확정되어 수리 발송 상태인 매장제품 A/S도
-- 원가를 계속 입력할 수 있게 한다. 새 접수 건은 received 상태에서 원가를 저장한다.
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
    if v_after_service.status not in ('received', 'sent_for_repair') then
      raise exception 'MANUAL_COST_NOT_ALLOWED';
    end if;

    update public.after_service_outbound_cost_allocations
    set unit_price = p_unit_price,
        outbound_quantity = v_after_service.quantity
    where after_service_id = v_after_service.id
      and received_quantity = 0;

    if not found then
      insert into public.after_service_outbound_cost_allocations(
        after_service_id, source_receipt_line_id, unit_price, outbound_quantity
      ) values (v_after_service.id, null, p_unit_price, v_after_service.quantity);
    end if;
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
