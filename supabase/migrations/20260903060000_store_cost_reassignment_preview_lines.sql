create table if not exists public.inventory_cost_reassignment_preview_lines (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.inventory_cost_reassignment_runs(id) on delete cascade,
  outbound_event_id uuid not null references public.inventory_cost_events(id) on delete cascade,
  event_at timestamptz not null,
  cost_before integer,
  cost_after integer,
  created_at timestamptz not null default now(),
  unique(run_id, outbound_event_id)
);

alter table public.inventory_cost_reassignment_preview_lines enable row level security;
create policy "master reads reassignment preview lines"
on public.inventory_cost_reassignment_preview_lines for select to authenticated
using (exists (select 1 from public.users where id=auth.uid() and oss_role='master'));
