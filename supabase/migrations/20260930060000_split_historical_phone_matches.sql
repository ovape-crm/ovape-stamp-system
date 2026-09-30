-- 현재 고객번호와는 다르지만 고객정보 변경이력의 이전 번호와 일치하는 시트 행을 별도 검토한다.
alter table public.customer_sheet_import_rows
  drop constraint if exists customer_sheet_import_rows_review_status_check;

alter table public.customer_sheet_import_rows
  add constraint customer_sheet_import_rows_review_status_check
  check (review_status in (
    'pending', 'matched', 'new_customer', 'hold', 'x_transfer', 'duplicate', 'applied',
    'missing_identity', 'similar_candidate', 'unmatched_identity', 'historical_phone_match'
  ));

create or replace function public.classify_customer_sheet_import_historical_phone_matches(p_batch_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.users where id = auth.uid() and oss_role in ('admin', 'master')) then
    raise exception 'ADMIN_OR_MASTER_REQUIRED';
  end if;

  -- 기존 고객 연결 후보와 반영 완료 행은 절대 변경하지 않는다.
  update public.customer_sheet_import_rows as import_row
  set review_status = 'historical_phone_match',
      selected_customer_id = (
        select history.customer_id
        from public.logs as history
        where history.action = 'update-customer-info'
          and history.customer_id is not null
          and regexp_replace(coalesce(history.jsonb -> 'phone' ->> 'old', ''), '[^0-9]', '', 'g') = regexp_replace(import_row.customer_phone, '[^0-9]', '', 'g')
        order by history.created_at desc, history.id desc
        limit 1
      ),
      review_note = '고객정보 변경이력의 이전 핸드폰번호와 일치',
      updated_at = now()
  where import_row.batch_id = p_batch_id
    and import_row.review_status not in ('matched', 'applied', 'duplicate')
    and length(regexp_replace(import_row.customer_phone, '[^0-9]', '', 'g')) >= 10
    and exists (
      select 1
      from public.logs as history
      where history.action = 'update-customer-info'
        and history.customer_id is not null
        and regexp_replace(coalesce(history.jsonb -> 'phone' ->> 'old', ''), '[^0-9]', '', 'g') = regexp_replace(import_row.customer_phone, '[^0-9]', '', 'g')
    );
end;
$$;

revoke all on function public.classify_customer_sheet_import_historical_phone_matches(uuid) from public, anon;
grant execute on function public.classify_customer_sheet_import_historical_phone_matches(uuid) to authenticated;
