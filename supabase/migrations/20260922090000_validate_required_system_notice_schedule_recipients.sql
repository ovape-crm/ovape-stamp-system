alter table public.required_system_notice_schedules add column if not exists last_warning text;

create or replace function public.create_required_system_notice_schedule(p_title text,p_content text,p_recipient_ids uuid[],p_weekdays smallint[],p_send_time time)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_ids uuid[];
begin
 if not exists(select 1 from public.users where id=auth.uid() and oss_role='master') then raise exception '마스터만 반복 공지를 등록할 수 있습니다.'; end if;
 select array_agg(distinct source_id) into v_ids from unnest(coalesce(p_recipient_ids,'{}'::uuid[])) source_id join public.users on users.id=source_id;
 if btrim(coalesce(p_title,''))='' or cardinality(v_ids) is null or cardinality(v_ids)<>cardinality(p_recipient_ids) or cardinality(p_weekdays) is null or exists(select 1 from unnest(p_weekdays) weekday where weekday<0 or weekday>6) then raise exception '공지 대상자와 발송 요일을 확인해 주세요.'; end if;
 insert into public.required_system_notice_schedules(title,content,recipient_ids,weekdays,send_time,created_by) values(btrim(p_title),btrim(coalesce(p_content,'')),v_ids,(select array_agg(distinct weekday) from unnest(p_weekdays) weekday),p_send_time,auth.uid()) returning id into v_id; return v_id;
end $$;

create or replace function public.process_due_required_system_notice_schedules()
returns integer language plpgsql security definer set search_path=public as $$
declare schedule_row record; v_local timestamp; v_today date; v_sent_count integer:=0; v_notice_id uuid; v_recipient_ids uuid[];
begin
 perform pg_advisory_xact_lock(hashtextextended('required_system_notice_schedule_runner',0)); v_local:=now() at time zone 'Asia/Seoul'; v_today:=v_local::date;
 for schedule_row in select * from public.required_system_notice_schedules where is_active and extract(dow from v_local)::smallint=any(weekdays) and send_time<=v_local::time and last_sent_on is distinct from v_today loop
  begin
   select array_agg(distinct source_id) into v_recipient_ids from unnest(schedule_row.recipient_ids) source_id join public.users on users.id=source_id;
   if coalesce(cardinality(v_recipient_ids),0)=0 then update public.required_system_notice_schedules set last_failed_at=now(),last_error='유효한 발송 대상자가 없습니다.' where id=schedule_row.id; continue; end if;
   insert into public.required_system_notices(title,content,created_by) values(schedule_row.title,schedule_row.content,schedule_row.created_by) returning id into v_notice_id;
   insert into public.required_system_notice_recipients(notice_id,user_id) select v_notice_id,recipient_id from unnest(v_recipient_ids) recipient_id;
   update public.required_system_notice_schedules set last_sent_on=v_today,last_sent_at=now(),last_failed_at=null,last_error=null,last_warning=case when cardinality(v_recipient_ids)<cardinality(schedule_row.recipient_ids) then '삭제된 대상자는 제외하고 발송했습니다.' else null end where id=schedule_row.id; v_sent_count:=v_sent_count+1;
  exception when others then update public.required_system_notice_schedules set last_failed_at=now(),last_error=sqlerrm where id=schedule_row.id; end;
 end loop; return v_sent_count;
end $$;
