-- 급여는 선택한 미지급 근무분만 지급한다. 이미 지급한 근무분을 다시 합산하지 않는다.
create or replace function public.process_work_journal_payroll(
  p_journal_ids uuid[], p_kind text, p_hourly_rate integer, p_meal_allowance integer, p_paid_on date
) returns table(batch_id uuid, amount integer, memo text)
language plpgsql security definer set search_path=public as $$
declare
  v_worker text; v_month date; v_hours numeric; v_count integer; v_amount integer;
  v_category_id uuid; v_expense_id uuid; v_batch_id uuid; v_memo text; v_start date; v_end date;
begin
  if not exists(select 1 from public.users where id=auth.uid() and oss_role='master') then raise exception 'MASTER_REQUIRED'; end if;
  if p_kind not in ('advance','salary') or coalesce(array_length(p_journal_ids,1),0)=0 or p_hourly_rate<=0 or p_meal_allowance<0 or p_paid_on is null then raise exception 'INVALID_PAYROLL_INPUT'; end if;

  -- 같은 근무분을 동시에 두 번 지급하지 못하도록 먼저 잠근다.
  perform 1 from public.work_journals where id=any(p_journal_ids) for update;
  select min(worker_name), date_trunc('month',min(work_date))::date,
    sum(coalesce(input_work_hours,0)), count(*), min(work_date), max(work_date)
  into v_worker,v_month,v_hours,v_count,v_start,v_end
  from public.work_journals where id=any(p_journal_ids) and payment_status='unpaid';
  if v_worker is null or exists(
    select 1 from public.work_journals where id=any(p_journal_ids)
      and (worker_name<>v_worker or date_trunc('month',work_date)::date<>v_month or payment_status<>'unpaid')
  ) then raise exception 'PAYROLL_JOURNAL_MISMATCH'; end if;

  v_amount := floor(v_hours*p_hourly_rate*.991+v_count*p_meal_allowance);
  if p_kind='advance' then
    v_memo:=v_worker||' · '||to_char(v_start,'YYYY년 MM월 DD일')||'~'||to_char(v_end,'YYYY년 MM월 DD일')||' 급여 선지급';
  else
    v_memo:=v_worker||' · '||to_char(v_month,'YYYY년 MM월')||' 급여 지급'||
      case when exists(select 1 from public.work_journal_payroll_batches where worker_name=v_worker and payroll_month=v_month and payment_kind='advance')
        then ' (선지급 제외금액)' else '' end;
  end if;

  insert into public.settlement_expense_categories(name,is_active) values('급여지급',true)
    on conflict(name) do update set is_active=true returning id into v_category_id;
  insert into public.settlement_expenses(expense_date,category,category_id,amount,store,is_recurring,note,created_by)
    values(p_paid_on,'급여지급',v_category_id,v_amount,'ovape',false,v_memo,auth.uid()) returning id into v_expense_id;
  insert into public.work_journal_payroll_batches(worker_name,payroll_month,payment_kind,hourly_rate,meal_allowance,work_hours,work_count,amount,expense_id,paid_on,created_by)
    values(v_worker,v_month,p_kind,p_hourly_rate,p_meal_allowance,v_hours,v_count,v_amount,v_expense_id,p_paid_on,auth.uid()) returning id into v_batch_id;
  update public.work_journals set payment_status=p_kind,paid_at=now(),paid_by=auth.uid(),payroll_batch_id=v_batch_id,updated_at=now()
    where id=any(p_journal_ids) and payment_status='unpaid';
  return query select v_batch_id,v_amount,v_memo;
end; $$;

-- 지급 취소는 근무 상태·지급 배치·기타비용을 하나의 트랜잭션에서 함께 되돌린다.
create or replace function public.cancel_work_journal_payroll(p_batch_ids uuid[])
returns integer language plpgsql security definer set search_path=public as $$
declare v_expense_ids uuid[]; v_count integer;
begin
  if not exists(select 1 from public.users where id=auth.uid() and oss_role='master') then raise exception 'MASTER_REQUIRED'; end if;
  if coalesce(array_length(p_batch_ids,1),0)=0 then raise exception 'PAYROLL_BATCH_REQUIRED'; end if;
  perform 1 from public.work_journal_payroll_batches where id=any(p_batch_ids) for update;
  select count(*), array_agg(expense_id) into v_count,v_expense_ids
    from public.work_journal_payroll_batches where id=any(p_batch_ids);
  if v_count<>array_length(p_batch_ids,1) then raise exception 'PAYROLL_BATCH_NOT_FOUND'; end if;
  update public.work_journals set payment_status='unpaid',paid_at=null,paid_by=null,payroll_batch_id=null,updated_at=now()
    where payroll_batch_id=any(p_batch_ids);
  delete from public.work_journal_payroll_batches where id=any(p_batch_ids);
  delete from public.settlement_expenses where id=any(v_expense_ids);
  return v_count;
end; $$;
revoke all on function public.cancel_work_journal_payroll(uuid[]) from public,anon;
grant execute on function public.cancel_work_journal_payroll(uuid[]) to authenticated;
