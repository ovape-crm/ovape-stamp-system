-- 선택한 날짜 종료 시점의 재고를 현재 잔액과 이후 변동 이력으로 역산한다.
-- 변동이 없던 품목도 0을 포함한 전체 재고 목록에 남길 수 있도록 잔액 행을 모두 반환한다.
create or replace function public.get_inventory_stock_as_of(p_as_of_date date)
returns table (
  item_name text,
  quantity integer,
  last_movement_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with cutoff as (
    select ((p_as_of_date + 1)::timestamp at time zone 'Asia/Seoul') as starts_at
  ), later_movements as (
    select
      movement.item_name,
      sum(movement.quantity_delta)::integer as quantity_delta
    from public.inventory_movements movement
    cross join cutoff
    where movement.created_at >= cutoff.starts_at
    group by movement.item_name
  ), historical_movement_dates as (
    select
      movement.item_name,
      max(movement.created_at) as last_movement_at
    from public.inventory_movements movement
    cross join cutoff
    where movement.created_at < cutoff.starts_at
    group by movement.item_name
  )
  select
    balance.item_name,
    balance.quantity - coalesce(later_movements.quantity_delta, 0) as quantity,
    historical_movement_dates.last_movement_at
  from public.inventory_balances balance
  left join later_movements on later_movements.item_name = balance.item_name
  left join historical_movement_dates on historical_movement_dates.item_name = balance.item_name;
$$;

revoke all on function public.get_inventory_stock_as_of(date) from public, anon;
grant execute on function public.get_inventory_stock_as_of(date) to authenticated;
