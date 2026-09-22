alter table public.required_system_notice_schedules
  add column if not exists last_sent_at timestamptz,
  add column if not exists last_failed_at timestamptz,
  add column if not exists last_error text;

create or replace function public.process_due_required_system_notice_schedules()
returns integer language plpgsql security definer set search_path=public as $$
declare schedule_row record; v_local timestamp; v_today date; v_sent_count integer := 0; v_notice_id uuid; v_recipient_ids uuid[];
begin
  perform pg_advisory_xact_lock(hashtextextended('required_system_notice_schedule_runner', 0));
  v_local := now() at time zone 'Asia/Seoul'; v_today := v_local::date;
  for schedule_row in select * from public.required_system_notice_schedules
    where is_active and extract(dow from v_local)::smallint = any(weekdays)
      and send_time <= v_local::time and last_sent_on is distinct from v_today
  loop
    begin
      select array_agg(distinct source_id) into v_recipient_ids
      from unnest(schedule_row.recipient_ids) as source_id
      join public.users on users.id = source_id;
      if coalesce(cardinality(v_recipient_ids), 0) = 0 then
        update public.required_system_notice_schedules set last_failed_at=now(), last_error='유효한 발송 대상자가 없습니다.' where id=schedule_row.id;
        continue;
      end if;
      insert into public.required_system_notices (title, content, created_by) values (schedule_row.title, schedule_row.content, schedule_row.created_by) returning id into v_notice_id;
      insert into public.required_system_notice_recipients (notice_id, user_id) select v_notice_id, recipient_id from unnest(v_recipient_ids) as recipient_id;
      update public.required_system_notice_schedules set last_sent_on=v_today, last_sent_at=now(), last_failed_at=null, last_error=case when cardinality(v_recipient_ids) < cardinality(schedule_row.recipient_ids) then '삭제된 대상자는 제외하고 발송했습니다.' else null end where id=schedule_row.id;
      v_sent_count := v_sent_count + 1;
    exception when others then
      update public.required_system_notice_schedules set last_failed_at=now(), last_error=sqlerrm where id=schedule_row.id;
    end;
  end loop;
  return v_sent_count;
end; $$;

create extension if not exists pg_cron;
select cron.schedule(
  'required-system-notice-schedule-runner',
  '* * * * *',
  $$select public.process_due_required_system_notice_schedules();$$
);
