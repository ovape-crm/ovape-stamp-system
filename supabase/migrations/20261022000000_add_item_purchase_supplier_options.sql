-- 업체 불량교환 A/S에서 선택한 품목의 실제 입고 도매처를 조회한다.
-- FIFO 잔여 수량이나 도매처 사용 여부와 무관하게, 취소되지 않은 입고 이력 전체를 기준으로 한다.
create or replace function public.get_item_purchase_supplier_options(p_item_name text)
returns table(id uuid, name text)
language sql stable security definer set search_path = public
as $$
  select distinct supplier.id, supplier.name
  from public.inventory_purchase_receipt_lines receipt_line
  join public.inventory_purchase_receipts receipt
    on receipt.id = receipt_line.receipt_id and receipt.reversed_at is null
  join public.inventory_purchase_orders purchase_order on purchase_order.id = receipt.order_id
  join public.inventory_suppliers supplier on supplier.id = purchase_order.supplier_id
  where exists (
    select 1 from public.users
    where id = auth.uid() and oss_role = 'master'
  )
    and btrim(receipt_line.item_name) = btrim(p_item_name)
  order by supplier.name;
$$;

revoke all on function public.get_item_purchase_supplier_options(text) from public, anon;
grant execute on function public.get_item_purchase_supplier_options(text) to authenticated;
notify pgrst, 'reload schema';
