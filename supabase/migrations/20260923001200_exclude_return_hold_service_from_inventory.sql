-- 반품 보관품은 고객 반품 시점부터 판매 가능 재고와 분리되어 있다.
-- 손님 서비스 이력에 품목을 표시하더라도 일반 출고·원가 처리 대상이 아니다.
create or replace function public.outbound_inventory_effects(p_items jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select coalesce(jsonb_object_agg(item_name, quantity_delta), '{}'::jsonb)
  from (
    select
      btrim(item->>'itemName') as item_name,
      sum(
        case coalesce(item->>'inventoryAction', 'out')
          when 'exchange_in' then 1
          when 'adjustment_in' then 1
          else -1
        end * greatest(coalesce(nullif(item->>'quantity', '')::integer, 0), 0)
      )::integer as quantity_delta
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) item
    where nullif(btrim(item->>'itemName'), '') is not null
      and coalesce(item->>'source', '') <> 'defective_hold'
    group by btrim(item->>'itemName')
  ) grouped
  where quantity_delta <> 0;
$$;

create or replace function public.sync_standard_outbound_cost_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  i jsonb;
  n integer := 0;
  v_name text;
  v_qty integer;
  v_action text;
  v_remark text;
  v_type text;
  v_effect text;
  v_available integer;
  v_missing integer;
begin
  if new.category <> 'stamp' then return new; end if;

  for i in select value from jsonb_array_elements(coalesce(new.jsonb->'items', '[]')) loop
    n := n + 1;
    if coalesce(i->>'source', '') = 'defective_hold' then continue; end if;

    v_name := btrim(coalesce(i->>'itemName', ''));
    v_qty := coalesce(nullif(i->>'quantity', '')::integer, 0);
    v_action := btrim(coalesce(i->>'inventoryAction', ''));
    v_remark := btrim(coalesce(i->>'remark', ''));
    if v_name = '' or v_qty <= 0 or not public.is_inventory_item_tracked(v_name) then continue; end if;
    if v_action in ('exchange_in', 'exchange_out') then continue; end if;
    if exists(select 1 from public.inventory_service_cost_links where log_id = new.id and line_index = n)
      or exists(select 1 from public.inventory_service_manual_costs where log_id = new.id and line_index = n) then continue; end if;

    if v_action = 'adjustment_in' then
      perform public.create_inventory_cost_layer(
        'adjustment_in', new.created_at, null, v_name, v_qty, null, 'pending', 'front',
        'stamp_log', new.id::text, n::text, null,
        jsonb_build_object('customerId', new.customer_id, 'memo', v_remark)
      );
      continue;
    end if;

    if v_action = 'adjustment_out' then
      v_type := 'adjustment_out'; v_effect := 'none';
    elsif v_action = 'as_exchange_out' then
      v_type := 'after_service_out'; v_effect := 'after_service_pending';
    elsif v_action in ('', 'out') and v_remark ~ '^시연용($|[,\s(])' then
      v_type := 'demo_out'; v_effect := 'demo_expense';
    elsif v_action in ('', 'out') and v_remark ~ '^서비스($|[,\s(])' then
      v_type := 'service_out'; v_effect := 'none';
    elsif v_action in ('', 'out') and v_remark !~ '^(교환입고|교환출고|A/S 교환출고|재고조정-(입고|출고))($|[,\s(])' then
      v_type := 'sale_out'; v_effect := 'sale_cogs';
    else
      continue;
    end if;

    perform pg_advisory_xact_lock(hashtextextended(v_name, 0));
    if not exists(
      select 1 from public.inventory_cost_events
      where reference_type = 'stamp_log'
        and reference_id = new.id::text
        and reference_line_key = n::text
        and event_type = v_type
    ) then
      select coalesce(sum(layer.remaining_quantity), 0)
      into v_available
      from public.inventory_cost_layers layer
      join public.inventory_cost_events event on event.id = layer.source_event_id
      where layer.item_name = v_name
        and layer.remaining_quantity > 0
        and event.event_at <= new.created_at;
      v_missing := greatest(0, v_qty - v_available);
      if v_missing > 0 then
        perform public.create_inventory_cost_layer(
          'opening', new.created_at - interval '1 microsecond', null, v_name,
          v_missing, null, 'pending', 'back', 'cost_missing', new.id::text,
          n::text, null, jsonb_build_object('reason', 'live cost missing')
        );
      end if;
    end if;

    perform public.allocate_inventory_cost_fifo(
      v_type, new.created_at, null, v_name, v_qty, 'stamp_log', new.id::text,
      n::text, v_effect,
      jsonb_strip_nulls(jsonb_build_object(
        'customerId', new.customer_id,
        'memo', v_remark,
        'afterServiceId', coalesce(new.jsonb->>'afterServiceId', new.after_service_id::text)
      ))
    );
  end loop;
  return new;
end;
$$;

-- 기존 반품 보관 손님 서비스 로그가 일반 출고로 잘못 반영한 재고·원가 기록을 원복한다.
do $$
declare
  v_log_id bigint;
begin
  for v_log_id in
    select service_log_id
    from public.defective_inventory_holds
    where service_log_id is not null
  loop
    with movement_totals as (
      select item_name, sum(quantity_delta)::integer as quantity_delta
      from public.inventory_movements
      where reference_type = 'outbound_log'
        and reference_id = v_log_id::text
      group by item_name
    )
    update public.inventory_balances balance
    set quantity = balance.quantity - movement_totals.quantity_delta,
        updated_at = now()
    from movement_totals
    where balance.item_name = movement_totals.item_name;

    delete from public.inventory_movements
    where reference_type = 'outbound_log'
      and reference_id = v_log_id::text;

    delete from public.inventory_outbound_log_states
    where log_id = v_log_id::text;

    -- 출고 이벤트와 그 출고가 참조한 임시 원가층의 연결을 먼저 해제한다.
    -- 이후 임시 원가층의 사용 수량을 되돌려 보호 트리거를 통과시킨다.
    delete from public.inventory_cost_allocations allocation
    where allocation.outbound_event_id in (
        select id
        from public.inventory_cost_events
        where reference_id = v_log_id::text
          and reference_type = 'stamp_log'
      )
      or allocation.source_layer_id in (
        select layer.id
        from public.inventory_cost_layers layer
        join public.inventory_cost_events event on event.id = layer.source_event_id
        where event.reference_id = v_log_id::text
          and event.reference_type = 'cost_missing'
      );

    update public.inventory_cost_layers layer
    set remaining_quantity = layer.original_quantity
    from public.inventory_cost_events event
    where event.id = layer.source_event_id
      and event.reference_id = v_log_id::text
      and event.reference_type = 'cost_missing';

    delete from public.inventory_cost_events
    where reference_id = v_log_id::text
      and reference_type in ('stamp_log', 'cost_missing');
  end loop;
end;
$$;
