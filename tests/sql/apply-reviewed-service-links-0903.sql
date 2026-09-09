-- Explicit user-authorized inferred attribution of existing consumption, not new consumption.
-- Fails atomically if any reviewed source changed. Never refresh an external change silently.
begin;
set local lock_timeout='10s';
set local statement_timeout='60s';
do $batch$
declare row_data jsonb; ctx jsonb; before_state jsonb; after_state jsonb;
  plans jsonb:='[{"id":"5725","line":4,"name":"젤로 투명케이스","at":"2026-07-27T03:39:40.695752+00:00","q":1,"price":2750,"links":[{"allocation_id":"3b1dbd23-b65c-4176-8177-79a34b36ecfb","quantity":1}],"snapshot":"6dc93ae237e3c3316f61315231329e79","note":"사용자 요청에 따른 추정 연결: 주변 판매 원가 2750원과 출고일 이전 입고층의 기존 소진 단가가 일치. 실제 소진 수량 범위 내 연결, 실재고·원가층 재차감 없음."},{"id":"5735","line":4,"name":"젤로 투명케이스","at":"2026-07-27T09:08:45.556784+00:00","q":1,"price":2750,"links":[{"allocation_id":"3b1dbd23-b65c-4176-8177-79a34b36ecfb","quantity":1}],"snapshot":"20980a2138b6da251fc7021ec74eef83","note":"사용자 요청에 따른 추정 연결: 주변 판매 원가 2750원과 출고일 이전 입고층의 기존 소진 단가가 일치. 실제 소진 수량 범위 내 연결, 실재고·원가층 재차감 없음."},{"id":"5779","line":3,"name":"젤로 투명케이스","at":"2026-07-29T02:19:54.44162+00:00","q":1,"price":2750,"links":[{"allocation_id":"3b1dbd23-b65c-4176-8177-79a34b36ecfb","quantity":1}],"snapshot":"ff6ef3dcc7b7db21bd17002dd9e83269","note":"사용자 요청에 따른 추정 연결: 주변 판매 원가 2750원과 출고일 이전 입고층의 기존 소진 단가가 일치. 실제 소진 수량 범위 내 연결, 실재고·원가층 재차감 없음."},{"id":"5822","line":4,"name":"말론S 0.6 팟","at":"2026-07-30T06:23:51.365844+00:00","q":2,"price":3600,"links":[{"allocation_id":"da303181-3cbf-42b3-a2b4-afb15598920c","quantity":2}],"snapshot":"9d21c008171176d60aab42de57118190","note":"사용자 요청에 따른 추정 연결: 주변 판매 원가 3600원과 출고일 이전 입고층의 기존 소진 단가가 일치. 실제 소진 수량 범위 내 연결, 실재고·원가층 재차감 없음."},{"id":"5822","line":5,"name":"말론S 투명케이스","at":"2026-07-30T06:23:51.365844+00:00","q":1,"price":4400,"links":[{"allocation_id":"7c9d5caf-2004-4af6-a3a1-5b928bd23374","quantity":1}],"snapshot":"1869b1936cb1328cd275c10999223cdc","note":"사용자 요청에 따른 추정 연결: 주변 판매 원가 4400원과 출고일 이전 입고층의 기존 소진 단가가 일치. 실제 소진 수량 범위 내 연결, 실재고·원가층 재차감 없음."},{"id":"6071","line":2,"name":"디오X 투명케이스","at":"2026-08-08T02:48:52.77137+00:00","q":1,"price":2750,"links":[{"allocation_id":"bb3b9476-16b9-4c13-88c2-37cc95ce44c4","quantity":1}],"snapshot":"ae8359561a545484b27638a6988ac855","note":"사용자 요청에 따른 추정 연결: 주변 판매 원가 2750원과 출고일 이전 입고층의 기존 소진 단가가 일치. 실제 소진 수량 범위 내 연결, 실재고·원가층 재차감 없음."},{"id":"6111","line":4,"name":"젤로 0.8 부스트팟","at":"2026-08-10T02:12:51.746865+00:00","q":1,"price":2000,"links":[{"allocation_id":"ac39fb9b-94d8-48c7-b107-6d83f00f249c","quantity":1}],"snapshot":"39e60800dd58c639002320b59aefdfd5","note":"사용자 요청에 따른 추정 연결: 주변 판매 원가 2000원과 출고일 이전 입고층의 기존 소진 단가가 일치. 실제 소진 수량 범위 내 연결, 실재고·원가층 재차감 없음."},{"id":"6118","line":5,"name":"아보카도 aio 0.6 팟","at":"2026-08-10T04:51:32.678713+00:00","q":1,"price":2970,"links":[{"allocation_id":"065bbfe1-ad6d-4754-b3bf-d654dbaebdcf","quantity":1}],"snapshot":"5e1f3e2db37352454f1f3a9b86c4904c","note":"사용자 요청에 따른 추정 연결: 주변 판매 원가 2970원과 출고일 이전 입고층의 기존 소진 단가가 일치. 실제 소진 수량 범위 내 연결, 실재고·원가층 재차감 없음."},{"id":"6195","line":6,"name":"발라리안맥스프로 투명케이스 신형","at":"2026-08-12T08:00:56.839204+00:00","q":1,"price":4950,"links":[{"allocation_id":"8a4f22f1-5833-448b-8102-de2d8be0b5f6","quantity":1}],"snapshot":"d9cf8edcd0698f2e5fa84d259635e565","note":"사용자 요청에 따른 추정 연결: 주변 판매 원가 4950원과 출고일 이전 입고층의 기존 소진 단가가 일치. 실제 소진 수량 범위 내 연결, 실재고·원가층 재차감 없음."},{"id":"6208","line":5,"name":"발라리안맥스프로 투명케이스 신형","at":"2026-08-12T13:13:36.281883+00:00","q":1,"price":4950,"links":[{"allocation_id":"817a8d9b-6725-4e51-a120-c64c6a4abed2","quantity":1}],"snapshot":"378ae0e70a32cf2bfd9e7e2eaacb4f04","note":"사용자 요청에 따른 추정 연결: 주변 판매 원가 4950원과 출고일 이전 입고층의 기존 소진 단가가 일치. 실제 소진 수량 범위 내 연결, 실재고·원가층 재차감 없음."},{"id":"6270","line":6,"name":"하복 공팟 클리어","at":"2026-08-14T03:52:27.928822+00:00","q":1,"price":3000,"links":[{"allocation_id":"ee726f98-e0b9-4ca6-ace2-e6b8876e6a6c","quantity":1}],"snapshot":"24b08048b29bdc2d10c6f00991c6b025","note":"사용자 요청에 따른 추정 연결: 주변 판매 원가 3000원과 출고일 이전 입고층의 기존 소진 단가가 일치. 실제 소진 수량 범위 내 연결, 실재고·원가층 재차감 없음."},{"id":"6270","line":7,"name":"하복 0.6 코일","at":"2026-08-14T03:52:27.928822+00:00","q":1,"price":2000,"links":[{"allocation_id":"a8c3b69a-cadc-448d-bc49-4c9d77fa1b25","quantity":1}],"snapshot":"71623d5731f5c2aa91edec1fe8a335b2","note":"사용자 요청에 따른 추정 연결: 주변 판매 원가 2000원과 출고일 이전 입고층의 기존 소진 단가가 일치. 실제 소진 수량 범위 내 연결, 실재고·원가층 재차감 없음."},{"id":"6430","line":3,"name":"디오X 투명케이스","at":"2026-08-18T02:42:13.104219+00:00","q":1,"price":2750,"links":[{"allocation_id":"bb3b9476-16b9-4c13-88c2-37cc95ce44c4","quantity":1}],"snapshot":"cbf77a37fb6bc210cc18792c4d38866c","note":"사용자 요청에 따른 추정 연결: 주변 판매 원가 2750원과 출고일 이전 입고층의 기존 소진 단가가 일치. 실제 소진 수량 범위 내 연결, 실재고·원가층 재차감 없음."},{"id":"6504","line":6,"name":"말론S 투명케이스","at":"2026-08-21T07:21:50.47435+00:00","q":1,"price":4400,"links":[{"allocation_id":"7c9d5caf-2004-4af6-a3a1-5b928bd23374","quantity":1}],"snapshot":"5d39c56739d0558773b4aabb9363e7ac","note":"사용자 요청에 따른 추정 연결: 주변 판매 원가 4400원과 출고일 이전 입고층의 기존 소진 단가가 일치. 실제 소진 수량 범위 내 연결, 실재고·원가층 재차감 없음."}]'::jsonb;
