-- The user confirmed opening inventory is the previous day's closing stock.
alter table public.inventory_service_cost_reviews drop constraint inventory_service_cost_reviews_kind_check;
alter table public.inventory_service_cost_reviews add constraint inventory_service_cost_reviews_kind_check
 check(kind in ('historical_manual','untracked_manual','offset_review','current_manual'));

create function public.guard_reviewed_service_attribution() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op in ('UPDATE','DELETE') and exists(select 1 from public.inventory_service_cost_reviews where log_id=old.log_id and line_index=old.line_index and kind='current_manual') then
 raise exception '원장에 반영된 서비스입니다. 직접 입력을 먼저 취소한 뒤 소진 연결을 수정해 주세요.'; end if;
 if tg_op in ('INSERT','UPDATE') and exists(select 1 from public.inventory_service_cost_reviews where log_id=new.log_id and line_index=new.line_index and kind='current_manual') then
 raise exception '원장에 반영된 서비스입니다. 직접 입력을 먼저 취소한 뒤 소진 연결을 수정해 주세요.'; end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger guard_reviewed_service_attribution before insert or update or delete on public.inventory_service_cost_links
 for each row execute function public.guard_reviewed_service_attribution();
revoke all on function public.guard_reviewed_service_attribution() from public,anon,authenticated;

create or replace view public.inventory_cost_reporting_events with (security_invoker=true) as
with eligible_reviews as (
 select r.* from public.inventory_service_cost_reviews r
 where r.kind in ('historical_manual','untracked_manual','current_manual')
 and not exists(select 1 from public.inventory_cost_events e where e.reference_type='stamp_log' and e.reference_id=r.log_id::text and e.reference_line_key=r.line_index::text)
 and (r.kind='current_manual' or not exists(select 1 from public.inventory_service_cost_links s where s.log_id=r.log_id and s.line_index=r.line_index))
), offsets as (
 select a.outbound_event_id,sum(s.quantity::bigint*a.unit_cost) amount
 from eligible_reviews r join public.inventory_service_cost_links s using(log_id,line_index)
 join public.inventory_cost_allocations a on a.id=s.allocation_id
 join public.inventory_cost_events source on source.id=a.outbound_event_id
 where r.kind='current_manual' and source.event_type='reconciliation_out' and source.metadata->>'restoredAt' is null
 group by a.outbound_event_id
)
select e.id,e.event_type,e.event_at,e.item_name,e.direction,e.quantity,
 (e.total_cost::bigint-coalesce(o.amount,0))::integer total_cost,
 e.reference_type,e.reference_id,e.reference_line_key,e.settlement_effect,
 case when o.outbound_event_id is null then e.metadata else e.metadata||jsonb_build_object(
 'serviceAttributedCost',o.amount,'originalConsumedCost',e.total_cost,
 'attributionReason','이미 소진한 금액을 서비스 원가로 귀속. 재고와 실제 FIFO 배정은 그대로 유지.') end metadata,e.created_at
from public.inventory_cost_events e left join offsets o on o.outbound_event_id=e.id
where not(e.event_type='reconciliation_out' and e.metadata->>'restoredAt' is not null)
union all
select r.id,'service_out',l.created_at,i.value->>'itemName','out',(i.value->>'quantity')::integer,
 (m.unit_cost::bigint*(i.value->>'quantity')::integer)::integer,
 'manual_service_cost',l.id::text,m.line_index::text,'none',
 jsonb_build_object('monetaryOnly',true,'sourceStatus','manual_unverified','reviewKind',r.kind,
 'note',r.note,'inputNote',m.note,'reviewedAt',r.reviewed_at,'reviewedBy',r.reviewed_by,
 'attributedCost',coalesce((select sum(s.quantity::bigint*a.unit_cost) from public.inventory_service_cost_links s join public.inventory_cost_allocations a on a.id=s.allocation_id where s.log_id=r.log_id and s.line_index=r.line_index),0),
 'reason','수동 확정 원가. 연결된 기존 소진 금액은 원장에서 중복 제외하며 재고·원가층 수량은 변경하지 않음.'),
 m.updated_at
from eligible_reviews r
join public.inventory_service_manual_costs m using(log_id,line_index)
join public.logs l on l.id=m.log_id
cross join lateral(select l.jsonb->'items'->(m.line_index-1) value) i;
