create or replace function public.update_required_system_notice_schedule(
  p_schedule_id uuid, p_title text, p_content text, p_recipient_ids uuid[], p_weekdays smallint[], p_send_time time
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.users where id = auth.uid() and oss_role = 'master') then raise exception '마스터만 반복 공지를 수정할 수 있습니다.'; end if;
  if btrim(coalesce(p_title, '')) = '' then raise exception '공지 제목을 입력해 주세요.'; end if;
  if cardinality(p_recipient_ids) is null or cardinality(p_recipient_ids) = 0 then raise exception '공지 대상자를 한 명 이상 선택해 주세요.'; end if;
  if cardinality(p_weekdays) is null or cardinality(p_weekdays) = 0 or exists (select 1 from unnest(p_weekdays) as weekday where weekday < 0 or weekday > 6) then raise exception '발송 요일을 선택해 주세요.'; end if;
  update public.required_system_notice_schedules set title = btrim(p_title), content = btrim(coalesce(p_content, '')), recipient_ids = (select array_agg(distinct source_id) from unnest(p_recipient_ids) as source_id), weekdays = (select array_agg(distinct weekday) from unnest(p_weekdays) as weekday), send_time = p_send_time where id = p_schedule_id;
end; $$;

create or replace function public.delete_required_system_notice_schedule(p_schedule_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.users where id = auth.uid() and oss_role = 'master') then raise exception '마스터만 반복 공지를 삭제할 수 있습니다.'; end if;
  delete from public.required_system_notice_schedules where id = p_schedule_id;
end; $$;

revoke all on function public.update_required_system_notice_schedule(uuid, text, text, uuid[], smallint[], time) from public;
revoke all on function public.delete_required_system_notice_schedule(uuid) from public;
grant execute on function public.update_required_system_notice_schedule(uuid, text, text, uuid[], smallint[], time) to authenticated;
grant execute on function public.delete_required_system_notice_schedule(uuid) to authenticated;
