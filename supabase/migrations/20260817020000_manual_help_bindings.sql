create table if not exists public.manual_help_bindings (
  location_key text primary key,
  manual_id uuid not null references public.manuals(id) on delete cascade,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

alter table public.manual_help_bindings enable row level security;

drop policy if exists "authenticated users can read manual help bindings"
on public.manual_help_bindings;
create policy "authenticated users can read manual help bindings"
on public.manual_help_bindings for select to authenticated using (true);

drop policy if exists "admins can save manual help bindings"
on public.manual_help_bindings;
create policy "admins can save manual help bindings"
on public.manual_help_bindings for all to authenticated
using (
  exists (select 1 from public.users where users.id = auth.uid() and users.oss_role = 'admin')
)
with check (
  exists (select 1 from public.users where users.id = auth.uid() and users.oss_role = 'admin')
);
