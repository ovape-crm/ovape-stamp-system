alter table public.item_categories
  add column if not exists liquid_sale_kind text;

alter table public.item_categories
  add constraint item_categories_liquid_sale_kind_check
  check (liquid_sale_kind is null or liquid_sale_kind in (
    'mtl_event', 'mtl_basic', 'dtl_event', 'dtl_basic',
    'mtl_prepaid', 'dtl_prepaid', 'mtl_test', 'dtl_test'
  ));
