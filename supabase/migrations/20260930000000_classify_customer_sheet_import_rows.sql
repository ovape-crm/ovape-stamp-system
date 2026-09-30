-- 임시 작업대의 시트 행을 자동으로 분류한다. 이 함수는 고객 및 출고 이력을 생성·수정하지 않는다.
create or replace function public.classify_customer_sheet_import_rows(p_batch_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid() and oss_role in ('admin', 'master')
  ) then
    raise exception 'ADMIN_OR_MASTER_REQUIRED';
  end if;

  -- 이름과 정규화한 전화번호가 모두 정확히 일치하는 경우에만 기존 고객 후보로 보낸다.
  update public.customer_sheet_import_rows as import_row
  set review_status = 'matched',
      selected_customer_id = matched_customer.id,
      review_note = concat_ws(E'\n', nullif(import_row.review_note, ''), '고객명·핸드폰번호 정확 일치'),
      updated_at = now()
  from lateral (
    select customer.id
    from public.customers as customer
    where btrim(customer.name) = btrim(import_row.customer_name)
      and regexp_replace(customer.phone, '\\D', '', 'g') = regexp_replace(import_row.customer_phone, '\\D', '', 'g')
      and length(regexp_replace(import_row.customer_phone, '\\D', '', 'g')) >= 10
    order by customer.id
    limit 1
  ) as matched_customer
  where import_row.batch_id = p_batch_id
    and import_row.review_status = 'pending';

  -- 같은 고객의 같은 날짜 이력 중 제품명이 서로 포함되는 경우에는 반영 후보에서 빼고 별도 보관한다.
  update public.customer_sheet_import_rows as import_row
  set review_status = 'duplicate',
      review_note = concat_ws(E'\n', nullif(import_row.review_note, ''), '같은 날짜의 기존 상세 이력에 유사한 제품 내용이 있어 별도 보관'),
      updated_at = now()
  where import_row.batch_id = p_batch_id
    and import_row.review_status = 'matched'
    and exists (
      select 1
      from public.logs as log
      cross join lateral jsonb_array_elements(coalesce(log.jsonb -> 'items', '[]'::jsonb)) as item
      cross join lateral (
        select regexp_replace(lower(coalesce(item ->> 'itemName', log.note, '')), '[^0-9a-z가-힣]', '', 'g') as history_item,
               regexp_replace(lower(import_row.item_name), '[^0-9a-z가-힣]', '', 'g') as source_item
      ) as normalized
      where log.customer_id = import_row.selected_customer_id
        and (log.created_at at time zone 'Asia/Seoul')::date = case
          when import_row.sold_at_text ~ '^\\s*[0-9]{4}\\.\\s*[0-9]{1,2}\\.\\s*[0-9]{1,2}'
            then to_date(regexp_replace(import_row.sold_at_text, '^\\s*([0-9]{4})\\.\\s*([0-9]{1,2})\\.\\s*([0-9]{1,2}).*$', '\\1.\\2.\\3'), 'YYYY.MM.DD')
          when import_row.sold_at_text ~ '^\\s*[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}'
            then to_date(regexp_replace(import_row.sold_at_text, '^\\s*([0-9]{4}-[0-9]{1,2}-[0-9]{1,2}).*$', '\\1'), 'YYYY-MM-DD')
          else null
        end
        and length(normalized.source_item) >= 4
        and length(normalized.history_item) >= 4
        and (normalized.source_item like '%' || normalized.history_item || '%'
          or normalized.history_item like '%' || normalized.source_item || '%')
    );
end;
$$;

revoke all on function public.classify_customer_sheet_import_rows(uuid) from public, anon;
grant execute on function public.classify_customer_sheet_import_rows(uuid) to authenticated;
