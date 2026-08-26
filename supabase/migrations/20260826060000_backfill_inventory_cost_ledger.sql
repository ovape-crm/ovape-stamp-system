do $$
declare
  v_actor uuid;
  v_basis record;
  v_log record;
  v_item jsonb;
  v_name text;
  v_quantity integer;
  v_item_id bigint;
  v_action text;
  v_remark text;
  v_available integer;
  v_missing integer;
  v_event_type text;
  v_effect text;
  v_position text;
  v_index integer;
begin
  if exists (select 1 from public.inventory_cost_events limit 1) then
    return;
  end if;

  select id into v_actor
  from public.users
  where oss_role = 'master'
  order by created_at
  limit 1;
  if v_actor is null then raise exception 'MASTER_REQUIRED_FOR_COST_BACKFILL'; end if;
  perform set_config('request.jwt.claim.sub', v_actor::text, true);

  -- 6/1~7/21 판매분 원가는 기존에 입력한 구간 순서대로 FIFO 원가층을 만듭니다.
  for v_basis in
    select basis.*, row_number() over (
      partition by basis.item_name order by basis.sort_order, basis.id
    ) as segment_index
    from public.settlement_item_cost_bases basis
    where basis.basis_type = 'historical'
    order by basis.item_name, basis.sort_order, basis.id
  loop
    perform public.create_inventory_cost_layer(
      'opening', '2026-06-01 00:00:00+09',
      case when exists (select 1 from public.items where id = v_basis.item_id)
        then v_basis.item_id else null end,
      v_basis.item_name, v_basis.quantity, v_basis.unit_cost, 'confirmed', 'back',
      'settlement_cost_basis', v_basis.item_name,
      'historical:' || v_basis.segment_index::text, null,
      jsonb_build_object('basisType', 'historical')
    );
  end loop;

  -- 기존 판매 및 특수 출고를 시간순으로 재생합니다.
  for v_log in
    select id, created_at, customer_id, admin_id, jsonb
    from public.logs
    where category = 'stamp'
      and created_at >= '2026-06-01 00:00:00+09'
      and created_at < '2026-07-22 00:00:00+09'
    order by created_at, id
  loop
    v_index := 0;
    for v_item in select value from jsonb_array_elements(coalesce(v_log.jsonb->'items', '[]'::jsonb))
    loop
      v_index := v_index + 1;
      v_name := btrim(coalesce(v_item->>'itemName', ''));
      v_quantity := coalesce(nullif(v_item->>'quantity', '')::integer, 0);
      v_action := btrim(coalesce(v_item->>'inventoryAction', ''));
      v_remark := btrim(coalesce(v_item->>'remark', ''));
      v_item_id := case when coalesce(v_item->>'itemId', '') ~ '^[0-9]+$'
        then (v_item->>'itemId')::bigint else null end;
      if v_item_id is not null and not exists (
        select 1 from public.items where id = v_item_id
      ) then v_item_id := null; end if;
      if v_name = '' or v_quantity <= 0 or not public.is_inventory_item_tracked(v_name) then continue; end if;

      if v_action in ('exchange_in', 'adjustment_in') then
        v_event_type := case when v_action = 'exchange_in'
          then 'customer_exchange_in' else 'adjustment_in' end;
        v_position := case when v_action = 'exchange_in' then 'front' else 'back' end;
        perform public.create_inventory_cost_layer(
          v_event_type, v_log.created_at, v_item_id, v_name, v_quantity,
          null, 'pending', v_position, 'stamp_log', v_log.id::text,
          v_index::text, null,
          jsonb_build_object('customerId', v_log.customer_id, 'backfilled', true)
        );
        continue;
      end if;
      if v_action not in ('', 'out', 'exchange_out', 'as_exchange_out', 'adjustment_out') then continue; end if;
      if v_action in ('', 'out') and v_remark ~ '^(서비스|시연용|교환입고|교환출고|A/S 교환출고|재고조정-(입고|출고))($|[,\s(])' then continue; end if;

      v_event_type := case v_action
        when 'exchange_out' then 'customer_exchange_out'
        when 'as_exchange_out' then 'after_service_out'
        when 'adjustment_out' then 'adjustment_out'
        else 'sale_out' end;
      v_effect := case v_event_type
        when 'sale_out' then 'sale_cogs'
        when 'customer_exchange_out' then 'customer_exchange_difference'
        when 'after_service_out' then 'after_service_pending'
        else 'none' end;
      select coalesce(sum(remaining_quantity), 0)::integer into v_available
      from public.inventory_cost_layers where item_name = v_name and remaining_quantity > 0;
      v_missing := greatest(0, v_quantity - v_available);
      if v_missing > 0 then
        perform public.create_inventory_cost_layer(
          'opening', v_log.created_at - interval '1 microsecond', v_item_id,
          v_name, v_missing, null, 'pending', 'back', 'cost_missing',
          v_log.id::text, v_index::text, null,
          jsonb_build_object('reason', 'historical FIFO quantity missing')
        );
      end if;
      perform public.allocate_inventory_cost_fifo(
        v_event_type, v_log.created_at, v_item_id, v_name, v_quantity,
        'stamp_log', v_log.id::text, v_index::text, v_effect,
        jsonb_build_object('customerId', v_log.customer_id, 'backfilled', true)
      );
    end loop;
  end loop;

  -- 과거 판매용으로 남은 원가층은 7/22 재고와 섞지 않습니다.
  update public.inventory_cost_layers layer set remaining_quantity = 0
  from public.inventory_cost_events event
  where event.id = layer.source_event_id
    and event.reference_type in ('settlement_cost_basis', 'cost_missing')
    and event.event_at < '2026-07-22 00:00:00+09';

  -- 7/22 기초재고는 별도의 새 FIFO 대기열로 시작합니다.
  for v_basis in
    select basis.*, row_number() over (
      partition by basis.item_name order by basis.sort_order, basis.id
    ) as segment_index
    from public.settlement_item_cost_bases basis
    where basis.basis_type = 'opening_20260722'
    order by basis.item_name, basis.sort_order, basis.id
  loop
    perform public.create_inventory_cost_layer(
      'opening', '2026-07-22 00:00:00+09',
      case when exists (select 1 from public.items where id = v_basis.item_id)
        then v_basis.item_id else null end,
      v_basis.item_name, v_basis.quantity, v_basis.unit_cost, 'confirmed', 'back',
      'settlement_cost_basis', v_basis.item_name,
      'opening:' || v_basis.segment_index::text, null,
      jsonb_build_object('basisType', 'opening_20260722')
    );
  end loop;
end;
$$;
