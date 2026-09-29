-- 일회성 시트 정리에서 식별 불가 이력을 통합 X 계정 이전 후보로 분류한다.
alter table public.customer_sheet_import_rows
  drop constraint if exists customer_sheet_import_rows_review_status_check;
alter table public.customer_sheet_import_rows
  add constraint customer_sheet_import_rows_review_status_check
  check (review_status in ('pending','matched','new_customer','hold','x_transfer','applied'));
