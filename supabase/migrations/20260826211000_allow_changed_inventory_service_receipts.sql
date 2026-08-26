-- 업체 교환/매장제품 A/S는 실제 입고된 품목과 수량으로 처리한다.
-- 출고보다 많은 수량은 별도 매입 원가가 필요하므로 이 경로에서는 허용하지 않는다.
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
  v_receipt_id uuid;
begin
  select item_name into v_original_item_name
  from public.after_services where id = p_after_service_id for update;
  if not found then raise exception 'AFTER_SERVICE_NOT_FOUND'; end if;
  if nullif(btrim(coalesce(p_item_name, '')), '') is null then
    raise exception 'ITEM_NAME_REQUIRED';
  end if;

  -- 기존 FIFO 원가 배정 함수를 재사용하되, 입고 레이어에는 실제 수리/교환품명을 기록한다.
  update public.after_services set item_name = btrim(p_item_name)
  where id = p_after_service_id;
  begin
    v_receipt_id := public.process_inventory_service_inbound(
      p_after_service_id, p_arrived_on, p_item_name, p_quantity, p_memo
    );
  exception when others then
    update public.after_services set item_name = v_original_item_name where id = p_after_service_id;
    raise;
  end;
  update public.after_services set item_name = v_original_item_name where id = p_after_service_id;
  return v_receipt_id;
end;
$$;

revoke all on function public.process_inventory_service_inbound_with_change(bigint, date, text, integer, text) from public, anon;
grant execute on function public.process_inventory_service_inbound_with_change(bigint, date, text, integer, text) to authenticated;
