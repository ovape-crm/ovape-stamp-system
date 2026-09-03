-- A preview is an immutable, fully calculated plan, never a promise to calculate later.
alter table public.inventory_cost_reassignment_runs
  alter column cost_before drop not null,
  alter column cost_after drop not null,
  add column plan_version integer,
  add column source_snapshot jsonb,
  add column plan jsonb,
  add column approved_at timestamptz,
  add column applied_by uuid references public.users(id);
do $$ declare c record; begin
  for c in select conname from pg_constraint
    where conrelid='public.inventory_cost_reassignment_preview_lines'::regclass
      and confrelid='public.inventory_cost_events'::regclass and contype='f'
  loop execute format('alter table public.inventory_cost_reassignment_preview_lines drop constraint %I',c.conname); end loop;
end $$;
alter table public.inventory_cost_reassignment_preview_lines
  add column event_type text,
  add column quantity integer,
  add column reference_type text,
  add column reference_id text,
  add column reference_line_key text,
  add column before_allocations jsonb,
  add column after_allocations jsonb,
  add column protected_reason text;
revoke insert, update, delete on public.inventory_cost_reassignment_preview_lines from anon, authenticated;
grant select on public.inventory_cost_reassignment_runs,public.inventory_cost_reassignment_preview_lines to authenticated;

-- Older writers use different advisory locks. Table locks also cover those writers and
-- prevent inserts (phantoms) while reviewing/applying a snapshot. No stock writes here.
create or replace function public.lock_inventory_cost_review()
returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.users where id=auth.uid() and oss_role='master') then
    raise exception 'MASTER_REQUIRED';
  end if;
  lock table public.inventory_balances, public.inventory_cost_events,
    public.inventory_cost_layers, public.inventory_cost_allocations,
    public.after_service_outbound_cost_allocations, public.settlement_expenses
    in share row exclusive mode;
end $$;

create or replace function public.inventory_cost_review_snapshot(p_item text)
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'balance', (select to_jsonb(b) from inventory_balances b where b.item_name=p_item),
    'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.event_at,e.created_at,e.id)
      from inventory_cost_events e where e.item_name=p_item),'[]'::jsonb),
    'layers', coalesce((select jsonb_agg(to_jsonb(l)||jsonb_build_object('event_at',e.event_at)
      order by l.queue_sequence,e.event_at,l.created_at,l.id)
      from inventory_cost_layers l join inventory_cost_events e on e.id=l.source_event_id
      where l.item_name=p_item),'[]'::jsonb),
    'allocations',coalesce((select jsonb_agg(to_jsonb(a) order by a.outbound_event_id,a.source_layer_id)
      from inventory_cost_allocations a
      where exists(select 1 from inventory_cost_events e where e.id=a.outbound_event_id and e.item_name=p_item)
         or exists(select 1 from inventory_cost_layers l where l.id=a.source_layer_id and l.item_name=p_item)),'[]'::jsonb),
    'related_events',coalesce((select jsonb_agg(to_jsonb(e) order by e.id) from inventory_cost_events e
      where e.metadata->>'sourceSaleLogId' in (select reference_id from inventory_cost_events where item_name=p_item)
        or e.metadata->>'afterServiceId' in (select metadata->>'afterServiceId' from inventory_cost_events where item_name=p_item)
        or e.id in (select source_event_id from inventory_cost_layers where source_layer_id in
          (select id from inventory_cost_layers where item_name=p_item))),'[]'::jsonb),
    'expenses',coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from settlement_expenses s
      where s.source_log_id::text in (select reference_id from inventory_cost_events where item_name=p_item and reference_type='stamp_log')),'[]'::jsonb),
    'service_allocations',coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from after_service_outbound_cost_allocations a
      where a.after_service_id::text in (select metadata->>'afterServiceId' from inventory_cost_events where item_name=p_item)
        or a.source_receipt_line_id::text in (select reference_line_key from inventory_cost_events where item_name=p_item and reference_type='purchase_receipt')),'[]'::jsonb)
  );
$$;

-- Pure simulator: operates on JSON only. It never modifies live events/layers/stock.
create or replace function public.calculate_inventory_cost_review(p_snapshot jsonb,p_from_at timestamptz)
returns jsonb language plpgsql immutable set search_path=public as $$
declare
  e jsonb; l jsonb; a jsonb; row_plan jsonb; v_before jsonb; v_after jsonb;
  v_available jsonb:='{}'; v_lines jsonb:='[]'; v_reason text; v_id text;
  v_left integer; v_take integer; v_quantity integer; v_used integer;
  v_cost bigint; v_before_cost bigint; v_pending boolean;
  v_stock integer:=coalesce((p_snapshot->'balance'->>'quantity')::integer,0);
  v_before_total bigint:=0; v_after_total bigint:=0; v_before_pending boolean:=false; v_after_pending boolean:=false;
  v_changed integer:=0; v_layer_total bigint:=0;
