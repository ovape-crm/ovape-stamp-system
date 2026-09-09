begin;
set local lock_timeout='10s';
set local statement_timeout='90s';
do $undo$
declare r record; ctx jsonb; before_state jsonb; after_state jsonb; n integer:=0;
begin
perform set_config('request.jwt.claim.sub',(select id::text from public.users where oss_role='master' order by created_at limit 1),true);
lock table public.logs in share row exclusive mode;
perform public.lock_inventory_cost_review();
lock table public.inventory_service_cost_links in share row exclusive mode;
before_state:=jsonb_build_object('stock',(select md5(jsonb_agg(to_jsonb(b) order by item_name)::text) from public.inventory_balances b),'events',(select md5(jsonb_agg(to_jsonb(e) order by id)::text) from public.inventory_cost_events e),'layers',(select md5(jsonb_agg(to_jsonb(l) order by id)::text) from public.inventory_cost_layers l),'allocations',(select md5(jsonb_agg(to_jsonb(a) order by id)::text) from public.inventory_cost_allocations a));
for r in select distinct s.log_id,s.line_index from public.inventory_service_cost_links s
join jsonb_to_recordset('[{"id":"5725","line":4},{"id":"5735","line":4},{"id":"5779","line":3},{"id":"5822","line":4},{"id":"5822","line":5},{"id":"6071","line":2},{"id":"6111","line":4},{"id":"6118","line":5},{"id":"6195","line":6},{"id":"6208","line":5},{"id":"6270","line":6},{"id":"6270","line":7},{"id":"6430","line":3},{"id":"6504","line":6},{"id":"4453","line":6},{"id":"4593","line":6},{"id":"4755","line":4},{"id":"4961","line":6},{"id":"4984","line":2},{"id":"5255","line":2},{"id":"5263","line":4},{"id":"5406","line":3},{"id":"5451","line":4},{"id":"5494","line":5},{"id":"5559","line":5},{"id":"5603","line":4},{"id":"5613","line":4},{"id":"5655","line":3},{"id":"5737","line":6},{"id":"5756","line":3},{"id":"5834","line":2},{"id":"5993","line":5},{"id":"5676","line":2},{"id":"6423","line":3},{"id":"6443","line":3},{"id":"6476","line":5},{"id":"6480","line":5},{"id":"6592","line":5},{"id":"6594","line":3},{"id":"6617","line":6},{"id":"6754","line":6}]'::jsonb) t(id text,line integer) on s.log_id=t.id::bigint and s.line_index=t.line
loop
ctx:=public.get_service_cost_link_context(r.log_id,r.line_index);
perform public.save_service_cost_links(r.log_id,r.line_index,ctx->>'snapshot','[]'::jsonb,'사용자 요청: 과거 서비스 41건 전체 재대조를 위해 기존 연결 취소. 재고·원가층·소진 원본 유지.');
n:=n+1;
end loop;
after_state:=jsonb_build_object('stock',(select md5(jsonb_agg(to_jsonb(b) order by item_name)::text) from public.inventory_balances b),'events',(select md5(jsonb_agg(to_jsonb(e) order by id)::text) from public.inventory_cost_events e),'layers',(select md5(jsonb_agg(to_jsonb(l) order by id)::text) from public.inventory_cost_layers l),'allocations',(select md5(jsonb_agg(to_jsonb(a) order by id)::text) from public.inventory_cost_allocations a));
if before_state is distinct from after_state then raise exception '원본 변경 감지: 전체 취소 롤백'; end if;
raise notice 'Unlinked % service lines; inventory/cost fingerprints unchanged',n;
end $undo$;
commit;
with actor as materialized(select set_config('request.jwt.claim.sub',(select id::text from public.users where oss_role='master' order by created_at limit 1),true))
select public.get_inventory_cost_integrity_report(1000)-'missingServiceLines' integrity,(select count(*) from public.inventory_service_cost_links) remaining_links from actor;

