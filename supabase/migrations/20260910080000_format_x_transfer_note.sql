-- X 통합 계정 이력을 일반 고객으로 옮길 때, X 입력 정보는 출고 메모로 보존한다.
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
    v_phone_last_digits := coalesce(
      nullif(btrim(new.jsonb->>'xPhoneLastDigits'), ''),
      '미입력'
    );
    v_transfer_note := format(
      'X 통합 계정 이전, 이름 : %s, 핸드폰 뒷번호 : %s',
      v_name,
      v_phone_last_digits
    );

    new.note := case
      when nullif(btrim(coalesce(old.note, '')), '') is null then v_transfer_note
      else v_transfer_note || ', ' || old.note
    end;
    new.jsonb := (
      coalesce(new.jsonb, '{}'::jsonb)
      - 'xCustomerName'
      - 'xPhoneLastDigits'
      - 'xCustomerGender'
    ) || jsonb_build_object(
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

drop trigger if exists zzz_format_x_transfer_note_trigger on public.logs;
create trigger zzz_format_x_transfer_note_trigger
before update of customer_id on public.logs
for each row execute function public.format_x_transfer_note();

revoke all on function public.format_x_transfer_note() from public, anon, authenticated;
