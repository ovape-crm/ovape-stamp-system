-- 임시 시트 행을 신원 정보와 고객 후보 관계에 따라 별도 검토함으로 나눈다.
alter table public.customer_sheet_import_rows
  drop constraint if exists customer_sheet_import_rows_review_status_check;

alter table public.customer_sheet_import_rows
  add constraint customer_sheet_import_rows_review_status_check
  check (review_status in (
    'pending', 'matched', 'new_customer', 'hold', 'x_transfer', 'duplicate', 'applied',
    'missing_identity', 'similar_candidate', 'unmatched_identity'
  ));

create or replace function public.classify_customer_sheet_import_rows_v4(p_batch_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.users where id = auth.uid() and oss_role in ('admin', 'master')) then
    raise exception 'ADMIN_OR_MASTER_REQUIRED';
  end if;

  -- 이름 또는 유효한 휴대폰번호가 없는 행은 어떤 고객 후보와도 자동 연결하지 않는다.
  update public.customer_sheet_import_rows as import_row
  set review_status = 'missing_identity', selected_customer_id = null,
      review_note = '이름 또는 핸드폰번호가 없어 별도 보관', updated_at = now()
  where import_row.batch_id = p_batch_id and import_row.review_status = 'pending'
    and (
      btrim(import_row.customer_name) = ''
      or length(regexp_replace(import_row.customer_phone, '[^0-9]', '', 'g')) < 10
    );

  -- 이름과 휴대폰번호가 모두 같은 경우에만 기존 고객 연결 후보로 보낸다.
  update public.customer_sheet_import_rows as import_row
  set review_status = 'matched',
      selected_customer_id = (
        select customer.id from public.customers as customer
        where btrim(customer.name) = btrim(import_row.customer_name)
          and regexp_replace(customer.phone, '[^0-9]', '', 'g') = regexp_replace(import_row.customer_phone, '[^0-9]', '', 'g')
        order by customer.id limit 1
      ),
      review_note = '고객명·핸드폰번호 정확 일치', updated_at = now()
  where import_row.batch_id = p_batch_id and import_row.review_status = 'pending'
    and exists (
      select 1 from public.customers as customer
      where btrim(customer.name) = btrim(import_row.customer_name)
        and regexp_replace(customer.phone, '[^0-9]', '', 'g') = regexp_replace(import_row.customer_phone, '[^0-9]', '', 'g')
    );

  -- 이름 또는 번호 하나만 같은 경우는 사람이 확인할 수 있는 후보 묶음으로 분리한다.
  update public.customer_sheet_import_rows as import_row
  set review_status = 'similar_candidate', selected_customer_id = null,
      review_note = '이름 또는 핸드폰번호가 일부 일치하는 고객 후보가 있어 별도 검토 필요', updated_at = now()
  where import_row.batch_id = p_batch_id and import_row.review_status = 'pending'
    and exists (
      select 1 from public.customers as customer
      where btrim(customer.name) = btrim(import_row.customer_name)
         or regexp_replace(customer.phone, '[^0-9]', '', 'g') = regexp_replace(import_row.customer_phone, '[^0-9]', '', 'g')
    );

  -- 신원 정보는 완전하지만 어떤 고객 후보도 없는 행도 신규 생성 전에 따로 검토한다.
  update public.customer_sheet_import_rows as import_row
  set review_status = 'unmatched_identity', selected_customer_id = null,
      review_note = '이름·핸드폰번호는 있으나 기존 고객 후보가 없어 별도 보관', updated_at = now()
  where import_row.batch_id = p_batch_id and import_row.review_status = 'pending';

  -- 정확 일치 고객의 같은 날짜·유사 제품 이력은 연결 후보보다 우선하여 별도 보관한다.
  update public.customer_sheet_import_rows as import_row
  set review_status = 'duplicate',
      review_note = '같은 날짜의 기존 상세 이력에 유사한 제품 내용이 있어 별도 보관', updated_at = now()
  where import_row.batch_id = p_batch_id and import_row.review_status = 'matched'
    and exists (
      select 1 from public.logs as log
      cross join lateral (
        select item.value ->> 'itemName' as item_name
        from jsonb_array_elements(coalesce(log.jsonb -> 'items', '[]'::jsonb)) as item(value)
        union all select log.note where coalesce(log.note, '') <> ''
      ) as history
      where log.customer_id = import_row.selected_customer_id and log.category = 'stamp'
        and (log.created_at at time zone 'Asia/Seoul')::date = case
          when import_row.sold_at_text ~ '^\s*[0-9]{4}\.\s*[0-9]{1,2}\.\s*[0-9]{1,2}' then to_date(regexp_replace(import_row.sold_at_text, '^\s*([0-9]{4})\.\s*([0-9]{1,2})\.\s*([0-9]{1,2}).*$', '\1-\2-\3'), 'YYYY-MM-DD')
          when import_row.sold_at_text ~ '^\s*[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}' then to_date(regexp_replace(import_row.sold_at_text, '^\s*([0-9]{4}-[0-9]{1,2}-[0-9]{1,2}).*$', '\1'), 'YYYY-MM-DD')
          when import_row.sold_at_text ~ '^\s*[0-9]{4}년\s*[0-9]{1,2}월\s*[0-9]{1,2}일' then to_date(regexp_replace(import_row.sold_at_text, '^\s*([0-9]{4})년\s*([0-9]{1,2})월\s*([0-9]{1,2})일.*$', '\1-\2-\3'), 'YYYY-MM-DD')
          else null end
        and length(regexp_replace(lower(import_row.item_name), '[^0-9a-z가-힣]', '', 'g')) >= 4
        and length(regexp_replace(lower(history.item_name), '[^0-9a-z가-힣]', '', 'g')) >= 4
        and (regexp_replace(lower(import_row.item_name), '[^0-9a-z가-힣]', '', 'g') like '%' || regexp_replace(lower(history.item_name), '[^0-9a-z가-힣]', '', 'g') || '%'
          or regexp_replace(lower(history.item_name), '[^0-9a-z가-힣]', '', 'g') like '%' || regexp_replace(lower(import_row.item_name), '[^0-9a-z가-힣]', '', 'g') || '%')
    );
end;
$$;

revoke all on function public.classify_customer_sheet_import_rows_v4(uuid) from public, anon;
grant execute on function public.classify_customer_sheet_import_rows_v4(uuid) to authenticated;
