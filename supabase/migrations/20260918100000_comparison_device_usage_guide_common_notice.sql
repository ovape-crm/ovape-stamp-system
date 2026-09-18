create table if not exists public.comparison_device_usage_guide_settings (
  id text primary key default 'default' check (id = 'default'),
  common_header_content text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

alter table public.comparison_device_usage_guide_settings enable row level security;

create policy "authenticated reads comparison device usage guide settings"
  on public.comparison_device_usage_guide_settings for select to authenticated using (true);

create or replace function public.save_comparison_device_usage_guide_common_notice(
  p_common_header_content text
) returns public.comparison_device_usage_guide_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.comparison_device_usage_guide_settings;
begin
  if not exists (select 1 from public.users where id = auth.uid() and oss_role in ('admin', 'master')) then
    raise exception 'ADMIN_REQUIRED';
  end if;

  insert into public.comparison_device_usage_guide_settings(id, common_header_content, updated_by)
  values ('default', coalesce(p_common_header_content, ''), auth.uid())
  on conflict (id) do update
  set common_header_content = excluded.common_header_content,
      updated_at = now(),
      updated_by = auth.uid()
  returning * into v_settings;

  return v_settings;
end;
$$;

revoke all on function public.save_comparison_device_usage_guide_common_notice(text) from public, anon;
grant execute on function public.save_comparison_device_usage_guide_common_notice(text) to authenticated;

insert into public.comparison_device_usage_guide_settings(id)
values ('default')
on conflict (id) do nothing;
