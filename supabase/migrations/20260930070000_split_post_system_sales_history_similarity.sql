-- OSS 판매이력이 존재하는 기간의 시트 행 중, 같은 날짜의 기존 판매 품목과 유사한 행을 별도 검토한다.
alter table public.customer_sheet_import_rows
  drop constraint if exists customer_sheet_import_rows_review_status_check;

alter table public.customer_sheet_import_rows
  add constraint customer_sheet_import_rows_review_status_check
  check (review_status in (
    'pending', 'matched', 'new_customer', 'hold', 'x_transfer', 'duplicate', 'applied',
    'missing_identity', 'similar_candidate', 'unmatched_identity', 'historical_phone_match',
    'post_system_history_similarity'
  ));

create or replace function public.classify_customer_sheet_import_post_system_history_similarity(p_batch_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_system_history_start date;
begin
  if not exists (select 1 from public.users where id = auth.uid() and oss_role in ('admin', 'master')) then
    raise exception 'ADMIN_OR_MASTER_REQUIRED';
  end if;

  select min((created_at at time zone 'Asia/Seoul')::date)
  into v_system_history_start
  from public.logs
  where category = 'stamp';
  if v_system_history_start is null then return; end if;

  -- 기존 고객 연결 후보도 포함한다. 반영 완료 행만 보존하며 실제 고객·판매이력은 수정하지 않는다.
  update public.customer_sheet_import_rows as import_row
  set review_status = 'post_system_history_similarity',
      review_note = 'OSS 판매이력 시작일 이후 같은 날짜의 기존 판매 품목명과 유사',
      updated_at = now()
  where import_row.batch_id = p_batch_id
    and import_row.review_status <> 'applied'
    and exists (
      select 1
      from public.logs as history
      cross join lateral (
        select item.value ->> 'itemName' as item_name
        from jsonb_array_elements(coalesce(history.jsonb -> 'items', '[]'::jsonb)) as item(value)
        union all select history.note where coalesce(history.note, '') <> ''
      ) as history_item
      where history.category = 'stamp'
        and (history.created_at at time zone 'Asia/Seoul')::date = case
          when import_row.sold_at_text ~ '^\s*[0-9]{4}\.\s*[0-9]{1,2}\.\s*[0-9]{1,2}' then to_date(regexp_replace(import_row.sold_at_text, '^\s*([0-9]{4})\.\s*([0-9]{1,2})\.\s*([0-9]{1,2}).*$', '\1-\2-\3'), 'YYYY-MM-DD')
          when import_row.sold_at_text ~ '^\s*[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}' then to_date(regexp_replace(import_row.sold_at_text, '^\s*([0-9]{4}-[0-9]{1,2}-[0-9]{1,2}).*$', '\1'), 'YYYY-MM-DD')
          when import_row.sold_at_text ~ '^\s*[0-9]{4}년\s*[0-9]{1,2}월\s*[0-9]{1,2}일' then to_date(regexp_replace(import_row.sold_at_text, '^\s*([0-9]{4})년\s*([0-9]{1,2})월\s*([0-9]{1,2})일.*$', '\1-\2-\3'), 'YYYY-MM-DD')
          else null
        end
        and (history.created_at at time zone 'Asia/Seoul')::date >= v_system_history_start
        and length(regexp_replace(lower(import_row.item_name), '[^0-9a-z가-힣]', '', 'g')) >= 4
        and length(regexp_replace(lower(history_item.item_name), '[^0-9a-z가-힣]', '', 'g')) >= 4
        and (
          regexp_replace(lower(import_row.item_name), '[^0-9a-z가-힣]', '', 'g') like '%' || regexp_replace(lower(history_item.item_name), '[^0-9a-z가-힣]', '', 'g') || '%'
          or regexp_replace(lower(history_item.item_name), '[^0-9a-z가-힣]', '', 'g') like '%' || regexp_replace(lower(import_row.item_name), '[^0-9a-z가-힣]', '', 'g') || '%'
        )
    );
end;
$$;

revoke all on function public.classify_customer_sheet_import_post_system_history_similarity(uuid) from public, anon;
grant execute on function public.classify_customer_sheet_import_post_system_history_similarity(uuid) to authenticated;
