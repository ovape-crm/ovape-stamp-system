begin;
set local lock_timeout='10s'; set local statement_timeout='90s';
do $cleanup$
declare rec record; ctx jsonb; before_state jsonb; n integer:=0; before_cost bigint; report jsonb;
begin
perform set_config('request.jwt.claim.sub',(select id::text from users where oss_role='master' order by created_at limit 1),true);
lock table logs in share row exclusive mode; perform lock_inventory_cost_review();
lock table inventory_service_cost_links,inventory_service_manual_costs,inventory_service_cost_reviews in share row exclusive mode;
before_state:=jsonb_build_object('stock',(select md5(jsonb_agg(to_jsonb(b) order by item_name)::text) from inventory_balances b),'layers',(select md5(jsonb_agg(to_jsonb(l) order by id)::text) from inventory_cost_layers l),'events',(select md5(jsonb_agg(to_jsonb(e) order by id)::text) from inventory_cost_events e),'allocations',(select md5(jsonb_agg(to_jsonb(a) order by id)::text) from inventory_cost_allocations a));
select sum(total_cost::bigint) into before_cost from inventory_cost_reporting_events where direction='out';
for rec in select m.* from inventory_service_manual_costs m join logs l on l.id=m.log_id
where not is_inventory_item_tracked(l.jsonb->'items'->(m.line_index-1)->>'itemName') order by m.log_id,m.line_index loop
ctx:=get_service_cost_entry(rec.log_id,rec.line_index);
if rec.unit_cost<>0 or ctx->>'item_name'<>'510 드립팁 - 특이사항 종류적기' then raise exception '예상 외 미관리 원가 기록'; end if;
perform save_service_manual_cost(rec.log_id,rec.line_index,ctx->>'snapshot',null,'사용자 요청: 재고 미관리 품목은 원가 없음(0원). 불필요한 수동 0원 입력 취소. 기존 감사 이력 보존.');
n:=n+1;
end loop;
if n<>9 then raise exception '대상 건수 변경: %',n; end if;
if before_state is distinct from jsonb_build_object('stock',(select md5(jsonb_agg(to_jsonb(b) order by item_name)::text) from inventory_balances b),'layers',(select md5(jsonb_agg(to_jsonb(l) order by id)::text) from inventory_cost_layers l),'events',(select md5(jsonb_agg(to_jsonb(e) order by id)::text) from inventory_cost_events e),'allocations',(select md5(jsonb_agg(to_jsonb(a) order by id)::text) from inventory_cost_allocations a)) then raise exception '재고 또는 FIFO 원본 변경'; end if;
if before_cost is distinct from (select sum(total_cost::bigint) from inventory_cost_reporting_events where direction='out') then raise exception '원가 합계 변경'; end if;
report:=get_inventory_cost_integrity_report(1000);
if (report->>'stockMismatchCount')::integer<>0 or (report->>'layerMismatchCount')::integer<>0 or (report->>'outboundMismatchCount')::integer<>0 then raise exception '무결성 검사 실패'; end if;
end $cleanup$;
with actor as materialized(select set_config('request.jwt.claim.sub',(select id::text from users where oss_role='master' order by created_at limit 1),true))
select get_inventory_cost_integrity_report(1000)-'missingServiceLines' integrity,
get_service_cost_entries(100)->'count' managed_service_count,
(select count(*) from inventory_service_manual_costs m join logs l on l.id=m.log_id where not is_inventory_item_tracked(l.jsonb->'items'->(m.line_index-1)->>'itemName')) untracked_manual_count from actor;
commit;
