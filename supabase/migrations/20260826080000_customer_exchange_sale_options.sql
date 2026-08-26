create or replace function public.get_customer_exchange_sale_options(
  p_customer_name text,
  p_customer_phone text,
  p_item_name text
) returns table(
  sale_log_id bigint,
  sale_line_index integer,
  sold_at timestamptz,
  sold_quantity integer,
  available_quantity integer,
  sale_note text
)
language sql
stable
security definer
set search_path = public
as $$
  with target_customer as (
    select customer.id
    from public.customers customer
    where btrim(customer.name) = btrim(p_customer_name)
      and regexp_replace(coalesce(customer.phone, ''), '[^0-9]', '', 'g') =
          regexp_replace(coalesce(p_customer_phone, ''), '[^0-9]', '', 'g')
    order by customer.created_at desc
    limit 1
  ), sales as (
    select
      log.id,
      item.ordinality::integer as line_index,
      log.created_at,
      (item.value->>'quantity')::integer as quantity,
      log.note
    from public.logs log
    join target_customer customer on customer.id = log.customer_id
    cross join lateral jsonb_array_elements(coalesce(log.jsonb->'items', '[]'::jsonb))
      with ordinality item(value, ordinality)
    where log.category = 'stamp'
      and btrim(item.value->>'itemName') = btrim(p_item_name)
      and coalesce(item.value->>'inventoryAction', 'out') in ('', 'out')
      and coalesce(item.value->>'remark', '') !~
        '^(서비스|시연용|교환입고|교환출고|A/S 교환출고|재고조정-(입고|출고))($|[,\s(])'
      and coalesce(item.value->>'quantity', '') ~ '^[0-9]+$'
  )
  select
    sale.id,
    sale.line_index,
    sale.created_at,
    sale.quantity,
    greatest(0, sale.quantity - coalesce((
      select sum(event.quantity)
      from public.inventory_cost_events event
      where event.event_type = 'customer_exchange_in'
        and event.metadata->>'sourceSaleLogId' = sale.id::text
        and event.metadata->>'sourceSaleLineIndex' = sale.line_index::text
    ), 0))::integer,
    sale.note
  from sales sale
  where sale.quantity > coalesce((
    select sum(event.quantity)
    from public.inventory_cost_events event
    where event.event_type = 'customer_exchange_in'
      and event.metadata->>'sourceSaleLogId' = sale.id::text
      and event.metadata->>'sourceSaleLineIndex' = sale.line_index::text
  ), 0)
  order by sale.created_at desc, sale.id desc;
$$;

revoke all on function public.get_customer_exchange_sale_options(text, text, text)
from public, anon;
grant execute on function public.get_customer_exchange_sale_options(text, text, text)
to authenticated;
