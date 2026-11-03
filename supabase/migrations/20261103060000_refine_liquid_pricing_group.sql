alter table public.item_categories
  drop constraint if exists item_categories_liquid_sale_kind_check;

update public.item_categories
set liquid_sale_kind = null
where liquid_sale_kind not in ('mtl_event', 'mtl_basic', 'dtl_event', 'dtl_basic');

alter table public.item_categories
  add constraint item_categories_liquid_sale_kind_check
  check (liquid_sale_kind is null or liquid_sale_kind in ('mtl_event', 'mtl_basic', 'dtl_event', 'dtl_basic'));
