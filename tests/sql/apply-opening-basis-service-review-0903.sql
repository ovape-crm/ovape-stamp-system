begin;
set local lock_timeout='10s'; set local statement_timeout='90s';
do $apply$
declare plans jsonb:='[{"id":"6617","line":6,"entry_snapshot":"e1ebbaf17de2b56ee0e55b59e2a52d3c","context_snapshot":"796a48cbf34cfa4eb4d256b6b71c01ba","cost_snapshot":"2f43a8f1ac6580d110f621864ff73bc4","note":"7/21 마감 잔량이 7/22 기초라는 사용자 확인에 따라 #5638 판매 원가 2,000원은 유지. 서비스 2개 4,000원 중 1개 2,000원은 8/27 기존 소진에 귀속하고 나머지 2,000원은 수동 확정·출처 미확인으로 기록.","allocation":"9daff62d-b331-4a8d-8c1e-116237437e9a"},{"id":"6476","line":5,"entry_snapshot":"4871878315d3d888aee12a2fa1073040","context_snapshot":"29efe386a3d5ac59f1758e84eaf6b383","cost_snapshot":"2e4392fdbcb76c15700a4d2a7d4b135a","note":"전일 마감 기초 기준 확인. #5631 판매와 #6575 과거 판매는 서비스와 별도 거래이므로 원가 유지. 서비스 1개 2,000원은 수동 확정·출처 미확인으로 기록. 기존 보충·재고·판매 배정은 변경하지 않음.","allocation":null},{"id":"6423","line":3,"entry_snapshot":"75d33e9e674c1d4859b94c68c42ce3f2","context_snapshot":"b3e2e458436f2332b981e0198d5b5218","cost_snapshot":"eeaedf523c0f088edfda995da54eabec","note":"전일 마감 기초 기준 확인. #5626·#5640 판매 및 과거 시연 58개는 서비스와 별도 거래로 유지. 서비스 1개 2,000원만 수동 확정·출처 미확인으로 기록. 과거 입고층 날짜 역전은 원본을 임의 재배정하지 않음.","allocation":null},{"id":"5993","line":5,"entry_snapshot":"b6ae41d39a9c8beb59fae7def2fd7cdc","context_snapshot":"200e8100805dc0f3243f19c25e430194","cost_snapshot":"7737715091c3cbc1b3b7783ff63f862c","note":"전일 마감 기초 기준 확인. #5637 판매 3개는 정상 판매로 유지. 서비스 2개 4,000원은 수동 확정·출처 미확인으로 기록. 기존 보충과 현재 재고는 변경하지 않음.","allocation":null},{"id":"5756","line":3,"entry_snapshot":"9c586c2da25f7e37165aa05cf3d3eea7","context_snapshot":"2ff618cb3b90a13ec37c9190c3888605","cost_snapshot":"a7c9aa323281897d73a2172d2f5c943a","note":"사용자가 확정한 서비스 1개 0원을 기록. 출고 전 기초 원가층의 기존 소진 11개 중 1개를 서비스에 귀속. 나머지 소진 10개와 보충 10개는 원본 유지. 실제 입고 출처는 추가 추정하지 않음.","allocation":"9a4fae11-39b2-47c2-b0b5-a079f6baa24b"},{"id":"5737","line":6,"entry_snapshot":"4bfc5767b6506c988eb3c6945193b9c7","context_snapshot":"18e0501678bb30cb677f0225ba89c04a","cost_snapshot":"84fc05b8dd56c1160a3ba4ccf0c68866","note":"전일 마감 기초 기준 확인. #5636 판매 2개는 정상 판매로 유지. 서비스 1개 3,000원은 수동 확정·출처 미확인으로 기록. 기존 보충과 현재 재고는 변경하지 않음.","allocation":null}]'::jsonb; p jsonb; ctx jsonb; entry jsonb; candidate jsonb; before_entry jsonb; before_state jsonb; before_cost bigint; after_cost bigint; report jsonb;
begin
perform set_config('request.jwt.claim.sub',(select id::text from users where oss_role='master' order by created_at limit 1),true);
lock table logs in share row exclusive mode; perform lock_inventory_cost_review();
lock table inventory_service_cost_links,inventory_service_manual_costs,inventory_service_cost_reviews in share row exclusive mode;
before_state:=jsonb_build_object('stock',(select md5(jsonb_agg(to_jsonb(b) order by item_name)::text) from inventory_balances b),'layers',(select md5(jsonb_agg(to_jsonb(l) order by id)::text) from inventory_cost_layers l),'events',(select md5(jsonb_agg(to_jsonb(e) order by id)::text) from inventory_cost_events e),'allocations',(select md5(jsonb_agg(to_jsonb(a) order by id)::text) from inventory_cost_allocations a),'manual',(select md5(jsonb_agg(to_jsonb(m) order by log_id,line_index)::text) from inventory_service_manual_costs m),'other_links',(select md5(jsonb_agg(to_jsonb(s) order by log_id,line_index,allocation_id)::text) from inventory_service_cost_links s where not exists(select 1 from jsonb_array_elements(plans) target where (target->>'id')::bigint=s.log_id and (target->>'line')::integer=s.line_index)));
select sum(total_cost::bigint) into before_cost from inventory_cost_reporting_events where direction='out';
for p in select value from jsonb_array_elements(plans) loop
entry:=get_service_cost_entry((p->>'id')::bigint,(p->>'line')::integer);
ctx:=get_service_cost_link_context((p->>'id')::bigint,(p->>'line')::integer);
if entry->>'snapshot' is distinct from p->>'entry_snapshot' or ctx->>'snapshot' is distinct from p->>'context_snapshot'
or md5(inventory_cost_review_snapshot(entry->>'item_name')::text) is distinct from p->>'cost_snapshot' then raise exception '대사 원본 변경: %',p->>'id'; end if;
if entry->'review'->>'kind'<>'offset_review' or exists(select 1 from inventory_service_cost_links where log_id=(p->>'id')::bigint and line_index=(p->>'line')::integer) then raise exception '대사 상태 또는 연결 변경'; end if;
if p->>'allocation' is not null then
select c into candidate from jsonb_array_elements(ctx->'candidates') c where c->>'allocation_id'=p->>'allocation';
if candidate is null or not(candidate->>'eligible')::boolean or (candidate->>'available_quantity')::integer<1 or (candidate->>'unit_cost')::integer is distinct from (entry->'manual'->>'unit_cost')::integer then raise exception '기존 소진 단가·수량·날짜 불일치'; end if;
end if;
end loop;
for p in select value from jsonb_array_elements(plans) loop
before_entry:=get_service_cost_entry((p->>'id')::bigint,(p->>'line')::integer);
if p->>'allocation' is not null then
insert into inventory_service_cost_links(log_id,line_index,allocation_id,quantity)
values((p->>'id')::bigint,(p->>'line')::integer,(p->>'allocation')::uuid,1);
insert into inventory_service_cost_link_audit(log_id,line_index,before_links,after_links,note,created_by)
select (p->>'id')::bigint,(p->>'line')::integer,'[]'::jsonb,
jsonb_build_array(jsonb_build_object('allocation_id',a.id,'quantity',1,'unit_cost',a.unit_cost,'source_layer_id',a.source_layer_id)),p->>'note',auth.uid()
from inventory_cost_allocations a where a.id=(p->>'allocation')::uuid;
end if;
update inventory_service_cost_reviews set kind='current_manual',note=p->>'note',
reviewed_input=before_entry-'history'-'review',cost_snapshot=p->>'cost_snapshot',reviewed_at=now(),reviewed_by=auth.uid()
where log_id=(p->>'id')::bigint and line_index=(p->>'line')::integer;
insert into inventory_service_manual_cost_audit(log_id,line_index,before_cost,after_cost,note,created_by)
values((p->>'id')::bigint,(p->>'line')::integer,before_entry-'history',get_service_cost_entry((p->>'id')::bigint,(p->>'line')::integer)-'history',p->>'note',auth.uid());
end loop;
if before_state is distinct from jsonb_build_object('stock',(select md5(jsonb_agg(to_jsonb(b) order by item_name)::text) from inventory_balances b),'layers',(select md5(jsonb_agg(to_jsonb(l) order by id)::text) from inventory_cost_layers l),'events',(select md5(jsonb_agg(to_jsonb(e) order by id)::text) from inventory_cost_events e),'allocations',(select md5(jsonb_agg(to_jsonb(a) order by id)::text) from inventory_cost_allocations a),'manual',(select md5(jsonb_agg(to_jsonb(m) order by log_id,line_index)::text) from inventory_service_manual_costs m),'other_links',(select md5(jsonb_agg(to_jsonb(s) order by log_id,line_index,allocation_id)::text) from inventory_service_cost_links s where not exists(select 1 from jsonb_array_elements(plans) target where (target->>'id')::bigint=s.log_id and (target->>'line')::integer=s.line_index))) then raise exception '기존 재고·원가·입력값 변경: 전체 롤백'; end if;
select sum(total_cost::bigint) into after_cost from inventory_cost_reporting_events where direction='out';
if after_cost-before_cost<>13000 then raise exception '순증 원가 오류: %',after_cost-before_cost; end if;
if (select sum(total_cost) from inventory_cost_reporting_events where reference_type='manual_service_cost')<>23400
or (select count(*) from inventory_cost_reporting_events where reference_type='manual_service_cost')<>21
or exists(select 1 from inventory_service_cost_reviews where kind='offset_review') then raise exception '수동 원장 대사 오류'; end if;
if (select sum((metadata->>'serviceAttributedCost')::bigint) from inventory_cost_reporting_events where metadata ? 'serviceAttributedCost')<>2000 then raise exception '기존 소진 중복 제외 오류'; end if;
report:=get_inventory_cost_integrity_report(1000);
if (report->>'stockMismatchCount')::integer<>0 or (report->>'layerMismatchCount')::integer<>0 or (report->>'outboundMismatchCount')::integer<>0 then raise exception '무결성 검증 실패'; end if;
end $apply$;
with actor as materialized(select set_config('request.jwt.claim.sub',(select id::text from users where oss_role='master' order by created_at limit 1),true))
select get_inventory_cost_integrity_report(1000)-'missingServiceLines' integrity,
(select count(*) from inventory_service_cost_reviews where kind='offset_review') pending_reviews,
(select sum(total_cost) from inventory_cost_reporting_events where reference_type='manual_service_cost') manual_service_cost,
(select sum((metadata->>'serviceAttributedCost')::bigint) from inventory_cost_reporting_events where metadata ? 'serviceAttributedCost') reattributed_cost from actor;
commit;
