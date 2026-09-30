-- 저장된 임시 시트 행을 실제 고객/이력 데이터 수정 없이 다시 분류한다.
create or replace function public.classify_customer_sheet_import_rows_v3(p_batch_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.users where id = auth.uid() and oss_role in ('admin', 'master')) then
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
    and import_row.review_status = 'pending'
    and length(regexp_replace(import_row.customer_phone, '[^0-9]', '', 'g')) >= 10
    and exists (
      select 1
      from public.customers as customer
      where btrim(customer.name) = btrim(import_row.customer_name)
        and regexp_replace(customer.phone, '[^0-9]', '', 'g') = regexp_replace(import_row.customer_phone, '[^0-9]', '', 'g')
    );

  update public.customer_sheet_import_rows as import_row
  set review_status = 'duplicate',
      review_note = concat_ws(E'\n', nullif(import_row.review_note, ''), '같은 날짜의 기존 상세 이력에 유사한 제품 내용이 있어 별도 보관'),
      updated_at = now()
  where import_row.batch_id = p_batch_id
    and import_row.review_status = 'matched'
    and exists (
      select 1
      from public.logs as log
      cross join lateral (
        select item.value ->> 'itemName' as item_name
        from jsonb_array_elements(coalesce(log.jsonb -> 'items', '[]'::jsonb)) as item(value)
        union all
        select log.note where coalesce(log.note, '') <> ''
      ) as history
      where log.customer_id = import_row.selected_customer_id
        and log.category = 'stamp'
        and (log.created_at at time zone 'Asia/Seoul')::date = case
          when import_row.sold_at_text ~ '^\s*[0-9]{4}\.\s*[0-9]{1,2}\.\s*[0-9]{1,2}' then to_date(regexp_replace(import_row.sold_at_text, '^\s*([0-9]{4})\.\s*([0-9]{1,2})\.\s*([0-9]{1,2}).*$', '\1-\2-\3'), 'YYYY-MM-DD')
          when import_row.sold_at_text ~ '^\s*[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}' then to_date(regexp_replace(import_row.sold_at_text, '^\s*([0-9]{4}-[0-9]{1,2}-[0-9]{1,2}).*$', '\1'), 'YYYY-MM-DD')
          when import_row.sold_at_text ~ '^\s*[0-9]{4}년\s*[0-9]{1,2}월\s*[0-9]{1,2}일' then to_date(regexp_replace(import_row.sold_at_text, '^\s*([0-9]{4})년\s*([0-9]{1,2})월\s*([0-9]{1,2})일.*$', '\1-\2-\3'), 'YYYY-MM-DD')
          else null
        end
        and length(regexp_replace(lower(import_row.item_name), '[^0-9a-z가-힣]', '', 'g')) >= 4
        and length(regexp_replace(lower(history.item_name), '[^0-9a-z가-힣]', '', 'g')) >= 4
        and (
          regexp_replace(lower(import_row.item_name), '[^0-9a-z가-힣]', '', 'g') like '%' || regexp_replace(lower(history.item_name), '[^0-9a-z가-힣]', '', 'g') || '%'
          or regexp_replace(lower(history.item_name), '[^0-9a-z가-힣]', '', 'g') like '%' || regexp_replace(lower(import_row.item_name), '[^0-9a-z가-힣]', '', 'g') || '%'
        )
    );
end;
$$;

revoke all on function public.classify_customer_sheet_import_rows_v3(uuid) from public, anon;
grant execute on function public.classify_customer_sheet_import_rows_v3(uuid) to authenticated;
