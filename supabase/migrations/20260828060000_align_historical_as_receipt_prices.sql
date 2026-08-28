-- 과거 A/S 교환입고 5개는 생성 당시 단가 0원이 기록된 레거시 데이터다.
-- 해당 라인만 전표·FIFO 원가를 동일한 실제 단가로 보정한다.
alter table public.inventory_purchase_order_lines disable trigger user;
alter table public.inventory_purchase_receipt_lines disable trigger user;

update public.inventory_purchase_order_lines set unit_price = 4400 where id = '3798f9bf-d288-4e9b-917e-bdecf105402d';
update public.inventory_purchase_order_lines set unit_price = 4400 where id = '2ff9f2d2-6e3c-476d-90c8-efc9212f3e70';
update public.inventory_purchase_order_lines set unit_price = 3190 where id = 'c392c700-fb0a-4cd2-8f6b-2d35c6998c6f';
update public.inventory_purchase_order_lines set unit_price = 44000 where id = '8d6abfe7-b3ce-456d-939e-c1a62946073c';
update public.inventory_purchase_order_lines set unit_price = 44000 where id = '9ea0689b-aea4-4382-ad5f-e7966b9293b5';

update public.inventory_purchase_receipt_lines set unit_price = 4400 where id = '616449cf-6634-4824-b0c9-58dd012df33b';
update public.inventory_purchase_receipt_lines set unit_price = 4400 where id = 'b1ed3ba7-a701-41ab-8ed7-80c824d66c8d';
update public.inventory_purchase_receipt_lines set unit_price = 3190 where id = '257c74ea-762c-4f7a-a723-4931af888a8c';
update public.inventory_purchase_receipt_lines set unit_price = 44000 where id = '1b79b37b-356e-47d4-b118-d3c4cb7b61a6';
update public.inventory_purchase_receipt_lines set unit_price = 44000 where id = 'ada452d3-3bcb-488b-9d87-dcf9ef3fab91';

alter table public.inventory_purchase_receipt_lines enable trigger user;
alter table public.inventory_purchase_order_lines enable trigger user;
