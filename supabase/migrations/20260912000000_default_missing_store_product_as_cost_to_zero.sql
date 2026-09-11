-- 기존 매장제품 A/S 중 화면에는 0원으로 보이지만 원가 배정 행이 없는 건을
-- 입고할 때 0원 원가층을 자동 생성한다.

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
    where after_service_id = p_after_service_id and unit_price is not null
  ) then
    update public.after_service_outbound_cost_allocations
    set unit_price = 0,
        outbound_quantity = v_original_quantity
    where after_service_id = p_after_service_id
      and received_quantity = 0;

    if not found then
      insert into public.after_service_outbound_cost_allocations(
        after_service_id, source_receipt_line_id, unit_price, outbound_quantity
      ) values (p_after_service_id, null, 0, v_original_quantity);
    end if;
  end if;

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

revoke all on function public.process_inventory_service_inbound_with_change(bigint, date, text, integer, text)
  from public, anon;
grant execute on function public.process_inventory_service_inbound_with_change(bigint, date, text, integer, text)
  to authenticated;
