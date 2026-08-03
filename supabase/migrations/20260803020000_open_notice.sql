create table if not exists public.opening_completion_notice (
  id smallint primary key default 1 check (id = 1),
  title text not null default '오픈 처리가 완료되었습니다',
  content text not null default '',
  is_active boolean not null default false,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.opening_completion_notice (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.opening_completion_notice_reads (
  business_date date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  notice_version integer not null,
  acknowledged_at timestamptz not null default now(),
  primary key (business_date, user_id, notice_version)
);

alter table public.opening_completion_notice enable row level security;
alter table public.opening_completion_notice_reads enable row level security;

drop policy if exists "authenticated users can read opening notice" on public.opening_completion_notice;
create policy "authenticated users can read opening notice"
on public.opening_completion_notice for select
to authenticated
using (true);

drop policy if exists "users can read own opening notice acknowledgements" on public.opening_completion_notice_reads;
create policy "users can read own opening notice acknowledgements"
on public.opening_completion_notice_reads for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "users can acknowledge opening notice" on public.opening_completion_notice_reads;
create policy "users can acknowledge opening notice"
on public.opening_completion_notice_reads for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "users can update own opening notice acknowledgements" on public.opening_completion_notice_reads;
create policy "users can update own opening notice acknowledgements"
on public.opening_completion_notice_reads for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.save_opening_completion_notice(
  p_title text,
  p_content text,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid() and oss_role = 'admin'
  ) then
    raise exception '관리자만 오픈 완료 알림을 수정할 수 있습니다.';
  end if;

  if btrim(coalesce(p_title, '')) = '' then
    raise exception '알림 제목을 입력해 주세요.';
  end if;

  insert into public.opening_completion_notice (
    id, title, content, is_active, version, updated_at, updated_by
  ) values (
    1, btrim(p_title), btrim(coalesce(p_content, '')), p_is_active, 1, now(), auth.uid()
  )
  on conflict (id) do update set
    title = excluded.title,
    content = excluded.content,
    is_active = excluded.is_active,
    version = public.opening_completion_notice.version + 1,
    updated_at = now(),
    updated_by = auth.uid();
end;
$$;

revoke all on function public.save_opening_completion_notice(text, text, boolean) from public;
grant execute on function public.save_opening_completion_notice(text, text, boolean) to authenticated;
