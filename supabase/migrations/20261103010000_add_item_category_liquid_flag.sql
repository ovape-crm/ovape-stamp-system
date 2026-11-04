alter table public.item_categories
  add column if not exists is_liquid_category boolean not null default false;
