create or replace function public.require_inventory_purchase_unit_price()
returns trigger
language plpgsql
as $$
begin
  if new.unit_price is null or new.unit_price < 0 then
    raise exception 'PURCHASE_UNIT_PRICE_REQUIRED';
  end if;
  return new;
end;
$$;

drop trigger if exists require_inventory_purchase_unit_price_trigger
  on public.inventory_purchase_order_lines;
create trigger require_inventory_purchase_unit_price_trigger
before insert or update on public.inventory_purchase_order_lines
for each row execute function public.require_inventory_purchase_unit_price();

create or replace function public.sync_inventory_purchase_unit_price()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.unit_price is not distinct from old.unit_price then
    return new;
  end if;

  update public.inventory_purchase_receipt_lines
  set unit_price = new.unit_price
  where order_line_id = new.id;

  update public.inventory_movements movement
  set unit_price = new.unit_price
  from public.inventory_purchase_receipt_lines receipt_line
  where receipt_line.order_line_id = new.id
    and movement.reference_type = 'purchase_receipt'
    and movement.reference_id = receipt_line.receipt_id::text
    and movement.item_name = receipt_line.item_name
    and movement.movement_type = 'purchase_in';

  return new;
end;
$$;

drop trigger if exists sync_inventory_purchase_unit_price_trigger
  on public.inventory_purchase_order_lines;
create trigger sync_inventory_purchase_unit_price_trigger
after update of unit_price on public.inventory_purchase_order_lines
for each row execute function public.sync_inventory_purchase_unit_price();
