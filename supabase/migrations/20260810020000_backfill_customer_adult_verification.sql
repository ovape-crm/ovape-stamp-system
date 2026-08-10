-- Existing real customers were checked in person before the system was introduced.
update public.customers
set adult_verified = true,
    adult_verified_at = coalesce(adult_verified_at, now()),
    adult_verification_method = 'physical_id',
    adult_verified_by = null
where not (
  upper(trim(coalesce(name, ''))) in ('X', 'X남자', 'X여자')
  or upper(trim(coalesce(phone, ''))) = 'X'
  or trim(coalesce(name, '')) in ('특수계정', '시연용', '재고조정')
);

-- Non-person accounts must never be treated as adult-verified customers.
update public.customers
set adult_verified = false,
    adult_verified_at = null,
    adult_verification_method = null,
    adult_verified_by = null
where upper(trim(coalesce(name, ''))) in ('X', 'X남자', 'X여자')
   or upper(trim(coalesce(phone, ''))) = 'X'
   or trim(coalesce(name, '')) in ('특수계정', '시연용', '재고조정');