begin
  if p_from_at is null then raise exception 'INVALID_REASSIGNMENT_SCOPE'; end if;
  for l in select value from jsonb_array_elements(p_snapshot->'layers') loop
    v_id:=l->>'id';
    select coalesce(sum((x->>'quantity')::integer),0) into v_used
      from jsonb_array_elements(p_snapshot->'allocations') x
      where x->>'source_layer_id'=v_id and not exists (
        select 1 from jsonb_array_elements(p_snapshot->'events') o
        where o->>'id'=x->>'outbound_event_id' and o->'metadata'->>'restoredAt' is not null);
    -- Approved zero-cost splits transfer quantity to a child layer, not an outbound.
    v_used:=v_used+coalesce((select sum((child->>'original_quantity')::integer)
      from jsonb_array_elements(p_snapshot->'layers') child
      where child->>'source_layer_id'=v_id and exists(select 1 from jsonb_array_elements(p_snapshot->'events') src
        where src->>'id'=child->>'source_event_id' and src->'metadata'->>'manualZeroCost'='true')),0);
    if (l->>'original_quantity')::integer-(l->>'remaining_quantity')::integer<>v_used then
      raise exception '원가층 사용 수량과 연결 기록이 다릅니다. 원가 연결점검이 먼저 필요합니다.';
    end if;
    v_available:=jsonb_set(v_available,array[v_id],l->'remaining_quantity');
    v_layer_total:=v_layer_total+(l->>'remaining_quantity')::integer;
  end loop;
  if v_layer_total<>v_stock then
    raise exception '실재고와 원가층 잔량이 다릅니다. 원가 연결점검 후 미리보기를 다시 만드세요.';
  end if;

  for e in select value from jsonb_array_elements(p_snapshot->'events')
    where value->>'direction'='out' and (value->>'event_at')::timestamptz>=p_from_at
    order by (value->>'event_at')::timestamptz,(value->>'created_at')::timestamptz,value->>'id'
  loop
    select coalesce(jsonb_agg(jsonb_build_object('source_layer_id',x->>'source_layer_id','quantity',x->'quantity','unit_cost',x->'unit_cost') order by x->>'source_layer_id'),'[]')
      into v_before from jsonb_array_elements(p_snapshot->'allocations') x where x->>'outbound_event_id'=e->>'id';
    v_reason:=null;
    -- These allocations have business-specific destinations. A single-item replay must
    -- never silently move a return source, manually selected layer or posted expense.
    if e->>'event_type' in ('reconciliation_out','reversal') then v_reason:='수동 소진·원복 기록 보존';
    elsif e->>'event_type' in ('after_service_out','customer_exchange_out') then v_reason:='A/S·교환 연결 원가 보존';
    elsif exists(select 1 from jsonb_array_elements(p_snapshot->'related_events') x
      where (x->'metadata'->>'sourceSaleLogId'=e->>'reference_id'
        and x->'metadata'->>'sourceSaleLineIndex'=e->>'reference_line_key')
        or (x->>'event_type'='after_service_in' and x->'metadata'->>'afterServiceId'=e->'metadata'->>'afterServiceId')) then
      v_reason:='반품·A/S 입고에 사용된 원가 보존';
    elsif exists(select 1 from jsonb_array_elements(p_snapshot->'expenses') x where x->>'source_log_id'=e->>'reference_id')
      or e->>'settlement_effect' in ('inventory_loss','customer_exchange_difference')
      or e->'metadata'->>'adjustmentType' in ('correction_in','correction_out') then v_reason:='정산비용 연결 원가 보존';
    end if;
    select coalesce(sum((x->>'quantity')::integer),0),
      case when bool_or(x->>'unit_cost' is null) then null else coalesce(sum((x->>'quantity')::bigint*(x->>'unit_cost')::integer),0) end
      into v_quantity,v_before_cost from jsonb_array_elements(v_before) x;
    if v_quantity<>(e->>'quantity')::integer then
      raise exception '출고 수량과 원가 배정 수량이 다릅니다. 누락 원가를 먼저 확인하세요. 출고: %',e->>'reference_id';
    end if;
    if v_before_cost is distinct from (e->>'total_cost')::bigint then
      raise exception '출고 원가 합계와 배정 기록이 다릅니다. 출고: %',e->>'reference_id';
    end if;
    v_lines:=v_lines||jsonb_build_array(jsonb_build_object(
      'outbound_event_id',e->>'id','event_at',e->>'event_at','event_type',e->>'event_type',
      'reference_type',e->>'reference_type','reference_id',e->>'reference_id','reference_line_key',e->>'reference_line_key',
      'quantity',e->'quantity','cost_before',e->'total_cost','cost_after',e->'total_cost',
      'before_allocations',v_before,'after_allocations',v_before,'protected_reason',v_reason));
    if v_reason is null then
      for a in select value from jsonb_array_elements(v_before) loop
        v_id:=a->>'source_layer_id';
        if not v_available ? v_id then raise exception '다른 품목의 원가층 연결이 있습니다.'; end if;
        v_available:=jsonb_set(v_available,array[v_id],to_jsonb((v_available->>v_id)::integer+(a->>'quantity')::integer));
      end loop;
    end if;
  end loop;
  if jsonb_array_length(v_lines)=0 then raise exception '선택한 기간에 출고가 없습니다.'; end if;
  for row_plan in select value from jsonb_array_elements(v_lines) loop
    if row_plan->>'protected_reason' is null then
      v_left:=(row_plan->>'quantity')::integer; v_cost:=0; v_pending:=false; v_after:='[]';
      for l in select value from jsonb_array_elements(p_snapshot->'layers')
        where (value->>'event_at')::timestamptz<=(row_plan->>'event_at')::timestamptz
        order by (value->>'queue_sequence')::numeric,(value->>'event_at')::timestamptz,(value->>'created_at')::timestamptz,value->>'id'
      loop
        exit when v_left=0; v_id:=l->>'id';
        v_take:=least(v_left,(v_available->>v_id)::integer);
        if v_take<=0 then continue; end if;
        v_after:=v_after||jsonb_build_array(jsonb_build_object('source_layer_id',v_id,'quantity',v_take,'unit_cost',l->'unit_cost'));
        v_available:=jsonb_set(v_available,array[v_id],to_jsonb((v_available->>v_id)::integer-v_take));
        if l->>'unit_cost' is null then v_pending:=true; else v_cost:=v_cost+v_take::bigint*(l->>'unit_cost')::integer; end if;
        v_left:=v_left-v_take;
      end loop;
      if v_left>0 then raise exception '출고 당시 사용할 원가층이 %개 부족합니다. 출고: %',v_left,row_plan->>'reference_id'; end if;
      select jsonb_agg(x order by x->>'source_layer_id') into v_after from jsonb_array_elements(v_after) x;
      row_plan:=row_plan||jsonb_build_object('after_allocations',v_after,'cost_after',case when v_pending then null else v_cost end);
      if row_plan->'before_allocations' is distinct from v_after then v_changed:=v_changed+1; end if;
      v_lines:=jsonb_set(v_lines,array[(select (ordinality-1)::text from jsonb_array_elements(v_lines) with ordinality x where x.value->>'outbound_event_id'=row_plan->>'outbound_event_id')],row_plan);
    end if;
    if row_plan->>'cost_before' is null then v_before_pending:=true; else v_before_total:=v_before_total+(row_plan->>'cost_before')::bigint; end if;
    if row_plan->>'cost_after' is null then v_after_pending:=true; else v_after_total:=v_after_total+(row_plan->>'cost_after')::bigint; end if;
  end loop;
  if (select sum(value::integer) from jsonb_each_text(v_available)) is distinct from v_layer_total then raise exception '원가층 잔량 보존 검증 실패'; end if;
  return jsonb_build_object('version',2,'lines',v_lines,'remaining',v_available,'changed_count',v_changed,
    'cost_before',case when v_before_pending then null else v_before_total end,
    'cost_after',case when v_after_pending then null else v_after_total end,'stock',v_stock);
