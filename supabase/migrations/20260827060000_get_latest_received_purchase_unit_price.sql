-- 품목 선택 시 최근 실제 입고 전표의 단가를 마스터에게만 제공한다.
create or replace function public.get_latest_inventory_purchase_unit_price(
  p_item_name text
) returns integer
language sql
stable
security definer
set search_path = public
as $$
  select receipt_line.unit_price
  from public.inventory_purchase_receipt_lines receipt_line
  join public.inventory_purchase_receipts receipt
    on receipt.id = receipt_line.receipt_id
    and receipt.reversed_at is null
  join public.users app_user
    on app_user.id = auth.uid()
    and app_user.oss_role = 'master'
  where btrim(receipt_line.item_name) = btrim(p_item_name)
    and receipt_line.unit_price is not null
  order by receipt.arrived_on desc, receipt.created_at desc, receipt_line.id desc
  limit 1;
$$;

revoke all on function public.get_latest_inventory_purchase_unit_price(text)
  from public, anon;
grant execute on function public.get_latest_inventory_purchase_unit_price(text)
  to authenticated;
