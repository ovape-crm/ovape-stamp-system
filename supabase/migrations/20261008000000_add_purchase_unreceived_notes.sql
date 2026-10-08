alter table public.inventory_purchase_order_lines
  add column if not exists unreceived_note text;

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
    and purchase_order.status in ('pending', 'partial');

  if not found then
    raise exception '수정할 수 없는 입고 예정 품목입니다.';
  end if;
end;
$$;

create or replace function public.save_purchase_unreceived_note(
  p_line_id uuid,
  p_note text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid() and oss_role = 'master'
  ) then
    raise exception 'MASTER_REQUIRED';
  end if;

  update public.inventory_purchase_order_lines line
  set unreceived_note = nullif(btrim(coalesce(p_note, '')), '')
  from public.inventory_purchase_orders purchase_order
  where line.id = p_line_id
    and purchase_order.id = line.order_id
    and purchase_order.status = 'partial'
    and line.received_quantity < line.ordered_quantity;

  if not found then
    raise exception '미입고 메모를 저장할 수 없는 품목입니다.';
  end if;
end;
$$;

revoke all on function public.save_purchase_unreceived_note(uuid, text)
  from public, anon;
revoke all on function public.set_purchase_arrival_quantity(uuid, integer)
  from public, anon;
grant execute on function public.save_purchase_unreceived_note(uuid, text)
  to authenticated;
grant execute on function public.set_purchase_arrival_quantity(uuid, integer)
  to authenticated;

notify pgrst, 'reload schema';