end $$;

create or replace function public.preview_inventory_cost_reassignment(p_item_name text,p_from_at timestamptz,p_note text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_item text:=btrim(p_item_name); v_snapshot jsonb; v_plan jsonb; v_run uuid; l jsonb;
begin
  perform public.lock_inventory_cost_review();
  if coalesce(v_item,'')='' or p_from_at is null then raise exception 'INVALID_REASSIGNMENT_SCOPE'; end if;
  v_snapshot:=public.inventory_cost_review_snapshot(v_item);
  v_plan:=public.calculate_inventory_cost_review(v_snapshot,p_from_at);
  insert into public.inventory_cost_reassignment_runs(item_name,from_at,inventory_quantity_before,inventory_quantity_after,
    affected_outbound_count,cost_before,cost_after,status,note,requested_by,plan_version,source_snapshot,plan)
  values(v_item,p_from_at,(v_plan->>'stock')::integer,(v_plan->>'stock')::integer,
    (v_plan->>'changed_count')::integer,(v_plan->>'cost_before')::integer,(v_plan->>'cost_after')::integer,
    'previewed',nullif(btrim(p_note),''),auth.uid(),2,v_snapshot,v_plan) returning id into v_run;
  for l in select value from jsonb_array_elements(v_plan->'lines') loop
    insert into public.inventory_cost_reassignment_preview_lines(run_id,outbound_event_id,event_at,event_type,quantity,
      reference_type,reference_id,reference_line_key,cost_before,cost_after,before_allocations,after_allocations,protected_reason)
    values(v_run,(l->>'outbound_event_id')::uuid,(l->>'event_at')::timestamptz,l->>'event_type',(l->>'quantity')::integer,
      l->>'reference_type',l->>'reference_id',l->>'reference_line_key',(l->>'cost_before')::integer,(l->>'cost_after')::integer,
      l->'before_allocations',l->'after_allocations',l->>'protected_reason');
  end loop;
  return v_run;
end $$;

create or replace function public.approve_inventory_cost_reassignment(p_run_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare r public.inventory_cost_reassignment_runs%rowtype;
begin
  perform public.lock_inventory_cost_review();
  select * into r from public.inventory_cost_reassignment_runs where id=p_run_id for update;
  if not found or r.status<>'previewed' or r.plan_version is distinct from 2 then raise exception '유효한 미리보기를 먼저 만드세요.'; end if;
  if r.source_snapshot is distinct from public.inventory_cost_review_snapshot(r.item_name) then raise exception '미리보기 이후 재고 또는 원가 기록이 변경됐습니다. 다시 미리보기 하세요.'; end if;
  if r.affected_outbound_count=0 then raise exception '변경할 원가 배정이 없습니다.'; end if;
  update public.inventory_cost_reassignment_runs set status='approved',approved_by=auth.uid(),approved_at=now() where id=r.id;
end $$;

create or replace function public.apply_inventory_cost_reassignment(p_run_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare r public.inventory_cost_reassignment_runs%rowtype; l jsonb; a jsonb; v_after jsonb;
begin
  perform public.lock_inventory_cost_review();
  select * into r from public.inventory_cost_reassignment_runs where id=p_run_id for update;
  if not found or r.status<>'approved' or r.plan_version is distinct from 2 then raise exception '승인된 미리보기가 필요합니다.'; end if;
  if r.source_snapshot is distinct from public.inventory_cost_review_snapshot(r.item_name) then raise exception '미리보기 이후 재고 또는 원가 기록이 변경됐습니다. 다시 미리보기 하세요.'; end if;
  if r.plan is distinct from public.calculate_inventory_cost_review(r.source_snapshot,r.from_at) then raise exception '원가 미리보기 검증 실패'; end if;
  for l in select value from jsonb_array_elements(r.plan->'lines') loop
    if l->'before_allocations' is not distinct from l->'after_allocations' then continue; end if;
    if l->>'protected_reason' is not null then raise exception '보호된 원가 배정입니다.'; end if;
    delete from public.inventory_cost_allocations where outbound_event_id=(l->>'outbound_event_id')::uuid;
    for a in select value from jsonb_array_elements(l->'after_allocations') loop
      insert into public.inventory_cost_allocations(outbound_event_id,source_layer_id,quantity,unit_cost)
      values((l->>'outbound_event_id')::uuid,(a->>'source_layer_id')::uuid,(a->>'quantity')::integer,(a->>'unit_cost')::integer);
    end loop;
    update public.inventory_cost_events set total_cost=(l->>'cost_after')::integer where id=(l->>'outbound_event_id')::uuid;
  end loop;
  update public.inventory_cost_layers l set remaining_quantity=p.value::integer
  from jsonb_each_text(r.plan->'remaining') p where l.id=p.key::uuid and l.remaining_quantity<>p.value::integer;
  v_after:=public.inventory_cost_review_snapshot(r.item_name);
  if r.source_snapshot->'balance' is distinct from v_after->'balance' then raise exception '재고 보존 검증 실패'; end if;
  -- Re-simulating also validates allocation totals and remaining quantities after writing.
  perform public.calculate_inventory_cost_review(v_after,r.from_at);
  update public.inventory_cost_reassignment_runs set status='applied',applied_at=now(),applied_by=auth.uid() where id=r.id;
end $$;

revoke all on function public.lock_inventory_cost_review(),public.inventory_cost_review_snapshot(text),
  public.calculate_inventory_cost_review(jsonb,timestamptz) from public,anon,authenticated;
revoke all on function public.preview_inventory_cost_reassignment(text,timestamptz,text),
  public.approve_inventory_cost_reassignment(uuid),public.apply_inventory_cost_reassignment(uuid) from public,anon;
grant execute on function public.preview_inventory_cost_reassignment(text,timestamptz,text),
  public.approve_inventory_cost_reassignment(uuid),public.apply_inventory_cost_reassignment(uuid) to authenticated;
