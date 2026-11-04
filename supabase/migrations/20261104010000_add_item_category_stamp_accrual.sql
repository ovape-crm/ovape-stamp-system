alter table public.item_categories
  add column if not exists is_stamp_eligible boolean not null default false,
  add column if not exists stamp_count_per_item integer not null default 0;

alter table public.item_categories
  drop constraint if exists item_categories_stamp_count_per_item_check,
  add constraint item_categories_stamp_count_per_item_check
    check (stamp_count_per_item >= 0);
