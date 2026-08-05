create table if not exists public.handover_memos (
  id uuid primary key default gen_random_uuid(),
  content text not null check (btrim(content) <> ''),
  author_name text not null default '직원',
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  is_completed boolean not null default false,
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  completed_by_name text
);

create index if not exists handover_memos_active_created_at_idx
on public.handover_memos (is_completed, created_at desc);

alter table public.handover_memos enable row level security;

drop policy if exists "authenticated users can read handover memos" on public.handover_memos;
create policy "authenticated users can read handover memos"
on public.handover_memos for select
to authenticated
using (true);

drop policy if exists "authenticated users can add handover memos" on public.handover_memos;
create policy "authenticated users can add handover memos"
on public.handover_memos for insert
to authenticated
with check (created_by = auth.uid());

drop policy if exists "authenticated users can complete handover memos" on public.handover_memos;
create policy "authenticated users can complete handover memos"
on public.handover_memos for update
to authenticated
using (true)
with check (true);

drop policy if exists "admins can delete handover memos" on public.handover_memos;
create policy "admins can delete handover memos"
on public.handover_memos for delete
to authenticated
using (
  exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and users.oss_role = 'admin'
  )
);
