do $$
declare
  constraint_name text;
begin
  select con.conname
    into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace ns on ns.oid = rel.relnamespace
  where ns.nspname = 'public'
    and rel.relname = 'inventory_purchase_order_lines'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) like '%handling_type%';

  if constraint_name is not null then
    execute format(
      'alter table public.inventory_purchase_order_lines drop constraint %I',
      constraint_name
    );
  end if;
end
$$;

alter table public.inventory_purchase_order_lines
  add constraint inventory_purchase_order_lines_handling_type_check
  check (handling_type in ('none', 'demo', 'reservation', 'customer', 'memo'));
