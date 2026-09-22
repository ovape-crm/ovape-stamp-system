create or replace function public.get_pending_required_system_notices()
returns table (id uuid, title text, content text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select notice.id, notice.title, notice.content, notice.created_at
  from public.required_system_notices as notice
  join public.required_system_notice_recipients as recipient
    on recipient.notice_id = notice.id
  where recipient.user_id = auth.uid()
    and recipient.acknowledged_at is null
    and notice.archived_at is null
  order by notice.created_at asc;
$$;

create or replace function public.acknowledge_required_system_notice(p_notice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.required_system_notice_recipients
  set acknowledged_at = now()
  where notice_id = p_notice_id
    and user_id = auth.uid()
    and acknowledged_at is null;

  if found then
    return;
  end if;

  if exists (
    select 1 from public.required_system_notice_recipients
    where notice_id = p_notice_id and user_id = auth.uid()
  ) then
    return;
  end if;

  raise exception '확인할 수 없는 공지입니다.';
end;
$$;

revoke all on function public.get_pending_required_system_notices() from public;
grant execute on function public.get_pending_required_system_notices() to authenticated;
