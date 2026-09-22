create or replace function public.get_required_system_notice_users()
returns table (id uuid, name text, email text, oss_role text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.users
    where public.users.id = auth.uid() and public.users.oss_role = 'master'
  ) then
    raise exception '마스터만 공지 대상자를 조회할 수 있습니다.';
  end if;

  return query
  select source_user.id, source_user.name, source_user.email, source_user.oss_role
  from public.users as source_user
  order by source_user.name;
end;
$$;
