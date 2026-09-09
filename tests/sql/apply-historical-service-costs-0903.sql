begin;
set local lock_timeout='10s'; set local statement_timeout='90s';
do $apply$
declare p jsonb; ctx jsonb; src uuid; lid uuid; outid uuid; new_layers uuid[]:='{}'; new_events uuid[]:='{}'; before_state jsonb; after_state jsonb; price int; quantity int; stamp timestamptz; report jsonb;
plans jsonb:='[{"basis":[{"event":"94682690-2ddb-4606-a719-07d9b358001d","id":"77386ab8-23ee-48fc-80b5-935ae597a3c1","price":2000,"q":85,"remaining":0}],"event_at":"2026-06-01T04:52:38.326807+00:00","id":"4453","item":"젤로 0.8 팟","line":"6","quantity":"1","snapshot":"3cfa0a07a08e02105294dc64aa3a0ac9"},{"basis":[{"event":"335f1d55-0185-4655-8b7f-52bd114ab847","id":"c050c3a3-cdb7-409a-b423-fc7c490069c2","price":3300,"q":47,"remaining":0}],"event_at":"2026-06-12T03:21:57.146451+00:00","id":"4755","item":"디오X 0.6 팟","line":"4","quantity":"1","snapshot":"91be87393ba0f52027c573e0a65115e1"},{"basis":[{"event":"a543f495-0b08-464a-b4de-8b3e7431c0cc","id":"6a2b9af9-1329-4c55-b515-dca742d36a1f","price":4950,"q":4,"remaining":0}],"event_at":"2026-07-06T12:20:04.227103+00:00","id":"5263","item":"발라리안맥스프로 투명케이스 신형","line":"4","quantity":"1","snapshot":"948177c88c86f6030769ef8e6b1b07d9"},{"basis":[{"event":"3c7432bd-334b-4001-999b-abc4110e7b6e","id":"64b0718a-51a1-458f-8ba6-8aa9c85ce12f","price":2000,"q":51,"remaining":0}],"event_at":"2026-07-13T06:19:43.616683+00:00","id":"5406","item":"발라리안 0.6 코일","line":"3","quantity":"1","snapshot":"c498f204d8d226e29edd7d4166f7d61f"},{"basis":[{"event":"7f52e3f5-e60f-4bd1-9871-42f1987dc017","id":"66ed0b19-5ee3-41d2-aa42-54d2dc2aae71","price":2750,"q":3,"remaining":0}],"event_at":"2026-07-15T04:26:02.097438+00:00","id":"5451","item":"젤로맥스 투명케이스","line":"4","quantity":"1","snapshot":"58c780781e81e7f5c704bd0230950a88"},{"basis":[{"event":"b4196a17-c375-466d-984d-cb8a7c3e3bba","id":"d8bffa68-0a2f-424e-9103-1805c8e7d729","price":2000,"q":133,"remaining":0}],"event_at":"2026-07-16T10:31:08.096308+00:00","id":"5494","item":"젤로맥스 0.6 팟","line":"5","quantity":"2","snapshot":"2548b034e2af57add05da3d69f056162"},{"basis":[{"event":"f2fcf72d-160c-4177-bfca-ca190187271e","id":"27288f61-3196-4e65-b890-ff669127d758","price":2000,"q":34,"remaining":0}],"event_at":"2026-07-20T04:24:26.860722+00:00","id":"5559","item":"젤로 1.2 팟","line":"5","quantity":"1","snapshot":"dd3381de05fbf9dcf571d77719e76dad"}]'::jsonb;
begin
perform set_config('request.jwt.claim.sub',(select id::text from users where oss_role='master' order by created_at limit 1),true);
lock table logs in share row exclusive mode; perform lock_inventory_cost_review(); lock table inventory_service_cost_links in share row exclusive mode;
before_state:=jsonb_build_object('stock',(select md5(coalesce(jsonb_agg(to_jsonb(b) order by item_name)::text,'')) from inventory_balances b),'layers',(select md5(coalesce(jsonb_agg(to_jsonb(l) order by id)::text,'')) from inventory_cost_layers l where not(l.id=any(new_layers))),'events',(select md5(coalesce(jsonb_agg(to_jsonb(e) order by id)::text,'')) from inventory_cost_events e where not(e.id=any(new_events))),'allocations',(select md5(coalesce(jsonb_agg(to_jsonb(a) order by id)::text,'')) from inventory_cost_allocations a where not(a.outbound_event_id=any(new_events))));
for p in select value from jsonb_array_elements(plans) loop
ctx:=get_service_cost_link_context((p->>'id')::bigint,(p->>'line')::int);
if ctx->>'snapshot' is distinct from p->>'snapshot' then raise exception '원가 기준 변경: %',p->>'id'; end if;
if jsonb_array_length(p->'basis')<>1 or (p->'basis'->0->>'price')::int<=0 then raise exception '단일 단가 근거 없음'; end if;
if exists(select 1 from inventory_service_cost_links where log_id=(p->>'id')::bigint and line_index=(p->>'line')::int) then raise exception '이미 연결됨'; end if;
end loop;
for p in select value from jsonb_array_elements(plans) loop
price:=(p->'basis'->0->>'price')::int; quantity:=(p->>'quantity')::int; stamp:=(p->>'event_at')::timestamptz;
if stamp>='2026-07-22 00:00:00+09' then raise exception '과거 구간 아님'; end if;
src:=create_inventory_cost_layer('opening',stamp-interval '1 microsecond',null,p->>'item',quantity,price,'confirmed','front','historical_service_correction',p->>'id',p->>'line',null,
jsonb_build_object('historicalServiceCorrection',true,'basisType','historical','basisLayerId',p->'basis'->0->>'id','reason','사용자 승인: 기존 과거 단일 원가 기준으로 서비스 누락분 보완. 현재 재고와 기존 판매 원가 변경 없음.','serviceLogId',p->>'id','serviceLine',p->>'line'));
select id into strict lid from inventory_cost_layers where source_event_id=src;
outid:=allocate_inventory_cost_fifo('service_out',stamp,null,p->>'item',quantity,'stamp_log',p->>'id',p->>'line','none',jsonb_build_object('historicalServiceCorrection',true,'basisLayerId',p->'basis'->0->>'id','reason','과거 서비스 누락 원가 반영','sourceCorrectionEvent',src));
new_layers:=array_append(new_layers,lid); new_events:=new_events||array[src,outid];
if (select remaining_quantity from inventory_cost_layers where id=lid)<>0 or (select total_cost from inventory_cost_events where id=outid)<>quantity*price
or exists(select 1 from inventory_cost_allocations where outbound_event_id=outid and source_layer_id<>lid) then raise exception '과거 원가 격리 실패'; end if;
end loop;
after_state:=jsonb_build_object('stock',(select md5(coalesce(jsonb_agg(to_jsonb(b) order by item_name)::text,'')) from inventory_balances b),'layers',(select md5(coalesce(jsonb_agg(to_jsonb(l) order by id)::text,'')) from inventory_cost_layers l where not(l.id=any(new_layers))),'events',(select md5(coalesce(jsonb_agg(to_jsonb(e) order by id)::text,'')) from inventory_cost_events e where not(e.id=any(new_events))),'allocations',(select md5(coalesce(jsonb_agg(to_jsonb(a) order by id)::text,'')) from inventory_cost_allocations a where not(a.outbound_event_id=any(new_events))));
if before_state is distinct from after_state then raise exception '기존 재고/층/출고 원본 변경. 전체 롤백'; end if;
report:=get_inventory_cost_integrity_report(1000);
if (report->>'stockMismatchCount')::int<>0 or (report->>'layerMismatchCount')::int<>0 or (report->>'outboundMismatchCount')::int<>0 then raise exception '무결성 검증 실패'; end if;
end $apply$;
with actor as materialized(select set_config('request.jwt.claim.sub',(select id::text from users where oss_role='master' order by created_at limit 1),true))
select get_inventory_cost_integrity_report(1000)-'missingServiceLines' integrity,(select sum(total_cost) from inventory_cost_events where event_type='service_out' and metadata->>'historicalServiceCorrection'='true') historical_service_cost from actor;
commit;
