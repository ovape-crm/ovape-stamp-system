-- 구글시트 임시 검토·반영 기능 제거. 이미 생성된 customers / logs 이력은 보존한다.
drop function if exists public.record_customer_sheet_import_new_customer_history(uuid);
drop function if exists public.apply_customer_sheet_import_new_chunk_with_snapshot(uuid, integer);
drop function if exists public.apply_customer_sheet_import_matched_chunk_with_snapshot(uuid, integer);
drop function if exists public.rollback_customer_sheet_import_batch(uuid);
drop function if exists public.apply_customer_sheet_import_batch_with_snapshot(uuid);
drop function if exists public.apply_customer_sheet_import_row(bigint);
drop function if exists public.apply_customer_sheet_import_batch(uuid);
drop function if exists public.prepare_customer_sheet_import_unmatched_as_unknown(uuid);
drop function if exists public.classify_customer_sheet_import_exact_identity_matches(uuid);
drop function if exists public.classify_customer_sheet_import_post_system_history_similarity(uuid);
drop function if exists public.classify_customer_sheet_import_historical_phone_matches(uuid);
drop function if exists public.classify_customer_sheet_import_rows_v6(uuid);
drop function if exists public.classify_customer_sheet_import_rows_v5(uuid);
drop function if exists public.classify_customer_sheet_import_rows_v4(uuid);
drop function if exists public.classify_customer_sheet_import_rows_v3(uuid);
drop function if exists public.classify_customer_sheet_import_rows_v2(uuid);
drop function if exists public.classify_customer_sheet_import_rows(uuid);

drop table if exists public.customer_sheet_import_applied_fingerprints;
drop table if exists public.customer_sheet_import_rows;
drop table if exists public.customer_sheet_import_batches;
