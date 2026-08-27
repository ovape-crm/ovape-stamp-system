-- 부분 시연용 수량 기능을 제거한다. 시연용 행은 주문 수량 전체를 처리한다.
create or replace function public.enforce_full_demo_purchase_quantity()
returns trigger language plpgsql set search_path=public as $$
begin
  new.demo_quantity := case
    when new.handling_type = 'demo' then new.ordered_quantity
    else 0
  end;
  return new;
end $$;

drop trigger if exists enforce_full_demo_purchase_quantity_trigger
  on public.inventory_purchase_order_lines;
create trigger enforce_full_demo_purchase_quantity_trigger
before insert or update of ordered_quantity, handling_type, demo_quantity
on public.inventory_purchase_order_lines
for each row execute function public.enforce_full_demo_purchase_quantity();

update public.inventory_purchase_order_lines
set demo_quantity = case
  when handling_type = 'demo' then ordered_quantity
  else 0
end;

-- 같은 제품을 일반 입고와 시연용 처리 행으로 각각 등록할 수 있게 한다.
alter table public.inventory_purchase_order_lines
  drop constraint if exists inventory_purchase_order_lines_order_id_item_name_key;

notify pgrst, 'reload schema';