begin
  perform set_config('request.jwt.claim.sub',(select id::text from public.users where oss_role='master' order by created_at limit 1),true);
  lock table public.logs in share row exclusive mode;
  perform public.lock_inventory_cost_review();
  lock table public.inventory_service_cost_links in share row exclusive mode;
  before_state:=jsonb_build_object(
 'stock',(select md5(coalesce(jsonb_agg(to_jsonb(b) order by item_name)::text,'')) from public.inventory_balances b),
 'events',(select md5(coalesce(jsonb_agg(to_jsonb(e) order by id)::text,'')) from public.inventory_cost_events e),
 'layers',(select md5(coalesce(jsonb_agg(to_jsonb(l) order by id)::text,'')) from public.inventory_cost_layers l),
 'allocations',(select md5(coalesce(jsonb_agg(to_jsonb(a) order by id)::text,'')) from public.inventory_cost_allocations a)
);
  for row_data in select value from jsonb_array_elements(plans) loop
    ctx:=public.get_service_cost_link_context((row_data->>'id')::bigint,(row_data->>'line')::integer);
    if ctx->>'snapshot' is distinct from row_data->>'snapshot' then raise exception 'Reviewed source changed: %/%',row_data->>'id',row_data->>'line'; end if;
  end loop;
  for row_data in select value from jsonb_array_elements(plans) loop
    -- Only our own preceding links can have changed the snapshot under these locks.
    ctx:=public.get_service_cost_link_context((row_data->>'id')::bigint,(row_data->>'line')::integer);
    perform public.save_service_cost_links((row_data->>'id')::bigint,(row_data->>'line')::integer,ctx->>'snapshot',row_data->'links',row_data->>'note');
  end loop;
  after_state:=jsonb_build_object(
 'stock',(select md5(coalesce(jsonb_agg(to_jsonb(b) order by item_name)::text,'')) from public.inventory_balances b),
 'events',(select md5(coalesce(jsonb_agg(to_jsonb(e) order by id)::text,'')) from public.inventory_cost_events e),
 'layers',(select md5(coalesce(jsonb_agg(to_jsonb(l) order by id)::text,'')) from public.inventory_cost_layers l),
 'allocations',(select md5(coalesce(jsonb_agg(to_jsonb(a) order by id)::text,'')) from public.inventory_cost_allocations a)
);
  if before_state is distinct from after_state then raise exception 'Inventory/cost source changed. Entire attribution batch rolled back.'; end if;
end $batch$;
commit;
with actor as materialized(select set_config('request.jwt.claim.sub',(select id::text from public.users where oss_role='master' order by created_at limit 1),true))
select public.get_inventory_cost_integrity_report(1000)-'missingServiceLines' integrity,
 (select count(distinct(log_id,line_index)) from public.inventory_service_cost_links) linked_lines,
 (select sum(s.quantity*a.unit_cost) from public.inventory_service_cost_links s join public.inventory_cost_allocations a on a.id=s.allocation_id) attributed_cost
from actor;

