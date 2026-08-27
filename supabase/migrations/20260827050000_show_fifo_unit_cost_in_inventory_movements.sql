-- 마스터 재고변동 표의 단가에는 직접 저장된 이동 단가를 우선 사용하고,
-- 출고처럼 이동 단가가 없는 경우 FIFO 원가배정의 가중 평균 단가를 보여 준다.
drop function if exists public.get_inventory_movement_unit_prices(bigint[]);

create or replace function public.get_inventory_movement_unit_prices(
  p_movement_ids uuid[]
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(movement.id::text, price.unit_price), '{}'::jsonb)
  from public.inventory_movements movement
  cross join lateral (
    select coalesce(
      movement.unit_price,
      (
        select case
          when bool_or(event.total_cost is null) then null
          when sum(event.quantity) = 0 then null
          else round(sum(event.total_cost)::numeric / sum(event.quantity))::integer
        end
        from public.inventory_cost_events event
        where event.item_name = btrim(movement.item_name)
          and event.reference_id = movement.reference_id
          and (
            (movement.reference_type = 'outbound_log' and event.reference_type = 'stamp_log')
            or (
              movement.reference_type in ('purchase_receipt', 'purchase_receipt_reversal')
              and event.reference_type = 'purchase_receipt'
            )
          )
      )
    ) as unit_price
  ) price
  where auth.uid() is not null
    and exists (
      select 1 from public.users app_user
      where app_user.id = auth.uid() and app_user.oss_role = 'master'
    )
    and movement.id = any(coalesce(p_movement_ids, array[]::uuid[]));
$$;

revoke all on function public.get_inventory_movement_unit_prices(uuid[])
  from public, anon;
grant execute on function public.get_inventory_movement_unit_prices(uuid[])
  to authenticated;
