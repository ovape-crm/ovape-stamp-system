create table if not exists public.work_journal_payroll_batches (
  id uuid primary key default gen_random_uuid(),
  worker_name text not null,
  payroll_month date not null,
  payment_kind text not null check (payment_kind in ('advance','salary')),
  hourly_rate integer not null check (hourly_rate > 0),
  meal_allowance integer not null check (meal_allowance >= 0),
  work_hours numeric not null,
  work_count integer not null,
  amount integer not null check (amount >= 0),
  expense_id uuid references public.settlement_expenses(id),
  paid_on date not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.work_journals add column if not exists payroll_batch_id uuid references public.work_journal_payroll_batches(id);
alter table public.work_journal_payroll_batches enable row level security;
create policy "master manages payroll batches" on public.work_journal_payroll_batches for all to authenticated using (exists(select 1 from public.users where id=auth.uid() and oss_role='master')) with check (exists(select 1 from public.users where id=auth.uid() and oss_role='master'));

create or replace function public.process_work_journal_payroll(
  p_journal_ids uuid[], p_kind text, p_hourly_rate integer, p_meal_allowance integer, p_paid_on date
) returns table(batch_id uuid, amount integer, memo text)
language plpgsql security definer set search_path=public as $$
declare v_worker text; v_month date; v_hours numeric; v_count integer; v_month_hours numeric; v_month_count integer; v_advance integer; v_amount integer; v_category_id uuid; v_expense_id uuid; v_batch_id uuid; v_memo text; v_start date; v_end date;
begin
 if not exists(select 1 from public.users where id=auth.uid() and oss_role='master') then raise exception 'MASTER_REQUIRED'; end if;
 if p_kind not in ('advance','salary') or coalesce(array_length(p_journal_ids,1),0)=0 or p_hourly_rate<=0 or p_meal_allowance<0 or p_paid_on is null then raise exception 'INVALID_PAYROLL_INPUT'; end if;
 select min(worker_name), date_trunc('month',min(work_date))::date, sum(coalesce(input_work_hours,0)), count(*), min(work_date), max(work_date) into v_worker,v_month,v_hours,v_count,v_start,v_end from public.work_journals where id=any(p_journal_ids) and payment_status='unpaid';
 if v_worker is null or exists(select 1 from public.work_journals where id=any(p_journal_ids) and (worker_name<>v_worker or date_trunc('month',work_date)::date<>v_month or payment_status<>'unpaid')) then raise exception 'PAYROLL_JOURNAL_MISMATCH'; end if;
 if p_kind='advance' then v_amount=floor(v_hours*p_hourly_rate*.991+v_count*p_meal_allowance); v_memo:=v_worker||' · '||to_char(v_start,'YYYY년 MM월 DD일')||'~'||to_char(v_end,'YYYY년 MM월 DD일')||' 급여 선지급';
 else select coalesce(sum(coalesce(input_work_hours,0)),0),count(*) into v_month_hours,v_month_count from public.work_journals where worker_name=v_worker and date_trunc('month',work_date)::date=v_month; select coalesce(sum(amount),0) into v_advance from public.work_journal_payroll_batches where worker_name=v_worker and payroll_month=v_month and payment_kind='advance'; v_amount=greatest(0,floor(v_month_hours*p_hourly_rate*.991+v_month_count*p_meal_allowance)-v_advance); v_memo:=v_worker||' · '||to_char(v_month,'YYYY년 MM월')||' 급여 지급'||case when v_advance>0 then ' (선지급 제외금액)' else '' end; end if;
 insert into public.settlement_expense_categories(name,is_active) values('급여지급',true) on conflict(name) do update set is_active=true returning id into v_category_id;
 insert into public.settlement_expenses(expense_date,category,category_id,amount,store,is_recurring,note,created_by) values(p_paid_on,'급여지급',v_category_id,v_amount,'ovape',false,v_memo,auth.uid()) returning id into v_expense_id;
 insert into public.work_journal_payroll_batches(worker_name,payroll_month,payment_kind,hourly_rate,meal_allowance,work_hours,work_count,amount,expense_id,paid_on,created_by) values(v_worker,v_month,p_kind,p_hourly_rate,p_meal_allowance,case when p_kind='advance' then v_hours else v_month_hours end,case when p_kind='advance' then v_count else v_month_count end,v_amount,v_expense_id,p_paid_on,auth.uid()) returning id into v_batch_id;
 update public.work_journals set payment_status=p_kind,paid_at=now(),paid_by=auth.uid(),payroll_batch_id=v_batch_id,updated_at=now() where id=any(p_journal_ids);
 return query select v_batch_id,v_amount,v_memo;
end; $$;
revoke all on function public.process_work_journal_payroll(uuid[],text,integer,integer,date) from public,anon; grant execute on function public.process_work_journal_payroll(uuid[],text,integer,integer,date) to authenticated;
