-- 사용자가 지정한 무상/0원 재고를 기존 FIFO 층에서 분리한다.
-- 총 재고 수량은 바꾸지 않고, 새 0원 층을 기존 층보다 먼저 출고되도록 배치한다.
do $$
declare
  v_source_layer_id uuid;
  v_quantity integer;
  v_source public.inventory_cost_layers%rowtype;
  v_event_id uuid;
  v_reference_id text;
  v_queue_sequence numeric(30,6);
begin
  for v_source_layer_id, v_quantity in
    values
      ('5fcbab93-69c4-4f33-8f7c-ccccb8469efa'::uuid, 2), -- 긱베이프 U 0.7 팟
      ('f7fa18a3-d5bc-4ab9-9c22-4752d06b6075'::uuid, 1), -- 디오X 1.2 팟 3,300원 층 중 1개
      ('6b201196-e7b1-4fc1-9ef1-0582b1db7ffd'::uuid, 3), -- 글렌트 1.0 팟
      ('44b6ad08-ea94-4f55-bb92-ef14ac919c2a'::uuid, 1), -- 마이팟프로 0.6 팟
      ('9bef3cdb-e2b6-46ea-b52b-81ab91dfc2b7'::uuid, 1), -- 팬텀 엔트리 실버
      ('cdd2f706-19f6-44f6-a366-e30fc5e741a2'::uuid, 1)  -- 마이팟프로 실버
  loop
    select * into v_source from public.inventory_cost_layers where id = v_source_layer_id for update;
    if not found or v_source.remaining_quantity < v_quantity then
      raise exception 'INSUFFICIENT_COST_LAYER_QUANTITY: %', v_source_layer_id;
    end if;
    select coalesce(min(queue_sequence), 0) - 1 into v_queue_sequence
    from public.inventory_cost_layers where item_name = v_source.item_name and remaining_quantity > 0;
    v_event_id := gen_random_uuid();
    v_reference_id := gen_random_uuid()::text;
    insert into public.inventory_cost_events(
      id, event_type, event_at, item_id, item_name, direction, quantity, total_cost,
      reference_type, reference_id, reference_line_key, settlement_effect, metadata, created_by
    ) values (
      v_event_id, 'reconciliation_in', now(), v_source.item_id, v_source.item_name, 'in', v_quantity, 0,
      'cost_reconciliation', v_reference_id, v_source.id::text, 'none',
      jsonb_build_object('note', '사용자 지정 0원 원가층·먼저출고', 'sourceLayerId', v_source.id, 'manualZeroCost', true), null
    );
    update public.inventory_cost_layers
    set remaining_quantity = remaining_quantity - v_quantity
    where id = v_source.id;
    insert into public.inventory_cost_layers(
      source_event_id, item_id, item_name, original_quantity, remaining_quantity,
      unit_cost, queue_sequence, cost_status, source_layer_id
    ) values (
      v_event_id, v_source.item_id, v_source.item_name, v_quantity, v_quantity,
      0, v_queue_sequence, 'confirmed', v_source.id
    );
  end loop;
end;
$$;
