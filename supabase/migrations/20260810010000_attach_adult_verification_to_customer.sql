create or replace function public.attach_adult_verification_to_customer(
  p_request_id uuid,
  p_customer_id bigint
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.adult_verification_requests%rowtype;
begin
  if not exists (
    select 1 from public.users
    where users.id = auth.uid()
      and users.oss_role in ('staff', 'admin')
  ) then
    raise exception 'permission denied';
  end if;

  select * into v_request
  from public.adult_verification_requests
  where id = p_request_id
    and status = 'completed'
    and customer_id is null
  for update;

  if not found then
    return false;
  end if;

  update public.customers
  set adult_verified = true,
      adult_verified_at = coalesce(v_request.completed_at, now()),
      adult_verification_method = 'bbaton',
      adult_verified_by = null
  where id = p_customer_id;

  if not found then
    return false;
  end if;

  update public.adult_verification_requests
  set customer_id = p_customer_id,
      updated_at = now()
  where id = p_request_id;

  return true;
end;
$$;

revoke all on function public.attach_adult_verification_to_customer(uuid, bigint)
from public, anon;

grant execute on function public.attach_adult_verification_to_customer(uuid, bigint)
to authenticated;
