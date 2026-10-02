-- 마스터는 과거 마감 정정 업무를 수행할 수 있도록 관리자와 동일하게 취급한다.
create or replace function public.cancel_daily_closing_report(
  p_business_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report public.daily_closing_reports%rowtype;
  v_is_admin boolean;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and users.oss_role in ('admin', 'master')
  ) into v_is_admin;

  if not v_is_admin and p_business_date <> v_today then
    raise exception 'CANCEL_NOT_ALLOWED';
  end if;

  select *
  into v_report
  from public.daily_closing_reports
  where business_date = p_business_date
  for update;

  if not found then
    raise exception 'CLOSING_REPORT_NOT_FOUND';
  end if;

  if v_report.closed_work_journal then
    update public.work_journals
    set
      end_time = coalesce(expected_end_time, end_time),
      input_work_hours = null,
      status = 'working',
      updated_at = now()
    where work_date = p_business_date;
  end if;

  delete from public.daily_closing_reports
  where id = v_report.id;
end;
$$;

revoke all on function public.cancel_daily_closing_report(date) from public;
grant execute on function public.cancel_daily_closing_report(date)
  to authenticated;

notify pgrst, 'reload schema';
