alter table public.comparison_columns
  add column if not exists is_visible_in_comparison boolean not null default true;
