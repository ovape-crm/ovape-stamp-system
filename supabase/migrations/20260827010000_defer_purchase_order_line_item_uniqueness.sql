-- 입고 예정 수정 시 품목명을 순차적으로 바꾸는 중간 상태가 아니라
-- 트랜잭션의 최종 상태를 기준으로 주문 내 품목 중복을 검사한다.
alter table public.inventory_purchase_order_lines
  drop constraint if exists inventory_purchase_order_lines_order_id_item_name_key;

alter table public.inventory_purchase_order_lines
  add constraint inventory_purchase_order_lines_order_id_item_name_key
  unique (order_id, item_name)
  deferrable initially deferred;
