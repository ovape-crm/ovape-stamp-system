-- 명시한 과거 A/S·교환입고 라인의 실제 단가 보정.
update public.inventory_purchase_order_lines set unit_price = 4400 where id = '3798f9bf-d288-4e9b-917e-bdecf105402d';
update public.inventory_purchase_order_lines set unit_price = 4400 where id = '2ff9f2d2-6e3c-476d-90c8-efc9212f3e70';
update public.inventory_purchase_order_lines set unit_price = 3190 where id = 'c392c700-fb0a-4cd2-8f6b-2d35c6998c6f';
update public.inventory_purchase_order_lines set unit_price = 44000 where id = '8d6abfe7-b3ce-456d-939e-c1a62946073c';
update public.inventory_purchase_order_lines set unit_price = 44000 where id = '9ea0689b-aea4-4382-ad5f-e7966b9293b5';

-- 과거 이벤트·배정 테이블은 전표 단가와 반드시 동일하게 유지한다.
update public.inventory_cost_layers set unit_cost = 4400 where id = 'b5a99cca-e233-4fe6-bd94-7013d670ae31';
update public.inventory_cost_layers set unit_cost = 4400 where id = 'b530c010-311f-4fc7-98fa-76e4c7198806';
update public.inventory_cost_layers set unit_cost = 3190 where id = 'd283c38a-88fe-42c5-bd32-eeb6578d0631';
update public.inventory_cost_layers set unit_cost = 44000 where id = '2139c2fb-83c4-4a1e-a7f7-4431ca8c4eee';
update public.inventory_cost_layers set unit_cost = 44000 where id = 'ea1fd2ae-95fc-4666-8829-f58683bc35f8';

update public.inventory_cost_allocations allocation
set unit_cost = layer.unit_cost
from public.inventory_cost_layers layer
where allocation.source_layer_id = layer.id
  and layer.id in (
    'b5a99cca-e233-4fe6-bd94-7013d670ae31',
    'b530c010-311f-4fc7-98fa-76e4c7198806',
    'd283c38a-88fe-42c5-bd32-eeb6578d0631',
    '2139c2fb-83c4-4a1e-a7f7-4431ca8c4eee',
    'ea1fd2ae-95fc-4666-8829-f58683bc35f8'
  );

update public.inventory_cost_events outbound
set total_cost = totals.total_cost
from (select outbound_event_id, sum(quantity * unit_cost)::integer as total_cost from public.inventory_cost_allocations group by outbound_event_id) totals
where outbound.id = totals.outbound_event_id;
