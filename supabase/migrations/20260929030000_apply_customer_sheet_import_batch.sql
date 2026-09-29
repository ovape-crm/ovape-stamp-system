-- 검토된 구글시트 판매 행만 고객·출고 이력으로 반영한다.
-- 재고 및 스탬프는 과거 이력 가져오기에서 변경하지 않는다.
alter table public.customer_sheet_import_rows
  drop constraint if exists customer_sheet_import_rows_review_status_check;
alter table public.customer_sheet_import_rows
  add constraint customer_sheet_import_rows_review_status_check
  check (review_status in ('pending','matched','new_customer','hold','x_transfer','duplicate','applied'));

alter table public.customer_sheet_import_rows
  add column if not exists applied_log_id bigint references public.logs(id);

create table if not exists public.customer_sheet_import_applied_fingerprints (
  fingerprint text primary key,
  batch_id uuid not null references public.customer_sheet_import_batches(id) on delete cascade,
  row_id bigint not null references public.customer_sheet_import_rows(id) on delete cascade,
  log_id bigint not null references public.logs(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.customer_sheet_import_applied_fingerprints enable row level security;
create policy "admin and master read customer sheet import fingerprints"
  on public.customer_sheet_import_applied_fingerprints for select to authenticated
  using (exists (select 1 from public.users where id = auth.uid() and oss_role in ('admin','master')));

create or replace function public.apply_customer_sheet_import_batch(p_batch_id uuid)
returns table(applied_rows integer, duplicate_rows integer, held_rows integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.customer_sheet_import_rows%rowtype;
  v_customer_id bigint;
  v_log_id bigint;
  v_fingerprint text;
  v_sale_date date;
  v_payment_type text;
  v_store_name text;
  v_gender text;
  v_applied integer := 0;
  v_duplicates integer := 0;
  v_held integer := 0;
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid() and oss_role in ('admin', 'master')
  ) then
    raise exception 'ADMIN_OR_MASTER_REQUIRED';
  end if;

  -- 같은 작업대를 동시에 두 번 반영하지 못하도록 잠근다.
  perform 1 from public.customer_sheet_import_batches where id = p_batch_id for update;
  if not found then raise exception 'IMPORT_BATCH_NOT_FOUND'; end if;

  for v_row in
    select * from public.customer_sheet_import_rows
    where batch_id = p_batch_id and review_status in ('matched', 'new_customer', 'x_transfer')
    order by source_row_number, id
    for update
  loop
    if nullif(btrim(v_row.item_name), '') is null then
      update public.customer_sheet_import_rows set review_status = 'hold', review_note = concat_ws(E'\n', nullif(review_note, ''), '제품명이 없어 반영하지 않음'), updated_at = now() where id = v_row.id;
      v_held := v_held + 1;
      continue;
    end if;

    v_sale_date := case
      when v_row.sold_at_text ~ '^\\s*[0-9]{4}\\.\\s*[0-9]{1,2}\\.\\s*[0-9]{1,2}'
        then to_date(regexp_replace(v_row.sold_at_text, '^\\s*([0-9]{4})\\.\\s*([0-9]{1,2})\\.\\s*([0-9]{1,2}).*$', '\\1.\\2.\\3'), 'YYYY.MM.DD')
      when v_row.sold_at_text ~ '^\\s*[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}'
        then to_date(regexp_replace(v_row.sold_at_text, '^\\s*([0-9]{4}-[0-9]{1,2}-[0-9]{1,2}).*$', '\\1'), 'YYYY-MM-DD')
      else null
    end;
    if v_sale_date is null then
      update public.customer_sheet_import_rows set review_status = 'hold', review_note = concat_ws(E'\n', nullif(review_note, ''), '판매 날짜를 읽지 못해 반영하지 않음'), updated_at = now() where id = v_row.id;
      v_held := v_held + 1;
      continue;
    end if;

    v_customer_id := v_row.selected_customer_id;
    if v_row.review_status = 'new_customer' then
      v_gender := nullif(v_row.proposed_changes->>'gender', '');
      if v_gender is null or v_gender not in ('male', 'female') then
        update public.customer_sheet_import_rows set review_status = 'hold', review_note = concat_ws(E'\n', nullif(review_note, ''), '신규 고객 성별을 선택해야 반영 가능'), updated_at = now() where id = v_row.id;
        v_held := v_held + 1;
        continue;
      end if;
      if nullif(btrim(v_row.customer_name), '') is null or length(regexp_replace(v_row.customer_phone, '\\D', '', 'g')) < 10 then
        update public.customer_sheet_import_rows set review_status = 'hold', review_note = concat_ws(E'\n', nullif(review_note, ''), '신규 고객 이름과 올바른 전화번호가 필요'), updated_at = now() where id = v_row.id;
        v_held := v_held + 1;
        continue;
      end if;
      select id into v_customer_id from public.customers
      where name = btrim(v_row.customer_name)
        and regexp_replace(phone, '\\D', '', 'g') = regexp_replace(v_row.customer_phone, '\\D', '', 'g')
      order by id limit 1;
      if v_customer_id is null then
        insert into public.customers(name, phone, gender, is_stamp_eligible, note, address)
        values (btrim(v_row.customer_name), btrim(v_row.customer_phone), v_gender, true, '', null)
        returning id into v_customer_id;
      end if;
    elsif v_row.review_status = 'x_transfer' then
      select id into v_customer_id from public.customers
      where name = 'X' and phone = 'X' and gender = 'special'
      order by id limit 1;
    end if;

    if v_customer_id is null or not exists (select 1 from public.customers where id = v_customer_id) then
      update public.customer_sheet_import_rows set review_status = 'hold', review_note = concat_ws(E'\n', nullif(review_note, ''), '반영 대상 고객을 찾지 못함'), updated_at = now() where id = v_row.id;
      v_held := v_held + 1;
      continue;
    end if;

    v_fingerprint := md5(concat_ws(E'\x1f',
      lower(regexp_replace(btrim(v_row.store_name), '\\s+', ' ', 'g')),
      v_sale_date::text,
      lower(regexp_replace(btrim(v_row.item_name), '\\s+', ' ', 'g')),
      lower(regexp_replace(btrim(v_row.paid_amount_text), '\\s+', ' ', 'g')),
      lower(regexp_replace(btrim(v_row.payment_method), '\\s+', ' ', 'g')),
      lower(regexp_replace(btrim(v_row.customer_name), '\\s+', ' ', 'g')),
      regexp_replace(v_row.customer_phone, '\\D', '', 'g'),
      lower(regexp_replace(btrim(v_row.customer_note), '\\s+', ' ', 'g')),
      lower(regexp_replace(btrim(v_row.customer_address), '\\s+', ' ', 'g'))
    ));
    if exists (select 1 from public.customer_sheet_import_applied_fingerprints where fingerprint = v_fingerprint) then
      update public.customer_sheet_import_rows set review_status = 'duplicate', review_note = concat_ws(E'\n', nullif(review_note, ''), '이미 반영된 동일 시트 행'), updated_at = now() where id = v_row.id;
      v_duplicates := v_duplicates + 1;
      continue;
    end if;

    v_payment_type := case
      when v_row.payment_method like '%카카오%' then 'kakaotalk'
      when v_row.payment_method like '%이체%현금%' then 'transfer_cash_receipt'
      when v_row.payment_method like '%현금영수%' then 'cash_receipt'
      when v_row.payment_method like '%이체%' then 'transfer'
      when v_row.payment_method like '%현금%' then 'cash'
      when v_row.payment_method like '%카드%' then 'card'
      when v_row.payment_method like '%특이%' then 'remark'
      else 'shipment_remark'
    end;
    v_store_name := case when v_row.store_name like '%이구%' then 'egu_vape' else 'ovape' end;

    -- 이미 같은 고객에게 같은 날·상품·금액·결제 수단으로 남은 이력은 자동으로 보류한다.
    if exists (
      select 1 from public.logs log
      where log.customer_id = v_customer_id and log.category = 'stamp'
        and (log.created_at at time zone 'Asia/Seoul')::date = v_sale_date
        and coalesce(log.jsonb->>'totalAmount', '') = regexp_replace(v_row.paid_amount_text, '[^0-9-]', '', 'g')
        and coalesce(log.jsonb->>'paymentType', '') = v_payment_type
        and coalesce(log.jsonb->'items', '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('itemName', v_row.item_name))
    ) then
      update public.customer_sheet_import_rows set review_status = 'duplicate', review_note = concat_ws(E'\n', nullif(review_note, ''), '기존 출고 이력과 겹칠 수 있어 자동 반영하지 않음'), updated_at = now() where id = v_row.id;
      v_duplicates := v_duplicates + 1;
      continue;
    end if;

    insert into public.logs(admin_id, customer_id, action, note, jsonb, category, created_at)
    values (
      auth.uid(), v_customer_id, 'no-stamp', btrim(v_row.item_name),
      jsonb_strip_nulls(jsonb_build_object(
        'storeName', v_store_name,
        'paymentType', v_payment_type,
        'payments', jsonb_build_array(jsonb_build_object('paymentType', v_payment_type, 'paymentTypeName', v_row.payment_method, 'amount', nullif(regexp_replace(v_row.paid_amount_text, '[^0-9-]', '', 'g'), '')::numeric)),
        'totalAmount', nullif(regexp_replace(v_row.paid_amount_text, '[^0-9-]', '', 'g'), '')::numeric,
        'extraNote', nullif(btrim(concat_ws(E'\n', nullif(btrim(v_row.customer_note), ''), case when nullif(btrim(v_row.customer_address), '') is not null then '주소지: ' || btrim(v_row.customer_address) end)), ''),
        'items', jsonb_build_array(jsonb_build_object('itemId', '', 'itemName', v_row.item_name, 'quantity', 1, 'unitPrice', nullif(regexp_replace(v_row.paid_amount_text, '[^0-9-]', '', 'g'), '')::numeric, 'amount', nullif(regexp_replace(v_row.paid_amount_text, '[^0-9-]', '', 'g'), '')::numeric, 'remark', '', 'lineText', v_row.item_name)),
        'historicalSheetImport', jsonb_build_object('batchId', p_batch_id, 'rowId', v_row.id, 'sourceRowNumber', v_row.source_row_number, 'fingerprint', v_fingerprint)
      )),
      'stamp', (v_sale_date::timestamp at time zone 'Asia/Seoul')
    ) returning id into v_log_id;

    insert into public.customer_sheet_import_applied_fingerprints(fingerprint, batch_id, row_id, log_id)
    values (v_fingerprint, p_batch_id, v_row.id, v_log_id);
    update public.customer_sheet_import_rows
    set review_status = 'applied', selected_customer_id = v_customer_id, applied_log_id = v_log_id, updated_at = now()
    where id = v_row.id;
    v_applied := v_applied + 1;
  end loop;

  update public.customer_sheet_import_batches set updated_at = now() where id = p_batch_id;
  return query select v_applied, v_duplicates, v_held;
end;
$$;

revoke all on function public.apply_customer_sheet_import_batch(uuid) from public, anon;
grant execute on function public.apply_customer_sheet_import_batch(uuid) to authenticated;
