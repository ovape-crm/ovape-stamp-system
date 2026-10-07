-- 적립금 보상으로 종료되는 A/S는 제품을 다시 입고하지 않는다. 출고·수동 원가는
-- 그대로 감사 이력으로 남기고, 이 완료 처리에서 확정한 금액만 손실 비용으로 기록한다.

create table if not exists public.after_service_credit_settlements (
  id uuid primary key default gen_random_uuid(),
  after_service_id bigint not null unique references public.after_services(id) on delete cascade,
  completed_on date not null,
  cost_mode text not null check (cost_mode in ('same', 'different')),
  original_cost integer not null check (original_cost >= 0),
  settled_cost integer not null check (settled_cost > 0),
  memo text,
  expense_id uuid not null references public.settlement_expenses(id),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.after_service_credit_settlements enable row level security;
create policy "authenticated reads A/S credit settlements"
on public.after_service_credit_settlements for select to authenticated using (true);

create or replace function public.guard_after_service_credit_processed_status()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status = 'credit_processed' and old.status is distinct from new.status then
    if not exists(select 1 from public.users where id=auth.uid() and oss_role='master') then
      raise exception 'MASTER_REQUIRED';
    end if;
    if not exists(
      select 1 from public.after_service_credit_settlements
      where after_service_id=new.id
    ) then
      raise exception 'CREDIT_PROCESSING_SETTLEMENT_REQUIRED';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists zz_guard_after_service_credit_processed_status on public.after_services;
create trigger zz_guard_after_service_credit_processed_status
before update of status on public.after_services
for each row execute function public.guard_after_service_credit_processed_status();

create or replace function public.get_after_service_credit_processing(p_after_service_id bigint)
returns table(original_cost integer, completed_on date, cost_mode text, settled_cost integer, memo text)
language plpgsql stable security definer set search_path=public as $$
declare
  v_original_cost integer := 0;
begin
  if not exists(select 1 from public.after_services where id=p_after_service_id) then
    raise exception 'AFTER_SERVICE_NOT_FOUND';
  end if;

  select coalesce(sum(allocation.unit_price * allocation.outbound_quantity), 0)::integer
  into v_original_cost
  from public.after_service_outbound_cost_allocations allocation
  where allocation.after_service_id=p_after_service_id
    and allocation.unit_price is not null;

  if v_original_cost = 0 then
    select coalesce(sum(
      least(cost_row.quantity, greatest(cost_row.hold_quantity - cost_row.prior_quantity, 0))
      * coalesce(cost_row.unit_cost, 0)
    ), 0)::integer
    into v_original_cost
    from (
      select allocation.quantity, allocation.unit_cost, hold.quantity as hold_quantity,
        coalesce(sum(allocation.quantity) over (
          order by allocation.created_at, allocation.id
          rows between unbounded preceding and 1 preceding
        ), 0) as prior_quantity
      from public.after_services service
      join public.defective_inventory_holds hold on hold.id=service.defective_hold_id
      join public.customer_refund_lines line on line.id=hold.refund_line_id
      join public.inventory_cost_events event
        on event.reference_type='stamp_log'
        and event.reference_id=hold.source_log_id::text
        and event.reference_line_key=(line.source_line_index + 1)::text
      join public.inventory_cost_allocations allocation on allocation.outbound_event_id=event.id
      where service.id=p_after_service_id
    ) cost_row;
  end if;

  return query
  select v_original_cost, settlement.completed_on, settlement.cost_mode,
    settlement.settled_cost, settlement.memo
  from public.after_service_credit_settlements settlement
  where settlement.after_service_id=p_after_service_id
  union all
  select v_original_cost, null::date, null::text, null::integer, null::text
  where not exists(
    select 1 from public.after_service_credit_settlements
    where after_service_id=p_after_service_id
  );
end $$;

create or replace function public.process_after_service_credit_processing(
  p_after_service_id bigint,
  p_completed_on date,
  p_cost_mode text,
  p_cost_amount integer default null,
  p_memo text default null
) returns void
language plpgsql security definer set search_path=public as $$
declare
  service public.after_services%rowtype;
  v_original_cost integer;
  v_settled_cost integer;
  v_category_id uuid;
  v_expense_id uuid;
  v_case_label text;
  v_note text;
  v_log_note text;
begin
  if not exists(select 1 from public.users where id=auth.uid() and oss_role='master') then
    raise exception 'MASTER_REQUIRED';
  end if;
  if p_completed_on is null then raise exception 'CREDIT_PROCESSING_DATE_REQUIRED'; end if;
  if p_cost_mode not in ('same','different') then raise exception 'CREDIT_PROCESSING_COST_MODE_REQUIRED'; end if;

  select * into service from public.after_services where id=p_after_service_id for update;
  if not found then raise exception 'AFTER_SERVICE_NOT_FOUND'; end if;
  if exists(
    select 1 from public.after_service_outbound_cost_allocations
    where after_service_id=service.id and coalesce(received_quantity, 0) > 0
  ) then raise exception 'CREDIT_PROCESSING_ALREADY_RECEIVED'; end if;

  select original_cost into v_original_cost
  from public.get_after_service_credit_processing(service.id)
  limit 1;
  v_settled_cost := case when p_cost_mode='same' then v_original_cost else p_cost_amount end;
  if coalesce(v_settled_cost, 0) <= 0 then raise exception 'CREDIT_PROCESSING_COST_REQUIRED'; end if;

  insert into public.settlement_expense_categories(name,is_active,created_by)
  values('A/S 적립금 처리',true,auth.uid())
  on conflict(name) do update set is_active=true
  returning id into v_category_id;

  v_case_label := case service.service_case_type
    when 'store_product_as' then '매장제품 A/S'
    when 'vendor_exchange' then '업체 불량교환'
    when 'defective_return_as' then '불량 반품 A/S'
    else '고객 A/S 추가'
  end;
  v_note := concat_ws(' · ', v_case_label,
    (select name from public.customers where id=service.customer_id),
    (select phone from public.customers where id=service.customer_id),
    service.item_name, '수량 ' || service.quantity || '개',
    '원가 ' || to_char(v_settled_cost, 'FM999,999,999,990') || '원 적립금처리 (손실)');

  select expense_id into v_expense_id
  from public.after_service_credit_settlements
  where after_service_id=service.id
  for update;

  if v_expense_id is null then
    insert into public.settlement_expenses(
      expense_date,category_id,category,amount,store,is_recurring,note,created_by
    ) values (
      p_completed_on,v_category_id,'A/S 적립금 처리',v_settled_cost,'common',false,v_note,auth.uid()
    ) returning id into v_expense_id;
  else
    update public.settlement_expenses set
      expense_date=p_completed_on, category_id=v_category_id,
      category='A/S 적립금 처리', amount=v_settled_cost, store='common',
      is_recurring=false, note=v_note, updated_at=now()
    where id=v_expense_id;
  end if;

  insert into public.after_service_credit_settlements(
    after_service_id,completed_on,cost_mode,original_cost,settled_cost,memo,expense_id,created_by
  ) values (
    service.id,p_completed_on,p_cost_mode,v_original_cost,v_settled_cost,
    nullif(btrim(coalesce(p_memo,'')),''),v_expense_id,auth.uid()
  ) on conflict(after_service_id) do update set
    completed_on=excluded.completed_on, cost_mode=excluded.cost_mode,
    original_cost=excluded.original_cost, settled_cost=excluded.settled_cost,
    memo=excluded.memo, expense_id=excluded.expense_id, updated_at=now();

  update public.after_services set status='credit_processed' where id=service.id;
  v_log_note := '완료일 : ' || to_char(p_completed_on,'YYYY/MM/DD') ||
    case when nullif(btrim(coalesce(p_memo,'')),'') is not null
      then E'\n' || btrim(p_memo) else '' end;
  update public.logs set note=v_log_note, updated_at=now()
  where after_service_id=service.id and category='after_service'
    and action='after-service-credit_processed';
  if not found then
    insert into public.logs(admin_id,customer_id,action,note,jsonb,category,after_service_id)
    values(auth.uid(),service.customer_id,'after-service-credit_processed',v_log_note,
      jsonb_build_object('creditProcessingCost',v_settled_cost,'costMode',p_cost_mode,'expenseId',v_expense_id),
      'after_service',service.id);
  end if;
end $$;

revoke all on function public.get_after_service_credit_processing(bigint) from public,anon;
grant execute on function public.get_after_service_credit_processing(bigint) to authenticated;
revoke all on function public.process_after_service_credit_processing(bigint,date,text,integer,text) from public,anon;
grant execute on function public.process_after_service_credit_processing(bigint,date,text,integer,text) to authenticated;
