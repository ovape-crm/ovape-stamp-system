create table if not exists public.inventory_movement_summary_settings (
  id text primary key default 'default' check (id = 'default'),
  default_group text not null default 'all' check (default_group in ('all', 'out', 'in')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

alter table public.inventory_movement_summary_settings enable row level security;

create policy "authenticated users can read inventory movement summary settings"
  on public.inventory_movement_summary_settings for select to authenticated using (true);

create or replace function public.save_inventory_movement_summary_default_group(
  p_default_group text
) returns public.inventory_movement_summary_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.inventory_movement_summary_settings;
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid() and oss_role = 'master'
  ) then
    raise exception 'MASTER_REQUIRED';
  end if;

  if p_default_group not in ('all', 'out', 'in') then
    raise exception 'INVALID_DEFAULT_GROUP';
  end if;

  insert into public.inventory_movement_summary_settings (id, default_group, updated_by)
  values ('default', p_default_group, auth.uid())
  on conflict (id) do update
  set default_group = excluded.default_group,
      updated_at = now(),
      updated_by = auth.uid()
  returning * into v_settings;

  return v_settings;
end;
$$;

revoke all on function public.save_inventory_movement_summary_default_group(text) from public, anon;
grant execute on function public.save_inventory_movement_summary_default_group(text) to authenticated;

insert into public.inventory_movement_summary_settings (id)
values ('default')
on conflict (id) do nothing;
