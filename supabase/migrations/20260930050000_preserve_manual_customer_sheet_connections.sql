-- 사용자가 확인해 지정한 고객 연결은 자동 중복 분류를 거쳐도 유지한다.
create or replace function public.classify_customer_sheet_import_rows_v6(p_batch_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.classify_customer_sheet_import_rows_v5(p_batch_id);

  update public.customer_sheet_import_rows as import_row
  set review_status = 'matched',
      selected_customer_id = (import_row.proposed_changes ->> 'manual_customer_id')::bigint,
      review_note = '수동 확인 고객으로 연결',
      updated_at = now()
  where import_row.batch_id = p_batch_id
    and import_row.proposed_changes ? 'manual_customer_id';
end;
$$;

revoke all on function public.classify_customer_sheet_import_rows_v6(uuid) from public, anon;
grant execute on function public.classify_customer_sheet_import_rows_v6(uuid) to authenticated;
