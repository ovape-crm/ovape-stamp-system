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
  v_receipt_id uuid;
begin
  select item_name, quantity into v_original_item_name, v_original_quantity
  from public.after_services where id = p_after_service_id for update;
  if not found then raise exception 'AFTER_SERVICE_NOT_FOUND'; end if;
  if nullif(btrim(coalesce(p_item_name, '')), '') is null then
    raise exception 'ITEM_NAME_REQUIRED';
  end if;
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
