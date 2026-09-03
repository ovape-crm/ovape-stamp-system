create table public.inventory_cost_cleanup_audit (
 id uuid primary key default gen_random_uuid(), source_event_id uuid not null,
 trigger_log_id bigint, reason text not null, snapshot jsonb not null,
 created_by uuid references auth.users(id), created_at timestamptz not null default now()
);
alter table public.inventory_cost_cleanup_audit enable row level security;
revoke all on public.inventory_cost_cleanup_audit from public,anon,authenticated;
grant select on public.inventory_cost_cleanup_audit to authenticated;
create policy master_reads_cost_cleanup on public.inventory_cost_cleanup_audit for select to authenticated
 using(exists(select 1 from public.users where id=auth.uid() and oss_role='master'));

create function public.cleanup_unused_outbound_missing_layers(p_source_reference text,p_trigger_log_id bigint)
returns void language plpgsql security definer set search_path=public as $$
declare candidate record; source public.inventory_cost_events%rowtype; layer public.inventory_cost_layers%rowtype;
begin
 for candidate in select e.id,e.item_name from public.inventory_cost_events e
 where e.reference_type='cost_missing' and e.reference_id=p_source_reference
 and e.event_type='opening' and e.direction='in' and e.metadata->>'reason'='live cost missing'
 order by e.item_name,e.id loop
  perform pg_advisory_xact_lock(hashtextextended(btrim(candidate.item_name),0));
  select * into source from public.inventory_cost_events where id=candidate.id for update;
  if not found then continue; end if;
  select * into layer from public.inventory_cost_layers where source_event_id=source.id for update;
  if not found then continue; end if;
  -- Never discard confirmed costs, partially used layers, derivatives or any allocation history.
  if layer.cost_status<>'pending' or layer.unit_cost is not null or source.total_cost is not null
   or layer.remaining_quantity<>layer.original_quantity or layer.source_layer_id is not null
   or exists(select 1 from public.inventory_cost_allocations where source_layer_id=layer.id)
   or exists(select 1 from public.inventory_cost_layers where source_layer_id=layer.id)
   or exists(select 1 from public.inventory_cost_events where reference_type='stamp_log' and reference_id=source.reference_id and reference_line_key=source.reference_line_key)
   then continue; end if;
  insert into public.inventory_cost_cleanup_audit(source_event_id,trigger_log_id,reason,snapshot,created_by)
  values(source.id,p_trigger_log_id,'출고 취소·수정 후 사용처가 없는 자동 미확정 임시층 정리',
    jsonb_build_object('source_event',to_jsonb(source),'layer',to_jsonb(layer)),auth.uid());
  delete from public.inventory_cost_events where id=source.id;
 end loop;
end $$;
revoke all on function public.cleanup_unused_outbound_missing_layers(text,bigint) from public,anon,authenticated;

create or replace function public.rollback_stamp_log_cost_ledger()
returns trigger language plpgsql security definer set search_path=public as $$
declare e record; a record; l record; v_keep boolean; owner_refs text[]:=array[old.id::text]; owner_ref text;
begin
  if old.category<>'stamp' then return case when tg_op='UPDATE' then new else old end; end if;
  if tg_op='UPDATE' and new.category=old.category and new.created_at=old.created_at
    and new.jsonb->'items' is not distinct from old.jsonb->'items' then return new; end if;
  for e in select * from public.inventory_cost_events where reference_type='stamp_log' and reference_id=old.id::text order by item_name,id loop
    v_keep:=false;
    if tg_op='UPDATE' and new.category='stamp' and new.created_at=old.created_at
      and e.reference_line_key ~ '^[1-9][0-9]*$' and e.event_type in ('sale_out','service_out','demo_out') then
      v_keep:=(new.jsonb->'items'->(e.reference_line_key::integer-1)) is not distinct from (old.jsonb->'items'->(e.reference_line_key::integer-1));
    end if;
    if v_keep then continue; end if;
    perform pg_advisory_xact_lock(hashtextextended(btrim(e.item_name),0));
    if exists(select 1 from public.inventory_cost_events child
      where child.metadata->>'sourceSaleLogId'=e.reference_id and child.metadata->>'sourceSaleLineIndex'=e.reference_line_key)
      or (e.event_type='after_service_out' and exists(select 1 from public.inventory_cost_events child
        where child.event_type='after_service_in' and child.metadata->>'afterServiceId'=e.metadata->>'afterServiceId')) then
      raise exception '반품·A/S 입고에 연결된 출고는 직접 수정하거나 삭제할 수 없습니다.';
    end if;
    for l in select * from public.inventory_cost_layers where source_event_id=e.id loop
      if l.remaining_quantity<>l.original_quantity then raise exception '후속 출고에 사용된 입고 원가가 있어 수정·삭제할 수 없습니다.'; end if;
    end loop;
    owner_refs:=owner_refs||array(select distinct src.reference_id from public.inventory_cost_allocations used
      join public.inventory_cost_layers layer on layer.id=used.source_layer_id
      join public.inventory_cost_events src on src.id=layer.source_event_id
      where used.outbound_event_id=e.id and src.reference_type='cost_missing');
    for a in select source_layer_id,sum(quantity)::integer quantity from public.inventory_cost_allocations where outbound_event_id=e.id group by source_layer_id loop
      update public.inventory_cost_layers set remaining_quantity=remaining_quantity+a.quantity where id=a.source_layer_id;
    end loop;
    delete from public.inventory_cost_events where id=e.id;
  end loop;
  for owner_ref in select distinct unnest(owner_refs) loop
    perform public.cleanup_unused_outbound_missing_layers(owner_ref,old.id);
  end loop;
  if tg_op='UPDATE' then
    delete from public.settlement_expenses where source_log_id=old.id and category in ('고객 교환 원가차액','재고손실');
    return new;
  end if;
  return old;
end $$;
