-- 기존 반영 함수에 잘못 남은 이중 이스케이프를 바로잡는다.
do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.apply_customer_sheet_import_batch(uuid)'::regprocedure)
    into v_definition;
  v_definition := replace(v_definition, E'\\\\', E'\\');
  execute v_definition;
end;
$$;

-- 현재 임시 작업대의 한글 날짜 표기를 반영 함수가 공통으로 읽는 표준 표기로 정규화한다.
update public.customer_sheet_import_rows
set sold_at_text = regexp_replace(
  sold_at_text,
  '^\\s*([0-9]{4})년\\s*([0-9]{1,2})월\\s*([0-9]{1,2})일.*$',
  E'\\1.\\2.\\3'
)
where sold_at_text ~ '^\\s*[0-9]{4}년\\s*[0-9]{1,2}월\\s*[0-9]{1,2}일';
