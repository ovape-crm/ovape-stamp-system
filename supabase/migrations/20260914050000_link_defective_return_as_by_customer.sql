create or replace function public.link_defective_return_after_service(p_hold_id uuid, p_after_service_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare hold public.defective_inventory_holds%rowtype; service public.after_services%rowtype;
begin
  if not public.is_current_user_master() then raise exception 'MASTER_REQUIRED'; end if;
  select * into hold from public.defective_inventory_holds where id = p_hold_id for update;
  if not found or hold.status <> 'held' or hold.after_service_id is not null then raise exception 'DEFECTIVE_HOLD_NOT_AVAILABLE'; end if;
  select * into service from public.after_services where id = p_after_service_id for update;
  if not found or service.service_case_type <> 'defective_return_as' or service.customer_id <> hold.customer_id or btrim(service.item_name) <> btrim(hold.item_name) or service.quantity <> hold.quantity then raise exception 'INVALID_DEFECTIVE_RETURN_AS'; end if;
  update public.after_services set refund_id = hold.refund_id, defective_hold_id = hold.id where id = service.id;
  update public.defective_inventory_holds set status = 'after_service', after_service_id = service.id, updated_at = now() where id = hold.id;
end $$;
revoke all on function public.link_defective_return_after_service(uuid,bigint) from public, anon;
grant execute on function public.link_defective_return_after_service(uuid,bigint) to authenticated;
