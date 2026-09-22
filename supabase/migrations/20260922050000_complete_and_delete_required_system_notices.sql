create or replace function public.delete_required_system_notice(p_notice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.users where id = auth.uid() and oss_role = 'master'
  ) then
    raise exception '마스터만 공지를 삭제할 수 있습니다.';
  end if;

  if not exists (
    select 1 from public.required_system_notices notice
    where notice.id = p_notice_id
      and (
        notice.archived_at is not null
        or not exists (
          select 1 from public.required_system_notice_recipients recipient
          where recipient.notice_id = notice.id and recipient.acknowledged_at is null
        )
      )
  ) then
    raise exception '종료되었거나 모든 대상자가 확인한 공지만 삭제할 수 있습니다.';
  end if;

  delete from public.required_system_notices where id = p_notice_id;
end;
$$;

revoke all on function public.delete_required_system_notice(uuid) from public;
grant execute on function public.delete_required_system_notice(uuid) to authenticated;
