alter table public.work_journal_payroll_batches
  add column if not exists other_expenses jsonb not null default '[]'::jsonb;

drop function if exists public.process_work_journal_payroll(uuid[], text, integer, integer, date, integer);

create function public.process_work_journal_payroll(
  p_journal_ids uuid[], p_kind text, p_hourly_rate integer,
  p_meal_allowance integer, p_paid_on date, p_amount_override integer default null,
  p_other_expenses jsonb default '[]'::jsonb
) returns table(batch_id uuid, amount integer, memo text)
language plpgsql security definer set search_path=public as $$
declare
  v_worker text; v_month date; v_hours numeric; v_count integer; v_amount integer;
  v_calculated_amount integer; v_category_id uuid; v_expense_id uuid; v_batch_id uuid;
  v_memo text; v_start date; v_end date; v_other_total integer; v_other_memo text;
  v_other_expenses jsonb;
begin
  if not exists(select 1 from public.users where id=auth.uid() and oss_role='master') then raise exception 'MASTER_REQUIRED'; end if;
  if p_kind not in ('advance','salary') or coalesce(array_length(p_journal_ids,1),0)=0 or p_hourly_rate<=0 or p_meal_allowance<0 or p_paid_on is null or p_amount_override < 0 or jsonb_typeof(coalesce(p_other_expenses,'[]'::jsonb))<>'array' then raise exception 'INVALID_PAYROLL_INPUT'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('name', btrim(item->>'name'), 'amount', (item->>'amount')::integer)), '[]'::jsonb),
    coalesce(sum((item->>'amount')::integer), 0),
    coalesce(string_agg(btrim(item->>'name') || ' ' || to_char((item->>'amount')::integer, 'FM999,999,999,990') || '원', ', '), '')
  into v_other_expenses, v_other_total, v_other_memo
  from jsonb_array_elements(coalesce(p_other_expenses,'[]'::jsonb)) item
  where btrim(coalesce(item->>'name',''))<>'';
  if exists(select 1 from jsonb_array_elements(coalesce(p_other_expenses,'[]'::jsonb)) item where btrim(coalesce(item->>'name',''))='' or coalesce(item->>'amount','') !~ '^[0-9]+$') then raise exception 'INVALID_PAYROLL_OTHER_EXPENSE'; end if;

  perform 1 from public.work_journals where id=any(p_journal_ids) for update;
  select min(worker_name), date_trunc('month',min(work_date))::date, sum(coalesce(input_work_hours,0)), count(*), min(work_date), max(work_date)
  into v_worker,v_month,v_hours,v_count,v_start,v_end
  from public.work_journals where id=any(p_journal_ids) and payment_status='unpaid';
  if v_worker is null or exists(select 1 from public.work_journals where id=any(p_journal_ids) and (worker_name<>v_worker or date_trunc('month',work_date)::date<>v_month or payment_status<>'unpaid')) then raise exception 'PAYROLL_JOURNAL_MISMATCH'; end if;

  v_calculated_amount := floor(v_hours*p_hourly_rate*.991+v_count*p_meal_allowance) + v_other_total;
  v_amount := coalesce(p_amount_override, v_calculated_amount);
  v_memo := '입력시간 ' || trim(to_char(v_hours, 'FM999999990.99')) || '시간, 시급 ' || to_char(p_hourly_rate, 'FM999,999,999,990') || '원, 총 근무 횟수 ' || v_count || '회, 식대 ' || to_char(v_count*p_meal_allowance, 'FM999,999,999,990') || '원' || case when v_other_memo<>'' then ', ' || v_other_memo else '' end || ' = 총 ' || to_char(v_amount, 'FM999,999,999,990') || '원';
  if p_amount_override is not null then v_memo := v_memo || ' (직접 수정)'; end if;

  insert into public.settlement_expense_categories(name,is_active) values('급여지급',true) on conflict(name) do update set is_active=true returning id into v_category_id;
  insert into public.settlement_expenses(expense_date,category,category_id,amount,store,is_recurring,note,created_by) values(p_paid_on,'급여지급',v_category_id,v_amount,'ovape',false,v_memo,auth.uid()) returning id into v_expense_id;
  insert into public.work_journal_payroll_batches(worker_name,payroll_month,payment_kind,hourly_rate,meal_allowance,work_hours,work_count,other_expenses,amount,expense_id,paid_on,created_by) values(v_worker,v_month,p_kind,p_hourly_rate,p_meal_allowance,v_hours,v_count,v_other_expenses,v_amount,v_expense_id,p_paid_on,auth.uid()) returning id into v_batch_id;
  update public.work_journals set payment_status=p_kind,paid_at=now(),paid_by=auth.uid(),payroll_batch_id=v_batch_id,updated_at=now() where id=any(p_journal_ids) and payment_status='unpaid';
  return query select v_batch_id,v_amount,v_memo;
end; $$;

revoke all on function public.process_work_journal_payroll(uuid[],text,integer,integer,date,integer,jsonb) from public,anon;
grant execute on function public.process_work_journal_payroll(uuid[],text,integer,integer,date,integer,jsonb) to authenticated;
notify pgrst, 'reload schema';
