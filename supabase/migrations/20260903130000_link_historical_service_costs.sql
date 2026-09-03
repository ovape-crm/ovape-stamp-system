-- Attribute already consumed costs; never consume stock/layers again.
create table public.inventory_service_cost_links (
  log_id bigint not null references public.logs(id),
  line_index integer not null check(line_index > 0),
  allocation_id uuid not null references public.inventory_cost_allocations(id),
  quantity integer not null check(quantity > 0),
  primary key(log_id,line_index,allocation_id)
);
create index on public.inventory_service_cost_links(allocation_id);
create table public.inventory_service_cost_link_audit (
  id uuid primary key default gen_random_uuid(),
  log_id bigint not null, line_index integer not null,
  before_links jsonb not null, after_links jsonb not null,
  note text not null, created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.inventory_service_cost_links enable row level security;
alter table public.inventory_service_cost_link_audit enable row level security;
revoke all on public.inventory_service_cost_links,public.inventory_service_cost_link_audit from public,anon,authenticated;
grant select on public.inventory_service_cost_links,public.inventory_service_cost_link_audit to authenticated;
create policy "master reads service cost links" on public.inventory_service_cost_links for select to authenticated
using(exists(select 1 from public.users where id=auth.uid() and oss_role='master'));
create policy "master reads service link audit" on public.inventory_service_cost_link_audit for select to authenticated
using(exists(select 1 from public.users where id=auth.uid() and oss_role='master'));

create or replace function public.get_service_cost_link_context(p_log_id bigint,p_line_index integer)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_log public.logs%rowtype; v_item jsonb; v_name text; v_result jsonb; v_snapshot jsonb;
begin
  if not exists(select 1 from public.users where id=auth.uid() and oss_role='master') then raise exception 'MASTER_REQUIRED'; end if;
  select * into v_log from public.logs where id=p_log_id;
  v_item:=v_log.jsonb->'items'->(p_line_index-1); v_name:=btrim(v_item->>'itemName');
  if p_line_index is null or p_line_index<1 or v_item is null or v_log.category<>'stamp'
    or btrim(coalesce(v_item->>'remark','')) !~ '^서비스($|[,\s(])'
    or btrim(coalesce(v_item->>'inventoryAction','')) not in ('','out')
    or coalesce((v_item->>'quantity')::integer,0)<=0 or not public.is_inventory_item_tracked(v_name)
    then raise exception '서비스 출고 원본을 확인할 수 없습니다.'; end if;
  if exists(select 1 from public.inventory_cost_events where reference_type='stamp_log' and reference_id=p_log_id::text and reference_line_key=p_line_index::text)
    then raise exception '이미 원가가 배정된 출고입니다.'; end if;
  select jsonb_build_object('item',v_item,'at',v_log.created_at,
    'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.id) from public.inventory_cost_events e where e.item_name=v_name),'[]'::jsonb),
    'layers',coalesce((select jsonb_agg(to_jsonb(l) order by l.id) from public.inventory_cost_layers l where l.item_name=v_name),'[]'::jsonb),
    'allocations',coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from public.inventory_cost_allocations a join public.inventory_cost_events e on e.id=a.outbound_event_id where e.item_name=v_name),'[]'::jsonb),
    'links',coalesce((select jsonb_agg(to_jsonb(s) order by s.log_id,s.line_index,s.allocation_id) from public.inventory_service_cost_links s join public.inventory_cost_allocations a on a.id=s.allocation_id join public.inventory_cost_events e on e.id=a.outbound_event_id where e.item_name=v_name),'[]'::jsonb)
  ) into v_snapshot;
  with nearby as (
    (select e.*,'before'::text position from public.inventory_cost_events e where e.item_name=v_name and e.event_at<=v_log.created_at order by e.event_at desc,e.id desc limit 5)
    union all
    (select e.*,'after'::text position from public.inventory_cost_events e where e.item_name=v_name and e.event_at>v_log.created_at order by e.event_at,e.id limit 5)
  ), candidates as (
    select a.id allocation_id,a.source_layer_id,a.unit_cost,a.quantity consumed_quantity,
      a.quantity-coalesce((select sum(s.quantity) from public.inventory_service_cost_links s where s.allocation_id=a.id and (s.log_id,s.line_index)<>(p_log_id,p_line_index)),0) available_quantity,
      coalesce((select s.quantity from public.inventory_service_cost_links s where s.allocation_id=a.id and s.log_id=p_log_id and s.line_index=p_line_index),0) linked_quantity,
      e.event_at consumed_at,e.metadata->>'note' note,src.event_at received_at,src.event_type source_type,src.reference_id source_reference,
      src.event_at<=v_log.created_at eligible
    from public.inventory_cost_allocations a join public.inventory_cost_events e on e.id=a.outbound_event_id
    join public.inventory_cost_layers l on l.id=a.source_layer_id join public.inventory_cost_events src on src.id=l.source_event_id
    where e.item_name=v_name and l.item_name=v_name and e.event_type='reconciliation_out' and e.reference_type='cost_reconciliation'
      and e.direction='out' and e.settlement_effect='none' and e.metadata->>'restoredAt' is null
  )
  select jsonb_build_object('log_id',p_log_id::text,'line_index',p_line_index,'item_name',v_name,'event_at',v_log.created_at,'quantity',(v_item->>'quantity')::integer,
    'snapshot',md5(v_snapshot::text),
    'nearby',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'position',e.position,'event_at',e.event_at,'event_type',e.event_type,'quantity',e.quantity,'total_cost',e.total_cost,'reference',e.reference_id,
      'allocations',coalesce((select jsonb_agg(jsonb_build_object('quantity',a.quantity,'unit_cost',a.unit_cost,'received_at',src.event_at,'source_layer_id',l.id) order by l.queue_sequence,l.id) from public.inventory_cost_allocations a join public.inventory_cost_layers l on l.id=a.source_layer_id join public.inventory_cost_events src on src.id=l.source_event_id where a.outbound_event_id=e.id),'[]'::jsonb)) order by e.event_at,e.id) from nearby e),'[]'::jsonb),
    'candidates',coalesce((select jsonb_agg(to_jsonb(c) order by c.received_at,c.allocation_id) from candidates c),'[]'::jsonb),
    'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at desc,h.id) from public.inventory_service_cost_link_audit h where h.log_id=p_log_id and h.line_index=p_line_index),'[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

create or replace function public.save_service_cost_links(p_log_id bigint,p_line_index integer,p_snapshot text,p_links jsonb,p_note text)
returns void language plpgsql security definer set search_path=public as $$
declare v_context jsonb; v_before jsonb; v_after jsonb; v_entry jsonb; v_candidate jsonb; v_total bigint:=0; v_id uuid; v_qty integer;
begin
  if not exists(select 1 from public.users where id=auth.uid() and oss_role='master') then raise exception 'MASTER_REQUIRED'; end if;
  if coalesce(length(btrim(p_note)),0)<2 then raise exception '연결 또는 수정 사유를 입력해 주세요.'; end if;
  if p_links is null or jsonb_typeof(p_links)<>'array' then raise exception '연결 목록이 올바르지 않습니다.'; end if;
  -- Same order as a log writer: lock logs before inventory; all steps roll back on failure.
  lock table public.logs in share row exclusive mode;
  perform public.lock_inventory_cost_review();
  lock table public.inventory_service_cost_links in share row exclusive mode;
  v_context:=public.get_service_cost_link_context(p_log_id,p_line_index);
  if p_snapshot is distinct from v_context->>'snapshot' then raise exception '확인 중 원본이 변경됐습니다. 다시 조회해 주세요.'; end if;
  if (select count(*)<>count(distinct x->>'allocation_id') from jsonb_array_elements(p_links) x) then raise exception '같은 소진 기록을 중복 선택할 수 없습니다.'; end if;
  for v_entry in select value from jsonb_array_elements(p_links) loop
    v_id:=(v_entry->>'allocation_id')::uuid; v_qty:=(v_entry->>'quantity')::integer;
    select c into v_candidate from jsonb_array_elements(v_context->'candidates') c where c->>'allocation_id'=v_id::text;
    if v_candidate is null or not (v_candidate->>'eligible')::boolean or v_qty is null or v_qty<=0
      or v_qty>(v_candidate->>'available_quantity')::integer then raise exception '입고일 또는 소진 기록의 연결 가능 수량을 확인해 주세요.'; end if;
    v_total:=v_total+v_qty;
  end loop;
  if jsonb_array_length(p_links)>0 and v_total<>(v_context->>'quantity')::integer then raise exception '연결 수량은 서비스 출고 수량과 같아야 합니다.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('allocation_id',s.allocation_id,'quantity',s.quantity,'unit_cost',a.unit_cost,'source_layer_id',a.source_layer_id) order by s.allocation_id),'[]'::jsonb)
    into v_before from public.inventory_service_cost_links s join public.inventory_cost_allocations a on a.id=s.allocation_id where s.log_id=p_log_id and s.line_index=p_line_index;
  delete from public.inventory_service_cost_links where log_id=p_log_id and line_index=p_line_index;
  insert into public.inventory_service_cost_links(log_id,line_index,allocation_id,quantity)
    select p_log_id,p_line_index,(x->>'allocation_id')::uuid,(x->>'quantity')::integer from jsonb_array_elements(p_links) x;
  select coalesce(jsonb_agg(jsonb_build_object('allocation_id',s.allocation_id,'quantity',s.quantity,'unit_cost',a.unit_cost,'source_layer_id',a.source_layer_id) order by s.allocation_id),'[]'::jsonb)
    into v_after from public.inventory_service_cost_links s join public.inventory_cost_allocations a on a.id=s.allocation_id where s.log_id=p_log_id and s.line_index=p_line_index;
  insert into public.inventory_service_cost_link_audit(log_id,line_index,before_links,after_links,note,created_by)
    values(p_log_id,p_line_index,v_before,v_after,btrim(p_note),auth.uid());
end $$;

-- Linked records cannot be silently changed by older write/restore paths.
create or replace function public.guard_service_cost_link_sources()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_table_name='logs' then
    if exists(select 1 from public.inventory_service_cost_links where log_id=old.id) then
      if tg_op='DELETE' then raise exception '서비스 원가 연결을 먼저 해제해 주세요.'; end if;
      if (new.jsonb->'items',new.created_at,new.category) is distinct from (old.jsonb->'items',old.created_at,old.category)
        then raise exception '서비스 원가 연결을 먼저 해제한 뒤 출고 품목을 수정해 주세요.'; end if;
    end if;
  elsif tg_table_name='inventory_cost_allocations' then
    if exists(select 1 from public.inventory_service_cost_links where allocation_id=old.id) then raise exception '서비스에 연결된 소진 기록은 변경할 수 없습니다. 연결을 먼저 해제해 주세요.'; end if;
  elsif tg_table_name='inventory_cost_events' then
    if tg_op='INSERT' then
      if new.reference_type='stamp_log' and exists(select 1 from public.inventory_service_cost_links where log_id::text=new.reference_id and line_index::text=new.reference_line_key)
        then raise exception '이미 소진 기록에 연결된 서비스입니다. 이중 원가 배정을 차단합니다.'; end if;
    elsif exists(select 1 from public.inventory_service_cost_links s join public.inventory_cost_allocations a on a.id=s.allocation_id where a.outbound_event_id=old.id)
      then raise exception '서비스에 연결된 소진 기록은 변경할 수 없습니다. 연결을 먼저 해제해 주세요.';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger a_guard_service_cost_links before update or delete on public.logs for each row execute function public.guard_service_cost_link_sources();
create trigger a_guard_service_cost_links before update or delete on public.inventory_cost_allocations for each row execute function public.guard_service_cost_link_sources();
create trigger a_guard_service_cost_links before insert or update or delete on public.inventory_cost_events for each row execute function public.guard_service_cost_link_sources();
revoke all on function public.get_service_cost_link_context(bigint,integer),public.save_service_cost_links(bigint,integer,text,jsonb,text),public.guard_service_cost_link_sources() from public,anon;
grant execute on function public.get_service_cost_link_context(bigint,integer),public.save_service_cost_links(bigint,integer,text,jsonb,text) to authenticated;

-- Attribution is included in movement display only; the ledger total remains unchanged.
create or replace function public.get_inventory_movement_unit_prices(p_movement_ids uuid[])
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_object_agg(m.id::text,case
    when m.reference_type='after_service_outbound' and m.unit_price is not null then m.unit_price
    when m.quantity_delta<0 and c.n>0 then c.unit_cost
    else coalesce(m.unit_price,c.unit_cost) end),'{}'::jsonb)
  from public.inventory_movements m
  cross join lateral(select count(*) n,case when bool_or(parts.total_cost is null) then null
    else round(sum(parts.total_cost)::numeric/nullif(sum(parts.quantity),0))::integer end unit_cost
    from (
      select e.total_cost::bigint,e.quantity from public.inventory_cost_events e
      where e.item_name=btrim(m.item_name) and e.reference_id=m.reference_id
        and ((m.reference_type='outbound_log' and e.reference_type='stamp_log'
            and e.direction=case when m.inventory_action in ('exchange_in','adjustment_in') then 'in' else 'out' end)
          or (m.reference_type='after_service_outbound' and e.reference_type='after_service_outbound')
          or (m.reference_type in ('purchase_receipt','purchase_receipt_reversal') and e.reference_type='purchase_receipt'))
      union all
      select s.quantity::bigint*a.unit_cost,s.quantity
      from public.inventory_service_cost_links s join public.inventory_cost_allocations a on a.id=s.allocation_id
      join public.inventory_cost_events e on e.id=a.outbound_event_id
      where m.reference_type='outbound_log' and m.quantity_delta<0 and s.log_id::text=m.reference_id and e.item_name=btrim(m.item_name)
    ) parts
  ) c
  where m.id=any(coalesce(p_movement_ids,array[]::uuid[]))
    and exists(select 1 from public.users where id=auth.uid() and oss_role='master');
