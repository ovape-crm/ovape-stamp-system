-- Reviewed monetary records are separate from physical FIFO consumption.
-- Never invent an inbound layer merely to make an unknown source look allocated.
create table public.inventory_service_cost_reviews (
 id uuid primary key default gen_random_uuid(),
 log_id bigint not null, line_index integer not null,
 kind text not null check(kind in ('historical_manual','untracked_manual','offset_review')),
 note text not null, reviewed_input jsonb not null, cost_snapshot text not null,
 reviewed_by uuid not null references auth.users(id), reviewed_at timestamptz not null default now(),
 unique(log_id,line_index),
 foreign key(log_id,line_index) references public.inventory_service_manual_costs(log_id,line_index) on delete cascade
);
alter table public.inventory_service_cost_reviews enable row level security;
revoke all on public.inventory_service_cost_reviews from public,anon,authenticated;
grant select on public.inventory_service_cost_reviews to authenticated;
create policy master_reads_service_reviews on public.inventory_service_cost_reviews for select to authenticated
 using(exists(select 1 from public.users where id=auth.uid() and oss_role='master'));

-- Keep existing callers and audit snapshots on the same authoritative entry API.
alter function public.get_service_cost_entry(bigint,integer) rename to get_service_cost_entry_unreviewed;
revoke all on function public.get_service_cost_entry_unreviewed(bigint,integer) from public,anon,authenticated;
create function public.get_service_cost_entry(p_log_id bigint,p_line_index integer)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare entry jsonb; review jsonb;
begin
 entry:=public.get_service_cost_entry_unreviewed(p_log_id,p_line_index);
 select to_jsonb(r) into review from public.inventory_service_cost_reviews r where log_id=p_log_id and line_index=p_line_index;
 return entry || jsonb_build_object('review',review,
 'snapshot',md5(jsonb_build_object('entry',entry->>'snapshot','review',review)::text));
end $$;
revoke all on function public.get_service_cost_entry(bigint,integer) from public,anon;
grant execute on function public.get_service_cost_entry(bigint,integer) to authenticated;

-- This ledger view includes approved monetary-only service entries once.
-- Pending offset cases are not posted. Existing allocations/links always win
-- over a second standalone posting; manual input remains visible in the editor.
create view public.inventory_cost_reporting_events with (security_invoker=true) as
select e.id,e.event_type,e.event_at,e.item_name,e.direction,e.quantity,e.total_cost,
 e.reference_type,e.reference_id,e.reference_line_key,e.settlement_effect,e.metadata,e.created_at
from public.inventory_cost_events e
where not(e.event_type='reconciliation_out' and e.metadata->>'restoredAt' is not null)
union all
select r.id,'service_out',l.created_at,i.value->>'itemName','out',(i.value->>'quantity')::integer,
 (m.unit_cost::bigint*(i.value->>'quantity')::integer)::integer,
 'manual_service_cost',l.id::text,m.line_index::text,'none',
 jsonb_build_object('monetaryOnly',true,'sourceStatus','manual_unverified','reviewKind',r.kind,
 'note',r.note,'inputNote',m.note,'reviewedAt',r.reviewed_at,'reviewedBy',r.reviewed_by,
 'reason','수동 확정·출처 미확인. 금액만 기록하며 재고와 FIFO 원가층 수량은 변경하지 않음.'),
 m.updated_at
from public.inventory_service_cost_reviews r
join public.inventory_service_manual_costs m using(log_id,line_index)
join public.logs l on l.id=m.log_id
cross join lateral(select l.jsonb->'items'->(m.line_index-1) value) i
where r.kind in ('historical_manual','untracked_manual')
 and not exists(select 1 from public.inventory_cost_events e where e.reference_type='stamp_log' and e.reference_id=l.id::text and e.reference_line_key=m.line_index::text)
 and not exists(select 1 from public.inventory_service_cost_links s where s.log_id=m.log_id and s.line_index=m.line_index);
revoke all on public.inventory_cost_reporting_events from public,anon,authenticated;
grant select on public.inventory_cost_reporting_events to authenticated;
