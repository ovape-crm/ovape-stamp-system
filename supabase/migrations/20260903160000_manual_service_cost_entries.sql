-- Manual service amounts are an explicit override, never a second FIFO consumption.
create table public.inventory_service_manual_costs (
 log_id bigint not null references public.logs(id), line_index integer not null check(line_index>0),
 unit_cost integer not null check(unit_cost>=0), note text not null,
 updated_by uuid not null references auth.users(id), updated_at timestamptz not null default now(),
 primary key(log_id,line_index)
);
create table public.inventory_service_manual_cost_audit (
 id uuid primary key default gen_random_uuid(), log_id bigint not null, line_index integer not null,
 before_cost jsonb, after_cost jsonb, note text not null,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
alter table public.inventory_service_manual_costs enable row level security;
alter table public.inventory_service_manual_cost_audit enable row level security;
revoke all on public.inventory_service_manual_costs,public.inventory_service_manual_cost_audit from public,anon,authenticated;
grant select on public.inventory_service_manual_costs,public.inventory_service_manual_cost_audit to authenticated;
create policy master_read on public.inventory_service_manual_costs for select to authenticated using(exists(select 1 from public.users where id=auth.uid() and oss_role='master'));
create policy master_read on public.inventory_service_manual_cost_audit for select to authenticated using(exists(select 1 from public.users where id=auth.uid() and oss_role='master'));

create function public.get_service_cost_entry(p_log_id bigint,p_line_index integer)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_log public.logs%rowtype; v_item jsonb; v_manual jsonb; v_allocated bigint; v_linked bigint; v_cost bigint; v_quantity integer; v_source text;
begin
 if not exists(select 1 from public.users where id=auth.uid() and oss_role='master') then raise exception 'MASTER_REQUIRED'; end if;
 select * into v_log from public.logs where id=p_log_id;
 v_item:=v_log.jsonb->'items'->(p_line_index-1);
 if p_line_index is null or p_line_index<1 or v_item is null or v_log.category<>'stamp'
 or btrim(coalesce(v_item->>'remark','')) !~ '^서비스($|[,\s(])'
 or btrim(coalesce(v_item->>'inventoryAction','')) not in ('','out')
 or coalesce((v_item->>'quantity')::integer,0)<=0 then raise exception '서비스 출고 원본을 확인할 수 없습니다.'; end if;
 v_quantity:=(v_item->>'quantity')::integer;
 select to_jsonb(m) into v_manual from public.inventory_service_manual_costs m where log_id=p_log_id and line_index=p_line_index;
 select case when bool_or(total_cost is null) then null else sum(total_cost) end into v_allocated from public.inventory_cost_events
 where reference_type='stamp_log' and reference_id=p_log_id::text and reference_line_key=p_line_index::text and direction='out' and metadata->>'restoredAt' is null;
 select case when bool_or(a.unit_cost is null) or sum(s.quantity)<>v_quantity then null else sum(s.quantity::bigint*a.unit_cost) end into v_linked
 from public.inventory_service_cost_links s join public.inventory_cost_allocations a on a.id=s.allocation_id where s.log_id=p_log_id and s.line_index=p_line_index;
 v_cost:=coalesce((v_manual->>'unit_cost')::bigint*v_quantity,v_allocated,v_linked);
 v_source:=case when v_manual is not null then 'manual' when v_allocated is not null then 'fifo' when v_linked is not null then 'linked' else 'missing' end;
 return jsonb_build_object('log_id',p_log_id::text,'line_index',p_line_index,'item_name',v_item->>'itemName','event_at',v_log.created_at,'quantity',v_quantity,
 'total_cost',v_cost,'source',v_source,'manual',v_manual,'allocated_cost',v_allocated,'linked_cost',v_linked,
 'has_allocation',exists(select 1 from public.inventory_cost_events where reference_type='stamp_log' and reference_id=p_log_id::text and reference_line_key=p_line_index::text),
 'snapshot',md5(jsonb_build_object('log',to_jsonb(v_log),'manual',v_manual,'allocated',v_allocated,'linked',v_linked)::text),
 'history',coalesce((select jsonb_agg(to_jsonb(h) order by created_at desc,id) from public.inventory_service_manual_cost_audit h where log_id=p_log_id and line_index=p_line_index),'[]'::jsonb));
end $$;

create function public.get_service_cost_entries(p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
 if not exists(select 1 from public.users where id=auth.uid() and oss_role='master') then raise exception 'MASTER_REQUIRED'; end if;
 with services as (
 select l.id,l.created_at,i.n::integer line_index from public.logs l cross join lateral jsonb_array_elements(coalesce(l.jsonb->'items','[]')) with ordinality i(value,n)
 where l.category='stamp' and btrim(coalesce(i.value->>'remark','')) ~ '^서비스($|[,\s(])'
 and btrim(coalesce(i.value->>'inventoryAction','')) in ('','out') and coalesce(nullif(i.value->>'quantity','')::integer,0)>0
 )
 select jsonb_build_object('count',(select count(*) from services),'rows',coalesce((select jsonb_agg(public.get_service_cost_entry(s.id,s.line_index) order by s.created_at desc,s.id desc,s.line_index) from
 (select * from services order by created_at desc,id desc,line_index limit greatest(1,least(coalesce(p_limit,100),10000))) s),'[]'::jsonb)) into result;
 return result;
end $$;

create function public.save_service_manual_cost(p_log_id bigint,p_line_index integer,p_snapshot text,p_unit_cost integer,p_note text)
returns void language plpgsql security definer set search_path=public as $$
declare ctx jsonb; v_after jsonb;
begin
 if not exists(select 1 from public.users where id=auth.uid() and oss_role='master') then raise exception 'MASTER_REQUIRED'; end if;
 if coalesce(length(btrim(p_note)),0)<2 then raise exception '원가 입력 또는 수정 사유를 입력해 주세요.'; end if;
 if p_unit_cost<0 then raise exception '원가는 0원 이상이어야 합니다.'; end if;
 lock table public.logs in share row exclusive mode;
 perform public.lock_inventory_cost_review();
 lock table public.inventory_service_cost_links in share row exclusive mode;
 lock table public.inventory_service_manual_costs in share row exclusive mode;
 ctx:=public.get_service_cost_entry(p_log_id,p_line_index);
 if p_snapshot is distinct from ctx->>'snapshot' then raise exception '원가가 변경됐습니다. 다시 조회해 주세요.'; end if;
 if p_unit_cost::bigint*(ctx->>'quantity')::bigint>2147483647 then raise exception '원가 합계가 입력 가능 범위를 초과합니다.'; end if;
 if p_unit_cost is null then
 delete from public.inventory_service_manual_costs where log_id=p_log_id and line_index=p_line_index;
 else
 insert into public.inventory_service_manual_costs(log_id,line_index,unit_cost,note,updated_by)
 values(p_log_id,p_line_index,p_unit_cost,btrim(p_note),auth.uid())
 on conflict(log_id,line_index) do update set unit_cost=excluded.unit_cost,note=excluded.note,updated_by=excluded.updated_by,updated_at=now();
 end if;
 v_after:=public.get_service_cost_entry(p_log_id,p_line_index);
 insert into public.inventory_service_manual_cost_audit(log_id,line_index,before_cost,after_cost,note,created_by)
 values(p_log_id,p_line_index,ctx-'history',v_after-'history',btrim(p_note),auth.uid());
end $$;

create function public.guard_service_manual_cost_log() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from public.inventory_service_manual_costs where log_id=old.id) then
 if tg_op='DELETE' then raise exception '직접 입력한 서비스 원가를 먼저 취소해 주세요.'; end if;
 if (new.jsonb->'items',new.created_at,new.category) is distinct from (old.jsonb->'items',old.created_at,old.category) then raise exception '직접 입력한 서비스 원가를 먼저 취소한 뒤 출고를 수정해 주세요.'; end if;
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger a_guard_service_manual_cost before update or delete on public.logs for each row execute function public.guard_service_manual_cost_log();
revoke all on function public.get_service_cost_entry(bigint,integer),public.get_service_cost_entries(integer),public.save_service_manual_cost(bigint,integer,text,integer,text),public.guard_service_manual_cost_log() from public,anon,authenticated;
grant execute on function public.get_service_cost_entry(bigint,integer),public.get_service_cost_entries(integer),public.save_service_manual_cost(bigint,integer,text,integer,text) to authenticated;

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