$$;

create or replace function public.sync_standard_outbound_cost_ledger()
returns trigger language plpgsql security definer set search_path=public as $$
declare i jsonb; n integer:=0; v_name text; v_qty integer; v_action text; v_remark text;
  v_type text; v_effect text; v_available integer; v_missing integer;
begin
  if new.category<>'stamp' then return new; end if;
  for i in select value from jsonb_array_elements(coalesce(new.jsonb->'items','[]')) loop
    n:=n+1; v_name:=btrim(coalesce(i->>'itemName','')); v_qty:=coalesce(nullif(i->>'quantity','')::integer,0);
    v_action:=btrim(coalesce(i->>'inventoryAction','')); v_remark:=btrim(coalesce(i->>'remark',''));
    if v_name='' or v_qty<=0 or not public.is_inventory_item_tracked(v_name) then continue; end if;
    if v_action in ('exchange_in','exchange_out') then continue; end if;
    if exists(select 1 from public.inventory_service_cost_links where log_id=new.id and line_index=n) then continue; end if;
    if v_action='adjustment_in' then
      perform public.create_inventory_cost_layer('adjustment_in',new.created_at,null,v_name,v_qty,null,'pending','front',
        'stamp_log',new.id::text,n::text,null,jsonb_build_object('customerId',new.customer_id,'memo',v_remark));
      continue;
    end if;
    if v_action='adjustment_out' then v_type:='adjustment_out'; v_effect:='none';
    elsif v_action='as_exchange_out' then v_type:='after_service_out'; v_effect:='after_service_pending';
    elsif v_action in ('','out') and v_remark ~ '^시연용($|[,\s(])' then v_type:='demo_out'; v_effect:='demo_expense';
    elsif v_action in ('','out') and v_remark ~ '^서비스($|[,\s(])' then v_type:='service_out'; v_effect:='none';
    elsif v_action in ('','out') and v_remark !~ '^(교환입고|교환출고|A/S 교환출고|재고조정-(입고|출고))($|[,\s(])' then v_type:='sale_out'; v_effect:='sale_cogs';
    else continue; end if;
    perform pg_advisory_xact_lock(hashtextextended(v_name,0));
    if not exists(select 1 from public.inventory_cost_events where reference_type='stamp_log' and reference_id=new.id::text and reference_line_key=n::text and event_type=v_type) then
      select coalesce(sum(l.remaining_quantity),0) into v_available from public.inventory_cost_layers l
        join public.inventory_cost_events e on e.id=l.source_event_id
        where l.item_name=v_name and l.remaining_quantity>0 and e.event_at<=new.created_at;
      v_missing:=greatest(0,v_qty-v_available);
      if v_missing>0 then
        perform public.create_inventory_cost_layer('opening',new.created_at-interval '1 microsecond',null,v_name,v_missing,null,'pending','back',
          'cost_missing',new.id::text,n::text,null,jsonb_build_object('reason','live cost missing'));
      end if;
    end if;
    perform public.allocate_inventory_cost_fifo(v_type,new.created_at,null,v_name,v_qty,'stamp_log',new.id::text,n::text,v_effect,
      jsonb_strip_nulls(jsonb_build_object('customerId',new.customer_id,'memo',v_remark,'afterServiceId',coalesce(new.jsonb->>'afterServiceId',new.after_service_id::text))));
  end loop;
  return new;
