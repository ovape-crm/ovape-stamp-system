-- 확인된 A/S·교환입고 전표의 0원 단가를 실제 매입 단가로 보정하고,
-- 연결된 FIFO 원가층과 출고 원가 배정·입고 이동 단가를 같은 값으로 동기화한다.
with corrections(receipt_line_id, unit_price) as (
  values
    ('616449cf-6634-4824-b0c9-58dd012df33b'::uuid, 4400),
    ('b1ed3ba7-a701-41ab-8ed7-80c824d66c8d'::uuid, 4400),
    ('257c74ea-762c-4f7a-a723-4931af888a8c'::uuid, 3190),
    ('1b79b37b-356e-47d4-b118-d3c4cb7b61a6'::uuid, 44000),
    ('ada452d3-3bcb-488b-9d87-dcf9ef3fab91'::uuid, 44000)
)
update public.inventory_purchase_order_lines order_line
set unit_price = corrections.unit_price
from public.inventory_purchase_receipt_lines receipt_line
join corrections on corrections.receipt_line_id = receipt_line.id
where order_line.id = receipt_line.order_line_id;

with corrections(receipt_line_id, unit_price) as (
  values
    ('616449cf-6634-4824-b0c9-58dd012df33b'::uuid, 4400),
    ('b1ed3ba7-a701-41ab-8ed7-80c824d66c8d'::uuid, 4400),
    ('257c74ea-762c-4f7a-a723-4931af888a8c'::uuid, 3190),
    ('1b79b37b-356e-47d4-b118-d3c4cb7b61a6'::uuid, 44000),
    ('ada452d3-3bcb-488b-9d87-dcf9ef3fab91'::uuid, 44000)
)
update public.inventory_purchase_receipt_lines receipt_line
set unit_price = corrections.unit_price
from corrections
where receipt_line.id = corrections.receipt_line_id;

update public.inventory_cost_layers layer
set unit_cost = receipt_line.unit_price,
    cost_status = 'confirmed'
from public.inventory_cost_events event
join public.inventory_purchase_receipt_lines receipt_line
  on receipt_line.id::text = event.reference_line_key
where layer.source_event_id = event.id
  and event.reference_type = 'purchase_receipt'
  and receipt_line.id::text in (
    '616449cf-6634-4824-b0c9-58dd012df33b',
    'b1ed3ba7-a701-41ab-8ed7-80c824d66c8d',
    '257c74ea-762c-4f7a-a723-4931af888a8c',
    '1b79b37b-356e-47d4-b118-d3c4cb7b61a6',
    'ada452d3-3bcb-488b-9d87-dcf9ef3fab91'
  );

update public.inventory_cost_allocations allocation
set unit_cost = layer.unit_cost
from public.inventory_cost_layers layer
where allocation.source_layer_id = layer.id
  and layer.source_event_id in (
    select event.id
    from public.inventory_cost_events event
    where event.reference_line_key in (
      '616449cf-6634-4824-b0c9-58dd012df33b',
      'b1ed3ba7-a701-41ab-8ed7-80c824d66c8d',
      '257c74ea-762c-4f7a-a723-4931af888a8c',
      '1b79b37b-356e-47d4-b118-d3c4cb7b61a6',
      'ada452d3-3bcb-488b-9d87-dcf9ef3fab91'
    )
  );

update public.after_service_outbound_cost_allocations allocation
set unit_price = receipt_line.unit_price
from public.inventory_purchase_receipt_lines receipt_line
where allocation.source_receipt_line_id = receipt_line.id
  and receipt_line.id::text in (
    '616449cf-6634-4824-b0c9-58dd012df33b',
    'b1ed3ba7-a701-41ab-8ed7-80c824d66c8d',
    '257c74ea-762c-4f7a-a723-4931af888a8c',
    '1b79b37b-356e-47d4-b118-d3c4cb7b61a6',
    'ada452d3-3bcb-488b-9d87-dcf9ef3fab91'
  );

update public.inventory_cost_events outbound
set total_cost = totals.total_cost
from (
  select outbound_event_id, sum(quantity * unit_cost)::integer as total_cost
  from public.inventory_cost_allocations
  group by outbound_event_id
) totals
where outbound.id = totals.outbound_event_id;

update public.inventory_movements movement
set unit_price = receipt_line.unit_price
from public.inventory_purchase_receipt_lines receipt_line
where movement.reference_type = 'purchase_receipt'
  and movement.reference_id = receipt_line.receipt_id::text
  and btrim(movement.item_name) = btrim(receipt_line.item_name)
  and receipt_line.id::text in (
    '616449cf-6634-4824-b0c9-58dd012df33b',
    'b1ed3ba7-a701-41ab-8ed7-80c824d66c8d',
    '257c74ea-762c-4f7a-a723-4931af888a8c',
    '1b79b37b-356e-47d4-b118-d3c4cb7b61a6',
    'ada452d3-3bcb-488b-9d87-dcf9ef3fab91'
  );
