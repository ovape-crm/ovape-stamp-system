-- Preserve the product entry order within each purchase order.
alter table public.inventory_purchase_order_lines
  add column if not exists sort_order integer not null default 0;

with ranked_lines as (
  select id, row_number() over (partition by order_id order by ctid) as sort_order
  from public.inventory_purchase_order_lines
)
update public.inventory_purchase_order_lines line
set sort_order = ranked_lines.sort_order
from ranked_lines
where line.id = ranked_lines.id
  and line.sort_order = 0;

create or replace function public.assign_purchase_order_line_sort_order()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.sort_order <= 0 then
    select coalesce(max(sort_order), 0) + 1
      into new.sort_order
      from public.inventory_purchase_order_lines
     where order_id = new.order_id;
  end if;
  return new;
end;
$$;

drop trigger if exists assign_purchase_order_line_sort_order_trigger
  on public.inventory_purchase_order_lines;
create trigger assign_purchase_order_line_sort_order_trigger
before insert on public.inventory_purchase_order_lines
for each row execute function public.assign_purchase_order_line_sort_order();

create or replace function public.update_inventory_purchase_order_details(
  p_order_id uuid, p_supplier_id uuid, p_ordered_on date, p_note text,
  p_lines jsonb, p_receipts jsonb
) returns void
language plpgsql security definer set search_path=public as $$
declare
  v_line jsonb; v_line_position bigint;
  v_existing public.inventory_purchase_order_lines%rowtype;
  v_receipt jsonb; v_order_status text;
begin
  if not exists (select 1 from public.users where id = auth.uid() and oss_role = 'admin') then raise exception 'ADMIN_REQUIRED'; end if;
  if not exists (select 1 from public.inventory_suppliers where id = p_supplier_id) then raise exception 'SUPPLIER_NOT_FOUND'; end if;
  select status into v_order_status from public.inventory_purchase_orders where id = p_order_id for update;
  if not found then raise exception 'PURCHASE_ORDER_NOT_FOUND'; end if;
  update public.inventory_purchase_orders set supplier_id=p_supplier_id, ordered_on=p_ordered_on, note=nullif(btrim(coalesce(p_note,'')),''), updated_at=now() where id=p_order_id;
  if exists (select 1 from public.inventory_purchase_order_lines existing_line where existing_line.order_id=p_order_id and existing_line.received_quantity>0 and not exists (select 1 from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) item where nullif(item->>'id','')::uuid=existing_line.id)) then raise exception 'RECEIVED_PURCHASE_ORDER_LINE_DELETE_FORBIDDEN'; end if;
  delete from public.inventory_purchase_order_lines existing_line where existing_line.order_id=p_order_id and existing_line.received_quantity=0 and not exists (select 1 from public.inventory_purchase_receipt_lines receipt_line where receipt_line.order_line_id=existing_line.id) and not exists (select 1 from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) item where nullif(item->>'id','')::uuid=existing_line.id);
  for v_line, v_line_position in select value, ordinality from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) with ordinality loop
    if nullif(v_line->>'id','') is null then
      insert into public.inventory_purchase_order_lines(order_id,sort_order,item_name,ordered_quantity,pending_quantity,unit_price,note,handling_type,handling_note,customer_id,reservation_log_id)
      values(p_order_id,v_line_position,btrim(v_line->>'item_name'),(v_line->>'ordered_quantity')::integer,(v_line->>'ordered_quantity')::integer,nullif(v_line->>'unit_price','')::integer,nullif(btrim(coalesce(v_line->>'note','')),''),coalesce(nullif(v_line->>'handling_type',''),'none'),nullif(btrim(coalesce(v_line->>'handling_note','')),''),nullif(v_line->>'customer_id','')::bigint,nullif(v_line->>'reservation_log_id',''));
      continue;
    end if;
    select * into v_existing from public.inventory_purchase_order_lines where id=(v_line->>'id')::uuid and order_id=p_order_id for update;
    if not found then raise exception 'PURCHASE_ORDER_LINE_NOT_FOUND'; end if;
    if coalesce((v_line->>'ordered_quantity')::integer,0)<greatest(1,v_existing.received_quantity) then raise exception 'ORDERED_QUANTITY_BELOW_RECEIVED'; end if;
    update public.inventory_purchase_order_lines set sort_order=v_line_position, item_name=btrim(v_line->>'item_name'), ordered_quantity=(v_line->>'ordered_quantity')::integer, pending_quantity=greatest((v_line->>'ordered_quantity')::integer-received_quantity,0), unit_price=nullif(v_line->>'unit_price','')::integer, note=nullif(btrim(coalesce(v_line->>'note','')),''), handling_type=coalesce(nullif(v_line->>'handling_type',''),v_existing.handling_type,'none'), handling_note=nullif(btrim(coalesce(v_line->>'handling_note','')),''), customer_id=nullif(v_line->>'customer_id','')::bigint, reservation_log_id=nullif(v_line->>'reservation_log_id','') where id=v_existing.id;
  end loop;
  for v_receipt in select value from jsonb_array_elements(coalesce(p_receipts,'[]'::jsonb)) loop
    update public.inventory_purchase_receipts set arrived_on=(v_receipt->>'arrived_on')::date, note=nullif(btrim(coalesce(v_receipt->>'note','')),'') where id=(v_receipt->>'id')::uuid and order_id=p_order_id and reversed_at is null;
  end loop;
  if v_order_status not in ('closed','cancelled') then
    update public.inventory_purchase_orders set status=case when not exists(select 1 from public.inventory_purchase_order_lines where order_id=p_order_id and received_quantity<ordered_quantity) then 'completed' when exists(select 1 from public.inventory_purchase_order_lines where order_id=p_order_id and received_quantity>0) then 'partial' else 'pending' end, updated_at=now() where id=p_order_id;
  end if;
end;
$$;
