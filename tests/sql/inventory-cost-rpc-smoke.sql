-- Read-only runtime checks against the real schema. No preview approval/application.
with actor as materialized (
  select set_config('request.jwt.claim.sub',(select id::text from public.users where oss_role='master' order by created_at limit 1),true)
)
select
  public.get_inventory_cost_integrity_report(1)-'missingServiceLines' integrity,
  (select count(*) from public.get_after_service_outbound_cost_details(
    (select e.metadata->>'afterServiceId' from public.inventory_cost_events e
      where e.event_type='after_service_out' and e.metadata->>'afterServiceId' ~ '^[0-9]+$' limit 1)::bigint
  )) after_service_detail_rows,
  public.get_inventory_movement_unit_prices(array(
    select id from public.inventory_movements where quantity_delta<0 limit 1
  )) is not null movement_cost_rpc_ok
from actor;
