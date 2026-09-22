create table public.required_system_notices (
  id uuid primary key default gen_random_uuid(),
  title text not null check (btrim(title) <> ''),
  content text not null default '',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.required_system_notice_recipients (
  notice_id uuid not null references public.required_system_notices(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  acknowledged_at timestamptz,
  primary key (notice_id, user_id)
);

create index required_system_notice_recipients_pending_idx
  on public.required_system_notice_recipients (user_id, notice_id)
  where acknowledged_at is null;

alter table public.required_system_notices enable row level security;
alter table public.required_system_notice_recipients enable row level security;

create policy "notice recipients and masters can read notices"
on public.required_system_notices for select to authenticated
using (
  exists (select 1 from public.users where id = auth.uid() and oss_role = 'master')
  or exists (
    select 1 from public.required_system_notice_recipients recipient
    where recipient.notice_id = id and recipient.user_id = auth.uid()
  )
);

create policy "notice recipients and masters can read recipients"
on public.required_system_notice_recipients for select to authenticated
using (
  user_id = auth.uid()
  or exists (select 1 from public.users where id = auth.uid() and oss_role = 'master')
);

create or replace function public.create_required_system_notice(
  p_title text,
  p_content text,
  p_recipient_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notice_id uuid;
  v_recipient_count integer;
begin
  if not exists (
    select 1 from public.users where id = auth.uid() and oss_role = 'master'
  ) then
    raise exception '마스터만 시스템 공지를 발송할 수 있습니다.';
  end if;

  if btrim(coalesce(p_title, '')) = '' then
    raise exception '공지 제목을 입력해 주세요.';
  end if;

  select count(*) into v_recipient_count
  from public.users
  where id = any(coalesce(p_recipient_ids, '{}'::uuid[]));
  if v_recipient_count = 0 then
    raise exception '공지 대상자를 한 명 이상 선택해 주세요.';
  end if;

  insert into public.required_system_notices (title, content, created_by)
  values (btrim(p_title), btrim(coalesce(p_content, '')), auth.uid())
  returning id into v_notice_id;

  insert into public.required_system_notice_recipients (notice_id, user_id)
  select v_notice_id, id
  from public.users
  where id = any(p_recipient_ids)
  on conflict do nothing;

  return v_notice_id;
end;
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

  if not found then
    raise exception '확인할 수 없는 공지입니다.';
  end if;
end;
$$;

create or replace function public.archive_required_system_notice(p_notice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.users where id = auth.uid() and oss_role = 'master'
  ) then
    raise exception '마스터만 시스템 공지를 종료할 수 있습니다.';
  end if;

  update public.required_system_notices
  set archived_at = now()
  where id = p_notice_id and archived_at is null;
end;
$$;

create or replace function public.get_required_system_notice_users()
returns table (id uuid, name text, email text, oss_role text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.users where id = auth.uid() and oss_role = 'master'
  ) then
    raise exception '마스터만 공지 대상자를 조회할 수 있습니다.';
  end if;

  return query
  select users.id, users.name, users.email, users.oss_role
  from public.users users
  order by users.name;
end;
$$;

revoke all on function public.create_required_system_notice(text, text, uuid[]) from public;
revoke all on function public.acknowledge_required_system_notice(uuid) from public;
revoke all on function public.archive_required_system_notice(uuid) from public;
revoke all on function public.get_required_system_notice_users() from public;
grant execute on function public.create_required_system_notice(text, text, uuid[]) to authenticated;
grant execute on function public.acknowledge_required_system_notice(uuid) to authenticated;
grant execute on function public.archive_required_system_notice(uuid) to authenticated;
grant execute on function public.get_required_system_notice_users() to authenticated;

alter publication supabase_realtime add table public.required_system_notices;
alter publication supabase_realtime add table public.required_system_notice_recipients;
