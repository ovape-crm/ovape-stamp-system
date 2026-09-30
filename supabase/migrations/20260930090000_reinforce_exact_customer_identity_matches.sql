-- 이름과 전화번호가 모두 일치하면 동명이인이 있어도 전화번호까지 일치한 기존 고객을 우선 후보로 둔다.
create or replace function public.classify_customer_sheet_import_exact_identity_matches(p_batch_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid() and oss_role in ('admin', 'master')
  ) then
    raise exception 'ADMIN_OR_MASTER_REQUIRED';
  end if;

  update public.customer_sheet_import_rows as import_row
  set review_status = 'matched',
      selected_customer_id = (
        select customer.id
        from public.customers as customer
        where btrim(customer.name) = btrim(import_row.customer_name)
          and regexp_replace(customer.phone, '[^0-9]', '', 'g') = regexp_replace(import_row.customer_phone, '[^0-9]', '', 'g')
        order by customer.id
        limit 1
      ),
      review_note = concat_ws(E'\n', nullif(import_row.review_note, ''), '고객명·핸드폰번호 정확 일치'),
      updated_at = now()
  where import_row.batch_id = p_batch_id
    and import_row.review_status not in ('matched', 'applied', 'duplicate')
    and length(regexp_replace(import_row.customer_phone, '[^0-9]', '', 'g')) >= 10
    and exists (
      select 1 from public.customers as customer
      where btrim(customer.name) = btrim(import_row.customer_name)
        and regexp_replace(customer.phone, '[^0-9]', '', 'g') = regexp_replace(import_row.customer_phone, '[^0-9]', '', 'g')
    );

  get diagnostics v_updated = row_count;
  update public.customer_sheet_import_batches set updated_at = now() where id = p_batch_id;
  return v_updated;
end;
$$;

revoke all on function public.classify_customer_sheet_import_exact_identity_matches(uuid) from public, anon;
grant execute on function public.classify_customer_sheet_import_exact_identity_matches(uuid) to authenticated;
