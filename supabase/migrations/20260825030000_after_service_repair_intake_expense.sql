alter table public.settlement_expenses
  add column if not exists after_service_id bigint
    references public.after_services(id) on delete cascade;

create unique index if not exists settlement_expenses_after_service_intake_unique
  on public.settlement_expenses(after_service_id)
  where after_service_id is not null and category = 'A/S 접수비';

create or replace function public.process_after_service_repair_intake(
  p_after_service_id bigint,
  p_received_on date,
  p_memo text default null,
  p_has_store_cost boolean default false,
  p_store_cost_amount integer default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_after_service public.after_services%rowtype;
  v_category_id uuid;
  v_note text;
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid() and oss_role in ('staff', 'admin', 'master')
  ) then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_received_on is null then raise exception 'RECEIVED_ON_REQUIRED'; end if;
  if coalesce(p_has_store_cost, false)
    and coalesce(p_store_cost_amount, 0) <= 0
  then
    raise exception 'STORE_REPAIR_COST_REQUIRED';
  end if;

  select * into v_after_service
  from public.after_services
  where id = p_after_service_id
  for update;
  if not found then raise exception 'AFTER_SERVICE_NOT_FOUND'; end if;
  if v_after_service.status = 'sent_for_repair' then
    raise exception 'AFTER_SERVICE_STATUS_ALREADY_UPDATED';
  end if;

  v_note := '접수일 : ' || to_char(p_received_on, 'YYYY/MM/DD') ||
    case when nullif(btrim(coalesce(p_memo, '')), '') is not null
      then E'\n' || btrim(p_memo) else '' end;

  update public.after_services
  set status = 'sent_for_repair'
  where id = v_after_service.id;

  insert into public.logs(
    admin_id, customer_id, action, note, category, after_service_id
  ) values (
    auth.uid(), v_after_service.customer_id,
    'after-service-sent_for_repair', v_note,
    'after_service', v_after_service.id
  );

  if coalesce(p_has_store_cost, false) then
    insert into public.settlement_expense_categories(name, is_active, created_by)
    values ('A/S 접수비', true, auth.uid())
    on conflict(name) do update set is_active = true
    returning id into v_category_id;

    insert into public.settlement_expenses(
      expense_date, category_id, category, amount, store,
      is_recurring, note, created_by, after_service_id
    ) values (
      p_received_on, v_category_id, 'A/S 접수비', p_store_cost_amount,
      'ovape', false,
      'A/S #' || v_after_service.id::text || ' 수리 접수비',
      auth.uid(), v_after_service.id
    );
  end if;
end;
$$;

revoke all on function public.process_after_service_repair_intake(
  bigint, date, text, boolean, integer
) from public, anon, authenticated;
grant execute on function public.process_after_service_repair_intake(
  bigint, date, text, boolean, integer
) to authenticated;
