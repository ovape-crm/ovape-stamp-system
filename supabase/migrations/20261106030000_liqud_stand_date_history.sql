create table if not exists public.liqud_stand_cell_date_history (
  id uuid primary key default gen_random_uuid(),
  cell_id uuid not null references public.liqud_stand_cells(id) on delete cascade,
  item_name text,
  secondary_item_name text,
  previous_installed_on date not null,
  changed_at timestamptz not null default now()
);

create index if not exists liqud_stand_cell_date_history_cell_changed_at_idx
  on public.liqud_stand_cell_date_history (cell_id, changed_at desc);

alter table public.liqud_stand_cell_date_history enable row level security;

drop policy if exists "authenticated users can read liqud stand date history"
  on public.liqud_stand_cell_date_history;
create policy "authenticated users can read liqud stand date history"
  on public.liqud_stand_cell_date_history
  for select to authenticated using (true);

create or replace function public.record_liqud_stand_cell_date_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.installed_on is not null
    and old.installed_on is distinct from new.installed_on then
    insert into public.liqud_stand_cell_date_history (
      cell_id,
      item_name,
      secondary_item_name,
      previous_installed_on
    ) values (
      old.id,
      old.item_name,
      old.secondary_item_name,
      old.installed_on
    );
  end if;
  return new;
end;
$$;

drop trigger if exists record_liqud_stand_cell_date_history
  on public.liqud_stand_cells;
create trigger record_liqud_stand_cell_date_history
before update of installed_on on public.liqud_stand_cells
for each row execute function public.record_liqud_stand_cell_date_history();

notify pgrst, 'reload schema';
