-- 재고 수량과 확정된 출고 원가를 보호한다.
-- 이미 출고에 배정된 원가층은 단가를 직접 바꿀 수 없고,
-- 남아 있는 미사용 원가층만 마스터가 수정할 수 있다.
create or replace function public.update_inventory_cost_layer_unit_cost(
  p_layer_id uuid,
  p_unit_cost integer,
  p_reason text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_layer public.inventory_cost_layers%rowtype;
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid() and oss_role = 'master'
  ) then
    raise exception 'MASTER_REQUIRED';
  end if;

  if p_unit_cost is null or p_unit_cost < 0 then
    raise exception 'INVALID_UNIT_COST';
  end if;

  select * into v_layer
  from public.inventory_cost_layers
  where id = p_layer_id
  for update;

  if not found then
    raise exception 'COST_LAYER_NOT_FOUND';
  end if;

  if exists (
    select 1 from public.inventory_cost_allocations
    where source_layer_id = p_layer_id
  ) then
    raise exception 'COST_LAYER_ALREADY_ALLOCATED: 이미 출고 원가에 사용된 층입니다. 원가 재배정 미리보기 승인 후에만 변경할 수 있습니다.';
  end if;

  update public.inventory_cost_layers
  set unit_cost = p_unit_cost,
      cost_status = 'confirmed'
  where id = p_layer_id;

  update public.inventory_cost_events
  set total_cost = v_layer.original_quantity * p_unit_cost,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'manualCostEdit', jsonb_build_object(
          'unitCost', p_unit_cost,
          'reason', nullif(btrim(coalesce(p_reason, '')), ''),
          'editedAt', now(),
          'allocatedQuantity', 0
        )
      )
  where id = v_layer.source_event_id;
end;
$$;

revoke all on function public.update_inventory_cost_layer_unit_cost(uuid, integer, text)
  from public, anon;
grant execute on function public.update_inventory_cost_layer_unit_cost(uuid, integer, text)
  to authenticated;
