-- 품목 마스터의 매입단가는 사용하지 않는다.
-- 입고 건별 단가(inventory purchase unit_price)는 그대로 보존한다.
update public.items
set purchase_price = null
where purchase_price is not null;

create or replace function public.clear_item_purchase_price()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.purchase_price := null;
  return new;
end;
$$;

drop trigger if exists clear_item_purchase_price_on_write on public.items;
create trigger clear_item_purchase_price_on_write
before insert or update of purchase_price on public.items
for each row execute function public.clear_item_purchase_price();

comment on column public.items.purchase_price is
  '사용 중단: 매입단가는 입고 건별 unit_price로 관리한다.';
