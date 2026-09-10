-- X 통합 계정 이전 정보는 품목 메모가 아니라 출고 특이사항(extraNote)으로 보존한다.
create or replace function public.format_x_transfer_note()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_is_x boolean := false;
  v_target_is_x boolean := false;
  v_name text;
  v_phone_last_digits text;
  v_transfer_note text;
  v_existing_extra_note text;
begin
  if new.customer_id is not distinct from old.customer_id then
    return new;
  end if;

  select customer.name = 'X' and customer.phone = 'X'
  into v_source_is_x
  from public.customers customer
  where customer.id = old.customer_id;
  select customer.name = 'X' and customer.phone = 'X'
  into v_target_is_x
  from public.customers customer
  where customer.id = new.customer_id;

  if coalesce(v_source_is_x, false) and not coalesce(v_target_is_x, false) then
    v_name := coalesce(nullif(btrim(new.jsonb->>'xCustomerName'), ''), 'X');
    v_phone_last_digits := coalesce(nullif(btrim(new.jsonb->>'xPhoneLastDigits'), ''), '미입력');
    v_transfer_note := format('X 통합 계정 이전, 이름 : %s, 핸드폰 뒷번호 : %s', v_name, v_phone_last_digits);
    v_existing_extra_note := nullif(btrim(new.jsonb->>'extraNote'), '');

    new.jsonb := (
      coalesce(new.jsonb, '{}'::jsonb)
      - 'xCustomerName'
      - 'xPhoneLastDigits'
      - 'xCustomerGender'
    ) || jsonb_build_object(
      'extraNote', case
        when v_existing_extra_note is null then v_transfer_note
        else v_transfer_note || ', ' || v_existing_extra_note
      end,
      'xTransfer', jsonb_build_object(
        'name', v_name,
        'phoneLastDigits', v_phone_last_digits,
        'movedAt', now()
      )
    );
  end if;
  return new;
end;
$$;

-- 앞서 이전된 이력도 품목 메모를 원상태로 되돌리고, X 정보는 출고 특이사항으로 이동한다.
update public.logs log
set note = regexp_replace(
      log.note,
      '^X 통합 계정 이전, 이름 : [^,]+, 핸드폰 뒷번호 : [^,]+,?[[:space:]]*',
      ''
    ),
    jsonb = coalesce(log.jsonb, '{}'::jsonb) || jsonb_build_object(
      'extraNote',
        format(
          'X 통합 계정 이전, 이름 : %s, 핸드폰 뒷번호 : %s%s',
          coalesce(log.jsonb->'xTransfer'->>'name', 'X'),
          coalesce(log.jsonb->'xTransfer'->>'phoneLastDigits', '미입력'),
          case when nullif(btrim(log.jsonb->>'extraNote'), '') is null
            then ''
            else ', ' || (log.jsonb->>'extraNote')
          end
        )
    )
where log.note like 'X 통합 계정 이전, 이름 : %'
  and jsonb_typeof(log.jsonb->'xTransfer') = 'object';
