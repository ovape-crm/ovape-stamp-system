create or replace function public.update_customer_with_adult_verification(
  p_customer_id bigint,
  p_updates jsonb,
  p_changes jsonb,
  p_adult_verification_method text,
  p_adult_verification_request_id uuid default null
) returns public.customers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer public.customers%rowtype;
  v_attached boolean;
  v_before_verified boolean;
  v_before_method text;
begin
  if p_adult_verification_method not in ('physical_id', 'bbaton') then
    raise exception 'INVALID_ADULT_VERIFICATION_METHOD';
  end if;

  select adult_verified, adult_verification_method
  into v_before_verified, v_before_method
  from public.customers
  where id = p_customer_id
  for update;
  if not found then raise exception 'NOT_FOUND_CUSTOMER'; end if;

  v_customer := public.update_customer_with_log(
    p_customer_id,
    coalesce(p_updates, '{}'::jsonb),
    coalesce(p_changes, '{}'::jsonb)
  );

  if p_adult_verification_method = 'physical_id' then
    update public.customers
    set adult_verified = true,
        adult_verified_at = case
          when adult_verified and adult_verification_method = 'physical_id'
            then adult_verified_at
          else now()
        end,
        adult_verification_method = 'physical_id',
        adult_verified_by = auth.uid()
    where id = p_customer_id
    returning * into v_customer;

    if not v_before_verified or v_before_method is distinct from 'physical_id' then
      insert into public.logs(admin_id, customer_id, action, note, jsonb, category)
      values(
        auth.uid(), p_customer_id, 'adult-verification-manual-complete', '',
        jsonb_build_object(
          'adultVerification', jsonb_build_object(
            'before', v_before_verified,
            'after', true,
            'method', 'physical_id',
            'verifiedAt', v_customer.adult_verified_at
          )
        ),
        'customer'
      );
    end if;
  elsif p_adult_verification_request_id is not null then
    v_attached := public.attach_adult_verification_to_customer(
      p_adult_verification_request_id,
      p_customer_id
    );
    if not v_attached then raise exception 'ADULT_VERIFICATION_ATTACH_FAILED'; end if;

    select * into v_customer from public.customers where id = p_customer_id;
    insert into public.logs(admin_id, customer_id, action, note, jsonb, category)
    values(
      auth.uid(), p_customer_id, 'adult-verification-link-complete', '',
      jsonb_build_object(
        'adultVerification', jsonb_build_object(
          'before', v_before_verified,
          'after', true,
          'method', 'bbaton',
          'verifiedAt', v_customer.adult_verified_at,
          'requestId', p_adult_verification_request_id
        )
      ),
      'customer'
    );
  end if;

  return v_customer;
end;
$$;

revoke all on function public.update_customer_with_adult_verification(
  bigint, jsonb, jsonb, text, uuid
) from public, anon;
grant execute on function public.update_customer_with_adult_verification(
  bigint, jsonb, jsonb, text, uuid
) to authenticated;
