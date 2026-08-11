create or replace function public.create_customer_with_log(
  p_customer jsonb,
  p_adult_verification_request_id uuid default null
) returns public.customers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer public.customers%rowtype;
  v_phone text := btrim(p_customer->>'phone');
  v_attached boolean;
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid() and oss_role in ('staff', 'admin')
  ) then raise exception 'STAFF_REQUIRED'; end if;
  if v_phone is null or v_phone = '' then raise exception 'PHONE_REQUIRED'; end if;

  if v_phone <> 'X' then
    perform pg_advisory_xact_lock(hashtextextended('customer-phone:' || v_phone, 0));
    if exists (select 1 from public.customers where phone = v_phone) then
      raise exception 'DUPLICATE_CUSTOMER';
    end if;
  end if;

  insert into public.customers(
    name, phone, gender, is_stamp_eligible, address, note,
    adult_verified, adult_verified_at, adult_verification_method, adult_verified_by
  ) values (
    btrim(p_customer->>'name'),
    v_phone,
    p_customer->>'gender',
    coalesce((p_customer->>'is_stamp_eligible')::boolean, true),
    nullif(btrim(p_customer->>'address'), ''),
    nullif(btrim(p_customer->>'note'), ''),
    coalesce((p_customer->>'adult_verified')::boolean, false),
    (p_customer->>'adult_verified_at')::timestamptz,
    nullif(p_customer->>'adult_verification_method', ''),
    (p_customer->>'adult_verified_by')::uuid
  ) returning * into v_customer;

  if p_adult_verification_request_id is not null then
    v_attached := public.attach_adult_verification_to_customer(
      p_adult_verification_request_id,
      v_customer.id
    );
    if not v_attached then raise exception 'ADULT_VERIFICATION_ATTACH_FAILED'; end if;
    select * into v_customer from public.customers where id = v_customer.id;
  end if;

  insert into public.logs(admin_id, customer_id, action, note, jsonb, category)
  values(auth.uid(), v_customer.id, 'create-customer', '', '{}'::jsonb, 'customer');

  return v_customer;
end;
$$;

create or replace function public.update_customer_with_log(
  p_customer_id bigint,
  p_updates jsonb,
  p_changes jsonb
) returns public.customers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer public.customers%rowtype;
  v_phone text;
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid() and oss_role in ('staff', 'admin')
  ) then raise exception 'STAFF_REQUIRED'; end if;

  select * into v_customer
  from public.customers
  where id = p_customer_id
  for update;
  if not found then raise exception 'NOT_FOUND_CUSTOMER'; end if;

  if p_changes is null or p_changes = '{}'::jsonb then return v_customer; end if;

  v_phone := case when p_updates ? 'phone' then btrim(p_updates->>'phone') else v_customer.phone end;
  if v_phone <> 'X' then
    perform pg_advisory_xact_lock(hashtextextended('customer-phone:' || v_phone, 0));
    if exists (
      select 1 from public.customers
      where phone = v_phone and id <> p_customer_id
    ) then raise exception 'DUPLICATE_CUSTOMER'; end if;
  end if;

  update public.customers set
    name = case when p_updates ? 'name' then btrim(p_updates->>'name') else name end,
    phone = v_phone,
    gender = case when p_updates ? 'gender' then p_updates->>'gender' else gender end,
    is_stamp_eligible = case when p_updates ? 'is_stamp_eligible' then (p_updates->>'is_stamp_eligible')::boolean else is_stamp_eligible end,
    address = case when p_updates ? 'address' then nullif(btrim(p_updates->>'address'), '') else address end,
    note = case when p_updates ? 'note' then nullif(btrim(p_updates->>'note'), '') else note end
  where id = p_customer_id
  returning * into v_customer;

  insert into public.logs(admin_id, customer_id, action, note, jsonb, category)
  values(auth.uid(), p_customer_id, 'update-customer-info', '', p_changes, 'customer');

  return v_customer;
end;
$$;

revoke all on function public.create_customer_with_log(jsonb, uuid) from public, anon;
revoke all on function public.update_customer_with_log(bigint, jsonb, jsonb) from public, anon;
grant execute on function public.create_customer_with_log(jsonb, uuid) to authenticated;
grant execute on function public.update_customer_with_log(bigint, jsonb, jsonb) to authenticated;
