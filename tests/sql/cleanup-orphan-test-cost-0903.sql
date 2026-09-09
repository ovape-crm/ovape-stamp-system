-- One-shot, exact-target repair. Original rows remain in the cleanup audit.
begin;
set local lock_timeout='10s';
set local statement_timeout='90s';
create function pg_temp.cleanup_unchanged_state() returns jsonb language sql as $$
select jsonb_build_object(
 'stock',(select md5(jsonb_agg(to_jsonb(x) order by item_name)::text) from inventory_balances x),
 'layers',(select md5(jsonb_agg(to_jsonb(x) order by id)::text) from inventory_cost_layers x where id<>'785106af-e4d1-4ae9-a903-cf162ffbd792'),
 'events',(select md5(jsonb_agg(to_jsonb(x) order by id)::text) from inventory_cost_events x where id not in ('dd217043-7fcc-49f4-98fb-89e711ed29b5','c69183ed-d4ad-45a6-a6da-d43a1a1c474b')),
 'allocations',(select md5(jsonb_agg(to_jsonb(x) order by id)::text) from inventory_cost_allocations x where id<>'640029e9-8eff-4d64-8b9c-98b425c85bbc'),
 'service_links',(select md5(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text)::text) from inventory_service_cost_links x)
);
$$;
do $repair$
declare s inventory_cost_events%rowtype; e inventory_cost_events%rowtype;
 l inventory_cost_layers%rowtype; a inventory_cost_allocations%rowtype;
 before_state jsonb; report jsonb;
begin
 perform set_config('request.jwt.claim.sub',(select id::text from users where oss_role='master' order by created_at limit 1),true);
 lock table logs in share row exclusive mode;
 perform lock_inventory_cost_review();
 lock table inventory_service_cost_links in share row exclusive mode;
 select * into strict s from inventory_cost_events where id='dd217043-7fcc-49f4-98fb-89e711ed29b5';
 select * into strict e from inventory_cost_events where id='c69183ed-d4ad-45a6-a6da-d43a1a1c474b';
 select * into strict l from inventory_cost_layers where id='785106af-e4d1-4ae9-a903-cf162ffbd792';
 select * into strict a from inventory_cost_allocations where id='640029e9-8eff-4d64-8b9c-98b425c85bbc';
 if s.reference_type is distinct from 'cost_missing' or s.reference_id is distinct from '6784'
 or s.reference_line_key is distinct from '1' or s.event_type<>'opening' or s.direction<>'in'
 or s.item_name<>'테스트용 품목 1' or s.quantity<>1 or s.total_cost is not null
 or s.metadata->>'reason' is distinct from 'live cost missing'
 or e.event_type<>'reconciliation_out' or e.reference_type is distinct from 'cost_reconciliation'
 or e.direction<>'out' or e.item_name<>s.item_name or e.quantity<>1 or e.total_cost is not null
 or e.metadata->>'restoredAt' is not null or e.metadata->>'sourceLayerId' is distinct from l.id::text
 or l.source_event_id<>s.id or l.item_name<>s.item_name or l.original_quantity<>1
 or l.remaining_quantity<>0 or l.unit_cost is not null or l.cost_status<>'pending' or l.source_layer_id is not null
 or a.outbound_event_id<>e.id or a.source_layer_id<>l.id or a.quantity<>1 or a.unit_cost is not null
 then raise exception '원본 상태 변경: 정리 중단'; end if;
 if exists(select 1 from logs where id=6784)
 or exists(select 1 from inventory_cost_allocations where (source_layer_id=l.id or outbound_event_id=e.id) and id<>a.id)
 or exists(select 1 from inventory_cost_layers where source_layer_id=l.id)
 or exists(select 1 from inventory_service_cost_links where allocation_id=a.id)
 or exists(select 1 from after_service_outbound_cost_allocations where cost_allocation_id=a.id)
 then raise exception '원본 출고 또는 후속 연결 존재: 정리 중단'; end if;
 before_state:=pg_temp.cleanup_unchanged_state();
 insert into inventory_cost_cleanup_audit(source_event_id,trigger_log_id,reason,snapshot,created_by)
 values(s.id,6784,'삭제된 테스트 출고의 고아 임시층·소진 동시 정리. 실재고 변경 없음.',
 jsonb_build_object('source_event',to_jsonb(s),'consumption_event',to_jsonb(e),'layer',to_jsonb(l),'allocation',to_jsonb(a)),auth.uid());
 delete from inventory_cost_events where id=e.id;
 update inventory_cost_layers set remaining_quantity=original_quantity where id=l.id;
 perform cleanup_unused_outbound_missing_layers('6784',6784);
 if exists(select 1 from inventory_cost_events where id in (s.id,e.id))
 or exists(select 1 from inventory_cost_layers where id=l.id)
 or exists(select 1 from inventory_cost_allocations where id=a.id)
 then raise exception '대상 정리 미완료'; end if;
 if before_state is distinct from pg_temp.cleanup_unchanged_state() then raise exception '실재고 또는 범위 밖 원가 변경'; end if;
 report:=get_inventory_cost_integrity_report(1000);
 if (report->>'stockMismatchCount')::int<>0 or (report->>'layerMismatchCount')::int<>0 or (report->>'outboundMismatchCount')::int<>0
 then raise exception '무결성 오류: %',report; end if;
end $repair$;
with actor as materialized(select set_config('request.jwt.claim.sub',(select id::text from users where oss_role='master' order by created_at limit 1),true))
select get_inventory_cost_integrity_report(1000)-'missingServiceLines' integrity,
 (select jsonb_agg(to_jsonb(b)) from inventory_balances b where item_name='테스트용 품목 1') stock,
 (select count(*) from inventory_cost_cleanup_audit where trigger_log_id=6784) backup_count,
 (select count(*) from inventory_cost_layers where item_name='테스트용 품목 1' and cost_status='pending') pending_layers
from actor;
commit;
