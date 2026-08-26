alter table public.inventory_purchase_orders
  add column if not exists entered_total_amount integer check (entered_total_amount >= 0);

create or replace function public.create_inventory_purchase_order_with_final_amount(
  p_supplier_id uuid, p_ordered_on date, p_note text, p_lines jsonb,
  p_adjustments jsonb default '[]'::jsonb, p_entered_total_amount integer default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_order_id uuid;
begin
  if p_entered_total_amount is not null and p_entered_total_amount < 0 then raise exception 'FINAL_AMOUNT_INVALID'; end if;
  v_order_id := public.create_inventory_purchase_order(p_supplier_id, p_ordered_on, p_note, p_lines, p_adjustments);
  update public.inventory_purchase_orders set entered_total_amount = p_entered_total_amount where id = v_order_id;
  return v_order_id;
end; $$;

create or replace function public.update_inventory_purchase_order_details_with_final_amount(
  p_order_id uuid, p_supplier_id uuid, p_ordered_on date, p_note text,
  p_lines jsonb, p_receipts jsonb, p_entered_total_amount integer default null
) returns void language plpgsql security definer set search_path=public as $$
begin
  if p_entered_total_amount is not null and p_entered_total_amount < 0 then raise exception 'FINAL_AMOUNT_INVALID'; end if;
  perform public.update_inventory_purchase_order_details(p_order_id, p_supplier_id, p_ordered_on, p_note, p_lines, p_receipts);
  update public.inventory_purchase_orders set entered_total_amount = p_entered_total_amount where id = p_order_id;
end; $$;

revoke all on function public.create_inventory_purchase_order_with_final_amount(uuid,date,text,jsonb,jsonb,integer) from public, anon;
revoke all on function public.update_inventory_purchase_order_details_with_final_amount(uuid,uuid,date,text,jsonb,jsonb,integer) from public, anon;
grant execute on function public.create_inventory_purchase_order_with_final_amount(uuid,date,text,jsonb,jsonb,integer) to authenticated;
grant execute on function public.update_inventory_purchase_order_details_with_final_amount(uuid,uuid,date,text,jsonb,jsonb,integer) to authenticated;
