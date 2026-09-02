create or replace function public.rollback_after_service_creation_logs(
  p_after_service_id bigint
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid() and oss_role in ('staff', 'admin', 'master')
  ) then
    raise exception 'STAFF_REQUIRED';
  end if;

  if not exists (
    select 1 from public.after_services
    where id = p_after_service_id and admin_id = auth.uid()
  ) then
    raise exception 'AFTER_SERVICE_OWNER_REQUIRED';
  end if;

  delete from public.logs
  where after_service_id = p_after_service_id
    and admin_id = auth.uid()
    and category = 'stamp'
    and jsonb->>'afterServiceOperation' in ('exchange', 'cost');
end $$;

revoke all on function public.rollback_after_service_creation_logs(bigint) from public, anon;
grant execute on function public.rollback_after_service_creation_logs(bigint) to authenticated;
