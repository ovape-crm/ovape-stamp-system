create or replace function public.set_purchase_arrival_quantity(
  p_line_id uuid,
  p_quantity integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;
  if p_quantity < 0 then
    raise exception '수량은 0개 이상이어야 합니다.';
  end if;

  update public.inventory_purchase_order_lines line
  set pending_quantity = p_quantity,
      quantity_checked_by = null,
      quantity_checked_at = null,
      quantity_check_note = null
  from public.inventory_purchase_orders purchase_order
  where line.id = p_line_id
    and purchase_order.id = line.order_id
    and purchase_order.status in ('pending', 'partial')
    and p_quantity <= line.ordered_quantity - line.received_quantity;

  if not found then
    raise exception '입고 수량은 주문 잔량을 초과할 수 없습니다.';
  end if;
end;
$$;

revoke all on function public.set_purchase_arrival_quantity(uuid, integer)
  from public, anon;
grant execute on function public.set_purchase_arrival_quantity(uuid, integer)
  to authenticated;

notify pgrst, 'reload schema';