end $$;

-- Expose historical gaps without inventing cost sources or consuming layers a second time.
create or replace function public.get_inventory_cost_integrity_report(p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_report jsonb;
begin
  if not exists(select 1 from public.users where id=auth.uid() and oss_role='master') then raise exception 'MASTER_REQUIRED'; end if;
  with layer_totals as (
    select item_name,sum(remaining_quantity) quantity from public.inventory_cost_layers group by item_name
  ), allocation_totals as (
    select a.outbound_event_id,sum(a.quantity) quantity,
      case when bool_or(a.unit_cost is null) then null else sum(a.quantity::bigint*a.unit_cost) end total_cost
    from public.inventory_cost_allocations a group by a.outbound_event_id
  ), active_usage as (
    select a.source_layer_id,sum(a.quantity) quantity from public.inventory_cost_allocations a
    join public.inventory_cost_events e on e.id=a.outbound_event_id where e.metadata->>'restoredAt' is null group by a.source_layer_id
  ), transfers as (
    select l.source_layer_id,sum(l.original_quantity) quantity from public.inventory_cost_layers l
    join public.inventory_cost_events e on e.id=l.source_event_id where e.metadata->>'manualZeroCost'='true' group by l.source_layer_id
  ), missing_service as (
    select log.id::text log_id,log.created_at event_at,i.n line_index,i.value->>'itemName' item_name,(i.value->>'quantity')::integer quantity,
      coalesce((select sum(s.quantity) from public.inventory_service_cost_links s where s.log_id=log.id and s.line_index=i.n),0) linked_quantity
    from public.logs log cross join lateral jsonb_array_elements(coalesce(log.jsonb->'items','[]')) with ordinality i(value,n)
    where log.category='stamp' and btrim(coalesce(i.value->>'inventoryAction','')) in ('','out')
      and btrim(coalesce(i.value->>'remark','')) ~ '^서비스($|[,\s(])'
      and coalesce(nullif(i.value->>'quantity','')::integer,0)>0 and public.is_inventory_item_tracked(btrim(i.value->>'itemName'))
      and not exists(select 1 from public.inventory_cost_events e where e.reference_type='stamp_log' and e.reference_id=log.id::text and e.reference_line_key=i.n::text)
  )
  select jsonb_build_object(
    'stockMismatchCount',(select count(*) from public.inventory_balances b full join layer_totals l on l.item_name=b.item_name
      where coalesce(b.quantity,0)<>coalesce(l.quantity,0) and public.is_inventory_item_tracked(coalesce(b.item_name,l.item_name))),
    'layerMismatchCount',(select count(*) from public.inventory_cost_layers l left join active_usage a on a.source_layer_id=l.id left join transfers t on t.source_layer_id=l.id
      where l.original_quantity-l.remaining_quantity<>coalesce(a.quantity,0)+coalesce(t.quantity,0)),
    'outboundMismatchCount',(select count(*) from public.inventory_cost_events e left join allocation_totals a on a.outbound_event_id=e.id
      where e.direction='out' and e.metadata->>'restoredAt' is null and (e.quantity<>coalesce(a.quantity,0) or e.total_cost is distinct from a.total_cost)),
    'missingServiceCount',(select count(*) from missing_service where linked_quantity<quantity),
    'serviceReviewCount',(select count(*) from missing_service),
    'missingServiceLines',coalesce((select jsonb_agg(to_jsonb(m)) from (select * from missing_service order by event_at desc,log_id,line_index limit greatest(1,least(coalesce(p_limit,100),1000))) m),'[]'::jsonb)
  ) into v_report;
  return v_report;
end $$;
revoke all on function public.get_inventory_cost_integrity_report(integer) from public,anon;
grant execute on function public.get_inventory_cost_integrity_report(integer) to authenticated;
