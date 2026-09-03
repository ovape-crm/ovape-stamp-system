-- Untracked items have no managed cost; retain historical source/audit records.
alter function public.get_service_cost_entry(bigint,integer) rename to get_service_cost_entry_reviewed;
revoke all on function public.get_service_cost_entry_reviewed(bigint,integer) from public,anon,authenticated;
create function public.get_service_cost_entry(p_log_id bigint,p_line_index integer)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare entry jsonb; tracked boolean;
begin
 entry:=public.get_service_cost_entry_reviewed(p_log_id,p_line_index);
 tracked:=public.is_inventory_item_tracked(entry->>'item_name');
 entry:=entry||jsonb_build_object('is_tracked',tracked,'snapshot',md5(jsonb_build_object('entry',entry->>'snapshot','tracked',tracked)::text));
 if not tracked then entry:=entry||jsonb_build_object('total_cost',0,'source','untracked'); end if;
 return entry;
end $$;
revoke all on function public.get_service_cost_entry(bigint,integer) from public,anon;
grant execute on function public.get_service_cost_entry(bigint,integer) to authenticated;

alter function public.save_service_manual_cost(bigint,integer,text,integer,text) rename to save_service_manual_cost_tracked_base;
revoke all on function public.save_service_manual_cost_tracked_base(bigint,integer,text,integer,text) from public,anon,authenticated;
create function public.save_service_manual_cost(p_log_id bigint,p_line_index integer,p_snapshot text,p_unit_cost integer,p_note text)
returns void language plpgsql security definer set search_path=public as $$
declare entry jsonb;
begin
 if not exists(select 1 from public.users where id=auth.uid() and oss_role='master') then raise exception 'MASTER_REQUIRED'; end if;
 lock table public.logs in share row exclusive mode;
 entry:=public.get_service_cost_entry(p_log_id,p_line_index);
 if not(entry->>'is_tracked')::boolean and p_unit_cost is not null then
 raise exception '재고 미관리 품목은 원가 없음(0원)으로 처리하며 원가를 입력하지 않습니다.'; end if;
 perform public.save_service_manual_cost_tracked_base(p_log_id,p_line_index,p_snapshot,p_unit_cost,p_note);
end $$;
revoke all on function public.save_service_manual_cost(bigint,integer,text,integer,text) from public,anon;
grant execute on function public.save_service_manual_cost(bigint,integer,text,integer,text) to authenticated;
create or replace function public.get_service_cost_entries(p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
 if not exists(select 1 from public.users where id=auth.uid() and oss_role='master') then raise exception 'MASTER_REQUIRED'; end if;
 with services as (
 select l.id,l.created_at,i.n::integer line_index from public.logs l cross join lateral jsonb_array_elements(coalesce(l.jsonb->'items','[]')) with ordinality i(value,n)
 where public.is_inventory_item_tracked(btrim(i.value->>'itemName')) and l.category='stamp' and btrim(coalesce(i.value->>'remark','')) ~ '^서비스($|[,\s(])'
 and btrim(coalesce(i.value->>'inventoryAction','')) in ('','out') and coalesce(nullif(i.value->>'quantity','')::integer,0)>0
 )
 select jsonb_build_object('count',(select count(*) from services),'rows',coalesce((select jsonb_agg(public.get_service_cost_entry(s.id,s.line_index) order by s.created_at desc,s.id desc,s.line_index) from
 (select * from services order by created_at desc,id desc,line_index limit greatest(1,least(coalesce(p_limit,100),10000))) s),'[]'::jsonb)) into result;
 return result;
end $$;
create or replace function public.get_inventory_movement_unit_prices(p_movement_ids uuid[])
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_object_agg(m.id::text,case
    when not public.is_inventory_item_tracked(btrim(m.item_name)) then 0
    when m.reference_type='after_service_outbound' and m.unit_price is not null then m.unit_price
    when m.quantity_delta<0 and c.n>0 then c.unit_cost
    else coalesce(m.unit_price,c.unit_cost) end),'{}'::jsonb)
  from public.inventory_movements m
  cross join lateral(select count(*) n,case when bool_or(parts.total_cost is null) then null
    else round(sum(parts.total_cost)::numeric/nullif(sum(parts.quantity),0))::integer end unit_cost
    from (
      select e.total_cost::bigint,e.quantity from public.inventory_cost_events e
      where e.item_name=btrim(m.item_name) and e.reference_id=m.reference_id
        and not exists(select 1 from public.inventory_service_manual_costs mc where e.reference_type='stamp_log' and mc.log_id::text=e.reference_id and mc.line_index::text=e.reference_line_key)
        and ((m.reference_type='outbound_log' and e.reference_type='stamp_log'
            and e.direction=case when m.inventory_action in ('exchange_in','adjustment_in') then 'in' else 'out' end)
          or (m.reference_type='after_service_outbound' and e.reference_type='after_service_outbound')
          or (m.reference_type in ('purchase_receipt','purchase_receipt_reversal') and e.reference_type='purchase_receipt'))
      union all
      select s.quantity::bigint*a.unit_cost,s.quantity
      from public.inventory_service_cost_links s join public.inventory_cost_allocations a on a.id=s.allocation_id
      join public.inventory_cost_events e on e.id=a.outbound_event_id
      where m.reference_type='outbound_log' and m.quantity_delta<0 and s.log_id::text=m.reference_id and e.item_name=btrim(m.item_name)
      and not exists(select 1 from public.inventory_service_manual_costs mc where mc.log_id=s.log_id and mc.line_index=s.line_index)
      union all
      select mc.unit_cost::bigint*(i.value->>'quantity')::integer,(i.value->>'quantity')::integer
      from public.inventory_service_manual_costs mc join public.logs log on log.id=mc.log_id
      cross join lateral (select log.jsonb->'items'->(mc.line_index-1) value) i
      where m.reference_type='outbound_log' and m.quantity_delta<0 and mc.log_id::text=m.reference_id and btrim(i.value->>'itemName')=btrim(m.item_name)
    ) parts
  ) c
  where m.id=any(coalesce(p_movement_ids,array[]::uuid[]))
    and exists(select 1 from public.users where id=auth.uid() and oss_role='master');
$$;
create or replace view public.inventory_cost_reporting_events with (security_invoker=true) as
with eligible_reviews as (
 select r.* from public.inventory_service_cost_reviews r
 where public.is_inventory_item_tracked((select log.jsonb->'items'->(r.line_index-1)->>'itemName' from public.logs log where log.id=r.log_id))
 and r.kind in ('historical_manual','untracked_manual','current_manual')
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
where public.is_inventory_item_tracked(e.item_name) and not(e.event_type='reconciliation_out' and e.metadata->>'restoredAt' is not null)
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
