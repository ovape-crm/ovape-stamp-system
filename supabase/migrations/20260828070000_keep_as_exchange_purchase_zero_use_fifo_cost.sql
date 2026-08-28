-- A/S·교환입고는 매입 전표 금액을 만들지 않는다.
-- 입고 전표·입고 이동은 0원으로 유지하고, FIFO 원가층만 실제 원가를 가진다.
alter table public.inventory_purchase_order_lines disable trigger user;
alter table public.inventory_purchase_receipt_lines disable trigger user;

update public.inventory_purchase_order_lines set unit_price = 0 where id in (
  '3798f9bf-d288-4e9b-917e-bdecf105402d',
  '2ff9f2d2-6e3c-476d-90c8-efc9212f3e70',
  'c392c700-fb0a-4cd2-8f6b-2d35c6998c6f',
  '8d6abfe7-b3ce-456d-939e-c1a62946073c',
  '9ea0689b-aea4-4382-ad5f-e7966b9293b5'
);
update public.inventory_purchase_receipt_lines set unit_price = 0 where id in (
  '616449cf-6634-4824-b0c9-58dd012df33b',
  'b1ed3ba7-a701-41ab-8ed7-80c824d66c8d',
  '257c74ea-762c-4f7a-a723-4931af888a8c',
  '1b79b37b-356e-47d4-b118-d3c4cb7b61a6',
  'ada452d3-3bcb-488b-9d87-dcf9ef3fab91'
);
alter table public.inventory_purchase_receipt_lines enable trigger user;
alter table public.inventory_purchase_order_lines enable trigger user;

update public.inventory_movements set unit_price = 0
where reference_type = 'purchase_receipt' and reference_id in (
  '5678155e-ac84-49eb-a811-95cc394f0dc7',
  '956630a7-9efd-4b24-84ac-ab5b1e2e8645',
  '5cb61b1e-ab9b-481f-bac2-b832e35e7516'
) and item_name in (
  '붐 쿨리오 라임 30ml', '붐 쿨리오 자몽 30ml', '에비앙 사하라 30ml',
  '베놈 아스트로 MK3 블랙', '베놈 아스트로 MK3 실버'
);

update public.inventory_cost_layers set unit_cost = 4400 where id = 'b5a99cca-e233-4fe6-bd94-7013d670ae31';
update public.inventory_cost_layers set unit_cost = 4400 where id = 'b530c010-311f-4fc7-98fa-76e4c7198806';
update public.inventory_cost_layers set unit_cost = 3190 where id = 'd283c38a-88fe-42c5-bd32-eeb6578d0631';
update public.inventory_cost_layers set unit_cost = 44000 where id = '2139c2fb-83c4-4a1e-a7f7-4431ca8c4eee';
update public.inventory_cost_layers set unit_cost = 44000 where id = 'ea1fd2ae-95fc-4666-8829-f58683bc35f8';
