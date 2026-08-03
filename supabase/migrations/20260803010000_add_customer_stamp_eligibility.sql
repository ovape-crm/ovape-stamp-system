alter table public.customers
add column if not exists is_stamp_eligible boolean;

update public.customers
set is_stamp_eligible = true
where is_stamp_eligible is null;

alter table public.customers
alter column is_stamp_eligible set default true;

alter table public.customers
alter column is_stamp_eligible set not null;
