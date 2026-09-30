-- 이름과 유효한 휴대폰번호가 모두 없는 시트 행은 자동 연결 대상이 아니므로 보류로 둔다.
create or replace function public.classify_customer_sheet_import_rows_v5(p_batch_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.classify_customer_sheet_import_rows_v4(p_batch_id);

  update public.customer_sheet_import_rows as import_row
  set review_status = 'hold', selected_customer_id = null,
      review_note = '이름과 핸드폰번호가 모두 없어 보류', updated_at = now()
  where import_row.batch_id = p_batch_id
    and import_row.review_status = 'missing_identity'
    and btrim(import_row.customer_name) = ''
    and length(regexp_replace(import_row.customer_phone, '[^0-9]', '', 'g')) < 10;
end;
$$;

revoke all on function public.classify_customer_sheet_import_rows_v5(uuid) from public, anon;
grant execute on function public.classify_customer_sheet_import_rows_v5(uuid) to authenticated;
