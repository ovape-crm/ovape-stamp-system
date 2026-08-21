create extension if not exists pg_trgm with schema extensions;

create index if not exists inventory_movements_created_id_idx
on public.inventory_movements (created_at desc, id desc);

do $$
declare
  opclass_schema text;
begin
  select namespace.nspname
  into opclass_schema
  from pg_opclass operator_class
  join pg_namespace namespace on namespace.oid = operator_class.opcnamespace
  join pg_am access_method on access_method.oid = operator_class.opcmethod
  where operator_class.opcname = 'gin_trgm_ops'
    and access_method.amname = 'gin'
  order by namespace.nspname
  limit 1;

  if opclass_schema is null then
    raise exception 'gin_trgm_ops operator class was not installed';
  end if;

  execute format(
    'create index if not exists inventory_movements_item_name_trgm_idx on public.inventory_movements using gin (item_name %I.gin_trgm_ops)',
    opclass_schema
  );
end
$$;

create index if not exists inventory_movements_item_date_id_idx
on public.inventory_movements (item_name, created_at desc, id desc);
