-- Reviewed one-shot repair. Abort on stale state; no inventory balance or layer changes.
begin;
set local lock_timeout='10s';
set local statement_timeout='90s';
do $repair$
declare
plans jsonb:='[{"at":"2026-07-23T05:24:21.184571+00:00","id":5655,"line":3,"q":1,"ref":"5655","key":"3","isService":true,"after":[{"layer":"6b71a544-26f8-429a-b836-029794910ab6","q":1,"price":3300}],"beforeCost":0,"afterCost":3300},{"alloc":[{"id":"c63669a5-c2b2-4932-87ee-3c6a14f46acb","layer":"0f310171-0782-45a9-b31b-84bebef2a628","price":3300,"q":1},{"id":"20261afe-9f4c-4139-83b9-a5203da6d2ec","layer":"6b71a544-26f8-429a-b836-029794910ab6","price":3300,"q":2}],"at":"2026-08-04T02:01:49.677725+00:00","id":"ebba4fc7-0ef4-4b78-94ee-8264afbf0d5b","key":"5","q":3,"ref":"5964","type":"sale_out","isService":false,"after":[{"layer":"6b71a544-26f8-429a-b836-029794910ab6","q":1,"price":3300},{"layer":"0f310171-0782-45a9-b31b-84bebef2a628","q":2,"price":3300}],"beforeCost":9900,"afterCost":9900},{"alloc":[{"id":"b124fa35-309e-4c59-8a16-a6fd40791aba","layer":"0f310171-0782-45a9-b31b-84bebef2a628","price":3300,"q":3}],"at":"2026-08-11T03:24:06.968463+00:00","id":"804364ef-be6f-4bc1-ac2e-8d96b1b5f93b","key":"1","q":3,"ref":"6154","type":"sale_out","isService":false,"after":[{"layer":"0f310171-0782-45a9-b31b-84bebef2a628","q":2,"price":3300},{"layer":"f39ba022-7e21-4901-9f1a-a93bfbf40f84","q":1,"price":3300}],"beforeCost":9900,"afterCost":9900},{"at":"2026-08-18T09:33:47.283531+00:00","id":6443,"line":3,"q":1,"ref":"6443","key":"3","isService":true,"after":[{"layer":"f39ba022-7e21-4901-9f1a-a93bfbf40f84","q":1,"price":3300}],"beforeCost":0,"afterCost":3300},{"alloc":[{"id":"4d2225d5-7308-4ea8-af6d-848e499d9084","layer":"f39ba022-7e21-4901-9f1a-a93bfbf40f84","price":3300,"q":3}],"at":"2026-08-25T05:41:02.474048+00:00","id":"76b54960-f250-4981-b9e7-fee1037f2e17","key":"3","q":3,"ref":"6603","type":"sale_out","isService":false,"after":[{"layer":"f39ba022-7e21-4901-9f1a-a93bfbf40f84","q":1,"price":3300},{"layer":"8c75d088-6721-4836-90fc-77cdcc66ffff","q":2,"price":3300}],"beforeCost":9900,"afterCost":9900}]'::jsonb;
p jsonb; plan_alloc jsonb; before_alloc jsonb; eid uuid; new_events uuid[]:='{}';
changed uuid[]:=array['ebba4fc7-0ef4-4b78-94ee-8264afbf0d5b','804364ef-be6f-4bc1-ac2e-8d96b1b5f93b','76b54960-f250-4981-b9e7-fee1037f2e17','df8df0c9-3864-44be-8e48-b38a095eee69']::uuid[];
before_state jsonb; after_state jsonb; before_total bigint; after_total bigint; report jsonb;
begin
perform set_config('request.jwt.claim.sub',(select id::text from users where oss_role='master' order by created_at limit 1),true);
lock table logs in share row exclusive mode;
perform lock_inventory_cost_review();
lock table inventory_service_cost_links in share row exclusive mode;
if md5(inventory_cost_review_snapshot('디오X 0.6 팟')::text)<>'0b0f3128698dfc7b032d21558bfb78c4' then raise exception '디오X 원본 변경: 재검증 필요'; end if;
if exists(select 1 from after_service_outbound_cost_allocations s join inventory_cost_allocations a on a.id=s.cost_allocation_id where a.outbound_event_id=any(changed))
or exists(select 1 from inventory_cost_events e where e.metadata::text like '%5964%' or e.metadata::text like '%6154%' or e.metadata::text like '%6603%')
or exists(select 1 from inventory_service_cost_links where log_id in (5655,6443)) then raise exception '연결된 후속 원가 존재'; end if;
before_state:=jsonb_build_object(
'stock',(select md5(jsonb_agg(to_jsonb(b) order by item_name)::text) from inventory_balances b),
'layers',(select md5(jsonb_agg(to_jsonb(l) order by id)::text) from inventory_cost_layers l),
'events',(select md5(jsonb_agg(to_jsonb(e) order by id)::text) from inventory_cost_events e where not(id=any(changed))),
'alloc',(select md5(jsonb_agg(to_jsonb(a) order by id)::text) from inventory_cost_allocations a where not(outbound_event_id=any(changed))));
select sum(total_cost) into before_total from inventory_cost_events where item_name='디오X 0.6 팟' and direction='out' and metadata->>'restoredAt' is null;
for p in select value from jsonb_array_elements(plans) loop
if (p->>'isService')::boolean then
if exists(select 1 from inventory_cost_events where reference_type='stamp_log' and reference_id=p->>'ref' and reference_line_key=p->>'key' and direction='out') then raise exception '서비스 이미 처리됨'; end if;
insert into inventory_cost_events(event_type,event_at,item_name,direction,quantity,total_cost,reference_type,reference_id,reference_line_key,settlement_effect,metadata,created_by)
values('service_out',(p->>'at')::timestamptz,'디오X 0.6 팟','out',1,3300,'stamp_log',p->>'ref',p->>'key','none',
jsonb_build_object('serviceFifoCorrection0903',true,'reason','기존 수동 소진을 실제 서비스 원가로 전환. 전체 FIFO 재대조, 재고 및 판매원가 금액 불변.','replacedReconciliationEvent','df8df0c9-3864-44be-8e48-b38a095eee69'),auth.uid()) returning id into eid;
new_events:=array_append(new_events,eid);
else
eid:=(p->>'id')::uuid;
select jsonb_agg(to_jsonb(x) order by id) into before_alloc from inventory_cost_allocations x where outbound_event_id=eid;
update inventory_cost_events set metadata=metadata||jsonb_build_object('serviceFifoCorrection0903',true,'correctedAt',now(),'allocationsBeforeCorrection',before_alloc,'allocationsAfterCorrection',p->'after') where id=eid;
end if;
for plan_alloc in select value from jsonb_array_elements(p->'after') loop
insert into inventory_cost_allocations(outbound_event_id,source_layer_id,quantity,unit_cost)
values(eid,(plan_alloc->>'layer')::uuid,(plan_alloc->>'q')::int,(plan_alloc->>'price')::int)
on conflict(outbound_event_id,source_layer_id) do update set quantity=excluded.quantity;
end loop;
if exists(select 1 from inventory_cost_allocations x where x.outbound_event_id=eid and not exists(select 1 from jsonb_array_elements(p->'after') z where (z->>'layer')::uuid=x.source_layer_id)) then raise exception '예상 외 배정'; end if;
end loop;
update inventory_cost_events set metadata=metadata||jsonb_build_object('restoredAt',now(),'restoredReason','누락 서비스 5655/3, 6443/3 FIFO 원가 6,600원으로 대체. 수동 소진 중복 제거.','serviceFifoCorrection0903',true,'replacementServiceEvents',to_jsonb(new_events))
where id='df8df0c9-3864-44be-8e48-b38a095eee69';
-- Net source consumption must be EXACTLY unchanged; do not rewrite layer balances.
if exists(select 1 from inventory_cost_layers l where l.item_name='디오X 0.6 팟' and l.original_quantity-l.remaining_quantity<>(select coalesce(sum(a.quantity),0) from inventory_cost_allocations a join inventory_cost_events e on e.id=a.outbound_event_id where a.source_layer_id=l.id and e.metadata->>'restoredAt' is null)) then raise exception '층별 사용량 불일치'; end if;
if exists(select 1 from inventory_cost_allocations a join inventory_cost_events e on e.id=a.outbound_event_id join inventory_cost_layers l on l.id=a.source_layer_id join inventory_cost_events src on src.id=l.source_event_id where (e.id=any(new_events) or (e.id=any(changed) and e.event_type='sale_out')) and (src.event_at>e.event_at or a.unit_cost is distinct from l.unit_cost)) then raise exception '미래 입고 또는 단가 불일치'; end if;
select sum(total_cost) into after_total from inventory_cost_events where item_name='디오X 0.6 팟' and direction='out' and metadata->>'restoredAt' is null;
if before_total is distinct from after_total then raise exception '전체 원가 금액 변동'; end if;
after_state:=jsonb_build_object(
'stock',(select md5(jsonb_agg(to_jsonb(b) order by item_name)::text) from inventory_balances b),
'layers',(select md5(jsonb_agg(to_jsonb(l) order by id)::text) from inventory_cost_layers l),
'events',(select md5(jsonb_agg(to_jsonb(e) order by id)::text) from inventory_cost_events e where not(id=any(changed)) and not(id=any(new_events))),
'alloc',(select md5(jsonb_agg(to_jsonb(a) order by id)::text) from inventory_cost_allocations a where not(outbound_event_id=any(changed)) and not(outbound_event_id=any(new_events))));
if before_state is distinct from after_state then raise exception '범위 밖 원본 변경'; end if;
if exists(select 1 from inventory_cost_events where id=any(changed) and event_type='sale_out' and total_cost<>9900) then raise exception '판매원가 변동'; end if;
report:=get_inventory_cost_integrity_report(1000);
if (report->>'stockMismatchCount')::int<>0 or (report->>'layerMismatchCount')::int<>0 or (report->>'outboundMismatchCount')::int<>0 then raise exception '무결성 검사 실패: %',report; end if;
end $repair$;
with actor as materialized(select set_config('request.jwt.claim.sub',(select id::text from users where oss_role='master' order by created_at limit 1),true))
select get_inventory_cost_integrity_report(1000)-'missingServiceLines' integrity,
(select sum(total_cost) from inventory_cost_events where event_type='service_out' and metadata->>'serviceFifoCorrection0903'='true') service_cost from actor;
commit;
