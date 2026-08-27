-- 이미 확인한 수량 체크를 다시 실행하면 확인 상태를 취소한다.
create or replace function public.check_purchase_arrival_quantity(
  p_line_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_difference integer;
  v_checked_at timestamptz;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;

  select
    line.quantity_checked_at,
    line.pending_quantity - greatest(0, line.ordered_quantity - line.received_quantity)
  into v_checked_at, v_difference
  from public.inventory_purchase_order_lines line
  join public.inventory_purchase_orders purchase_order
    on purchase_order.id = line.order_id
  where line.id = p_line_id
    and purchase_order.status in ('pending', 'partial')
  for update of line;

  if not found then
    raise exception '수량을 확인할 수 없는 입고 예정 품목입니다.';
  end if;

  if v_checked_at is not null then
    update public.inventory_purchase_order_lines
    set quantity_checked_by = null,
        quantity_checked_at = null,
        quantity_check_note = null
    where id = p_line_id;
    return;
  end if;

  update public.inventory_purchase_order_lines
  set quantity_checked_by = auth.uid(),
      quantity_checked_at = now(),
      quantity_check_note = case
        when v_difference > 0 then format('%s개 추가 입고', v_difference)
        when v_difference < 0 then format('%s개 미입고', abs(v_difference))
        else null
      end
  where id = p_line_id;
end;
$$;

revoke all on function public.check_purchase_arrival_quantity(uuid)
  from public, anon;
grant execute on function public.check_purchase_arrival_quantity(uuid)
  to authenticated;
