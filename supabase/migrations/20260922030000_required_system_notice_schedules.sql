create table public.required_system_notice_schedules (
  id uuid primary key default gen_random_uuid(),
  title text not null check (btrim(title) <> ''),
  content text not null default '',
  recipient_ids uuid[] not null check (cardinality(recipient_ids) > 0),
  weekdays smallint[] not null check (cardinality(weekdays) > 0),
  send_time time not null,
  is_active boolean not null default true,
  last_sent_on date,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.required_system_notice_schedules enable row level security;
create policy "masters can read notice schedules"
on public.required_system_notice_schedules for select to authenticated
using (exists (select 1 from public.users where id = auth.uid() and oss_role = 'master'));

create or replace function public.create_required_system_notice_schedule(
  p_title text, p_content text, p_recipient_ids uuid[], p_weekdays smallint[], p_send_time time
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not exists (select 1 from public.users where id = auth.uid() and oss_role = 'master') then raise exception '마스터만 반복 공지를 등록할 수 있습니다.'; end if;
  if btrim(coalesce(p_title, '')) = '' then raise exception '공지 제목을 입력해 주세요.'; end if;
  if cardinality(p_recipient_ids) is null or cardinality(p_recipient_ids) = 0 then raise exception '공지 대상자를 한 명 이상 선택해 주세요.'; end if;
  if cardinality(p_weekdays) is null or cardinality(p_weekdays) = 0 or exists (select 1 from unnest(p_weekdays) as weekday where weekday < 0 or weekday > 6) then raise exception '발송 요일을 선택해 주세요.'; end if;
  insert into public.required_system_notice_schedules (title, content, recipient_ids, weekdays, send_time, created_by)
  values (btrim(p_title), btrim(coalesce(p_content, '')), (select array_agg(distinct id) from unnest(p_recipient_ids) as id), (select array_agg(distinct weekday) from unnest(p_weekdays) as weekday), p_send_time, auth.uid()) returning id into v_id;
  return v_id;
end; $$;

create or replace function public.set_required_system_notice_schedule_active(p_schedule_id uuid, p_is_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.users where id = auth.uid() and oss_role = 'master') then raise exception '마스터만 반복 공지를 변경할 수 있습니다.'; end if;
  update public.required_system_notice_schedules set is_active = p_is_active where id = p_schedule_id;
end; $$;

create or replace function public.process_due_required_system_notice_schedules()
returns integer language plpgsql security definer set search_path = public as $$
declare schedule_row record; v_local timestamp; v_today date; v_sent_count integer := 0; v_notice_id uuid;
begin
  v_local := now() at time zone 'Asia/Seoul'; v_today := v_local::date;
  for schedule_row in select * from public.required_system_notice_schedules
    where is_active and extract(dow from v_local)::smallint = any(weekdays)
      and send_time <= v_local::time and last_sent_on is distinct from v_today
  loop
    insert into public.required_system_notices (title, content, created_by)
    values (schedule_row.title, schedule_row.content, schedule_row.created_by)
    returning id into v_notice_id;
    insert into public.required_system_notice_recipients (notice_id, user_id)
    select v_notice_id, recipient_id from unnest(schedule_row.recipient_ids) as recipient_id;
    update public.required_system_notice_schedules set last_sent_on = v_today where id = schedule_row.id;
    v_sent_count := v_sent_count + 1;
  end loop;
  return v_sent_count;
end; $$;

revoke all on function public.create_required_system_notice_schedule(text, text, uuid[], smallint[], time) from public;
revoke all on function public.set_required_system_notice_schedule_active(uuid, boolean) from public;
revoke all on function public.process_due_required_system_notice_schedules() from public;
grant execute on function public.create_required_system_notice_schedule(text, text, uuid[], smallint[], time) to authenticated;
grant execute on function public.set_required_system_notice_schedule_active(uuid, boolean) to authenticated;
grant execute on function public.process_due_required_system_notice_schedules() to service_role;
