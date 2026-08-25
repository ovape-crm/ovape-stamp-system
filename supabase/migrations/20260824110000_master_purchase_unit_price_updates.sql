create or replace function public.require_inventory_purchase_unit_price()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.unit_price is not null and new.unit_price < 0 then
      raise exception 'PURCHASE_UNIT_PRICE_REQUIRED';
    end if;
    return new;
  end if;

  if new.unit_price is distinct from old.unit_price then
    if new.unit_price is null or new.unit_price < 0 then
      raise exception 'PURCHASE_UNIT_PRICE_REQUIRED';
    end if;
    if not exists (
      select 1
      from public.users
      where id = auth.uid() and oss_role = 'master'
    ) then
      raise exception 'MASTER_REQUIRED';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.require_inventory_purchase_receipt_unit_price()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.unit_price is null or new.unit_price < 0 then
    raise exception 'PURCHASE_UNIT_PRICE_REQUIRED';
  end if;
  return new;
end;
$$;

drop trigger if exists require_inventory_purchase_receipt_unit_price_trigger
  on public.inventory_purchase_receipt_lines;
create trigger require_inventory_purchase_receipt_unit_price_trigger
before insert or update of unit_price on public.inventory_purchase_receipt_lines
for each row execute function public.require_inventory_purchase_receipt_unit_price();

notify pgrst, 'reload schema';
