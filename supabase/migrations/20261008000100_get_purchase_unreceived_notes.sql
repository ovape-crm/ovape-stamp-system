create or replace function public.get_purchase_unreceived_notes(
  p_line_ids uuid[]
)
returns table (id uuid, unreceived_note text)
language sql
security definer
set search_path = public
as $$
  select pol.id, pol.unreceived_note
  from public.inventory_purchase_order_lines pol
  where pol.id = any(p_line_ids);
$$;

revoke all on function public.get_purchase_unreceived_notes(uuid[])
  from public, anon;
grant execute on function public.get_purchase_unreceived_notes(uuid[])
  to authenticated;

notify pgrst, 'reload schema';
