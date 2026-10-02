-- 마감 취소 RPC를 배포 이력에 포함한다.
-- 기존에는 docs/daily_closing_report.sql에만 정의되어 있어 신규/배포 DB에서
-- PostgREST가 해당 RPC를 찾지 못할 수 있었다.
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
      and users.oss_role = 'admin'
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
  else
    update public.work_journals
    set
      input_work_hours = null,
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
