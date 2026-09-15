alter table public.comparison_devices
  add column if not exists is_active boolean not null default true;

update public.comparison_devices
set is_active = true
where is_active is null;
