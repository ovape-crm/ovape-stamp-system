-- 재고조정 입고분은 일반 FIFO 재고보다 먼저 출고한다.
-- 2026-08-26(한국시간) 이후 생성된 기존 원가층도 동일한 우선순위로 보정한다.

create or replace function public.sync_standard_outbound_cost_ledger()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_item jsonb; v_index integer := 0; v_name text; v_quantity integer; v_action text; v_remark text;
  v_event_type text; v_effect text; v_available integer; v_missing integer;
begin
  if new.category <> 'stamp' then return new; end if;
  for v_item in select value from jsonb_array_elements(coalesce(new.jsonb->'items', '[]'::jsonb)) loop
    v_index := v_index + 1; v_name := btrim(coalesce(v_item->>'itemName',''));
    v_quantity := coalesce(nullif(v_item->>'quantity','')::integer,0);
    v_action := btrim(coalesce(v_item->>'inventoryAction','')); v_remark := btrim(coalesce(v_item->>'remark',''));
    if v_name = '' or v_quantity <= 0 or not public.is_inventory_item_tracked(v_name) then continue; end if;
    if v_action in ('exchange_in','exchange_out') then continue; end if;
    if v_action = 'adjustment_in' then
      perform public.create_inventory_cost_layer('adjustment_in',new.created_at,null,v_name,v_quantity,null,'pending','front',
        'stamp_log',new.id::text,v_index::text,null,jsonb_build_object('customerId',new.customer_id,'memo',v_remark));
      continue;
    end if;
    if v_action = 'adjustment_out' then v_event_type := 'adjustment_out'; v_effect := 'none';
    elsif v_action = 'as_exchange_out' then v_event_type := 'after_service_out'; v_effect := 'after_service_pending';
    elsif v_action in ('','out') and v_remark !~ '^(서비스|시연용|교환입고|교환출고|A/S 교환출고|재고조정-(입고|출고))($|[,\s(])'
      then v_event_type := 'sale_out'; v_effect := 'sale_cogs';
    else continue; end if;
    select coalesce(sum(remaining_quantity),0)::integer into v_available from public.inventory_cost_layers
      where item_name=v_name and remaining_quantity>0;
    v_missing := greatest(0,v_quantity-v_available);
    if v_missing>0 then perform public.create_inventory_cost_layer('opening',new.created_at-interval '1 microsecond',null,v_name,
      v_missing,null,'pending','back','cost_missing',new.id::text,v_index::text,null,jsonb_build_object('reason','live cost missing')); end if;
    perform public.allocate_inventory_cost_fifo(v_event_type,new.created_at,null,v_name,v_quantity,'stamp_log',new.id::text,
      v_index::text,v_effect,jsonb_build_object('customerId',new.customer_id,'memo',v_remark));
  end loop; return new;
end $$;

revoke all on function public.sync_standard_outbound_cost_ledger() from public,anon,authenticated;

-- 기존 재고조정 입고층을 품목별 FIFO 맨 앞으로 옮긴다.
-- 과거 출고 배정은 유지하고, 남아 있는 수량의 다음 출고 순서부터 반영된다.
with adjustment_layers as (
  select
    layer.id,
    layer.item_name,
    row_number() over (
      partition by layer.item_name
      order by event.event_at, event.created_at, layer.id
    ) as adjustment_order
  from public.inventory_cost_layers layer
  join public.inventory_cost_events event on event.id = layer.source_event_id
  where event.event_type = 'adjustment_in'
    and event.event_at >= timestamptz '2026-08-26 00:00:00+09'
), queue_floor as (
  select item_name, min(queue_sequence) as minimum_sequence
  from public.inventory_cost_layers
  group by item_name
)
update public.inventory_cost_layers layer
set queue_sequence = floor.minimum_sequence - adjustment.adjustment_order
from adjustment_layers adjustment
join queue_floor floor on floor.item_name = adjustment.item_name
where layer.id = adjustment.id;
