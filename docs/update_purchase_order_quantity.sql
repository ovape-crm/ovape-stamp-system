-- 입고 대기 주문의 주문 수량 수정 기능
-- 운영 DB의 Supabase SQL Editor에서 1회 실행해야 합니다.

create table if not exists public.inventory_purchase_order_quantity_changes (
  id uuid primary key default gen_random_uuid(),
  order_line_id uuid not null
    references public.inventory_purchase_order_lines(id) on delete cascade,
  previous_quantity integer not null,
  new_quantity integer not null,
  changed_by uuid not null references auth.users(id),
  changed_at timestamptz not null default now()
);

alter table public.inventory_purchase_order_quantity_changes
  enable row level security;

drop policy if exists "authenticated read purchase order quantity changes"
  on public.inventory_purchase_order_quantity_changes;
create policy "authenticated read purchase order quantity changes"
  on public.inventory_purchase_order_quantity_changes
  for select to authenticated
  using (true);

grant select on public.inventory_purchase_order_quantity_changes
  to authenticated;
revoke all on public.inventory_purchase_order_quantity_changes from anon;

create or replace function public.update_purchase_order_quantity(
  p_line_id uuid,
  p_quantity integer
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  target_line public.inventory_purchase_order_lines%rowtype;
begin
  if not public.is_inventory_admin() then
    raise exception '관리자만 주문 수량을 변경할 수 있습니다.';
  end if;

  if p_quantity is null or p_quantity < 1 then
    raise exception '주문 수량은 1개 이상이어야 합니다.';
  end if;

  select l.*
    into target_line
  from public.inventory_purchase_order_lines l
  join public.inventory_purchase_orders o on o.id=l.order_id
  where l.id=p_line_id
    and o.status='pending'
    and l.received_quantity=0
  for update of l;

  if not found then
    raise exception '입고 대기 상태의 미입고 품목만 수정할 수 있습니다.';
  end if;

  if target_line.ordered_quantity=p_quantity then
    return;
  end if;

  insert into public.inventory_purchase_order_quantity_changes(
    order_line_id,
    previous_quantity,
    new_quantity,
    changed_by
  )
  values(
    p_line_id,
    target_line.ordered_quantity,
    p_quantity,
    auth.uid()
  );

  update public.inventory_purchase_order_lines
  set ordered_quantity=p_quantity,
      pending_quantity=p_quantity,
      quantity_checked_by=null,
      quantity_checked_at=null,
      quantity_check_note=null
  where id=p_line_id;

  update public.inventory_purchase_orders
  set updated_at=now()
  where id=target_line.order_id;
end;
$$;

revoke all on function public.update_purchase_order_quantity(uuid,integer)
  from public,anon;
grant execute on function public.update_purchase_order_quantity(uuid,integer)
  to authenticated;

-- 입고 수량이 0개인 경우에도 'N개 미입고 체크'를 완료할 수 있게 합니다.
create or replace function public.check_purchase_arrival_quantity(
  p_line_id uuid
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  difference integer;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select l.pending_quantity
         - greatest(0, l.ordered_quantity-l.received_quantity)
    into difference
  from public.inventory_purchase_order_lines l
  join public.inventory_purchase_orders o on o.id=l.order_id
  where l.id=p_line_id
    and o.status in ('pending','partial');

  if not found then
    raise exception '수량을 확인할 수 없는 입고 예정 품목입니다.';
  end if;

  update public.inventory_purchase_order_lines
  set quantity_checked_by=auth.uid(),
      quantity_checked_at=now(),
      quantity_check_note=case
        when difference > 0 then format('%s개 추가 입고',difference)
        when difference < 0 then format('%s개 미입고',abs(difference))
        else null
      end
  where id=p_line_id;
end;
$$;

revoke all on function public.check_purchase_arrival_quantity(uuid)
  from public,anon;
grant execute on function public.check_purchase_arrival_quantity(uuid)
  to authenticated;

-- 새 입고 예정 등록 시 입고 수량의 기본값을 주문 수량과 같게 설정합니다.
create or replace function public.create_inventory_purchase_order(
  p_supplier_id uuid,
  p_ordered_on date,
  p_note text,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  order_id uuid;
  entry jsonb;
  clean_name text;
  qty integer;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if not exists(
    select 1
    from public.inventory_suppliers
    where id=p_supplier_id and is_use=true
  ) then
    raise exception '사용 가능한 거래처를 선택해 주세요.';
  end if;

  if jsonb_array_length(coalesce(p_lines,'[]'::jsonb))=0 then
    raise exception '품목을 추가해 주세요.';
  end if;

  insert into public.inventory_purchase_orders(
    supplier_id,
    ordered_on,
    note,
    created_by
  )
  values(
    p_supplier_id,
    p_ordered_on,
    nullif(btrim(p_note),''),
    auth.uid()
  )
  returning id into order_id;

  for entry in select value from jsonb_array_elements(p_lines) loop
    clean_name:=btrim(entry->>'item_name');
    qty:=(entry->>'quantity')::integer;

    if clean_name='' or qty<=0 then
      raise exception '품목과 주문 수량을 확인해 주세요.';
    end if;

    insert into public.inventory_purchase_order_lines(
      order_id,
      item_name,
      ordered_quantity,
      pending_quantity,
      unit_price,
      note
    )
    values(
      order_id,
      clean_name,
      qty,
      qty,
      nullif(entry->>'unit_price','')::integer,
      nullif(btrim(entry->>'note'),'')
    );
  end loop;

  return order_id;
end;
$$;

revoke all on function public.create_inventory_purchase_order(
  uuid,date,text,jsonb
) from public,anon;
grant execute on function public.create_inventory_purchase_order(
  uuid,date,text,jsonb
) to authenticated;

notify pgrst,'reload schema';
