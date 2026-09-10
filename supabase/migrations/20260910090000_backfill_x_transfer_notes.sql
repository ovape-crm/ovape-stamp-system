-- X 통합 계정에서 이미 일반 고객으로 이전된 이력도 동일한 출고 메모 형식으로 보정한다.
with x_transferred_logs as (
  select
    log.id,
    coalesce(nullif(btrim(log.jsonb->>'xCustomerName'), ''), 'X') as x_name,
    coalesce(nullif(btrim(log.jsonb->>'xPhoneLastDigits'), ''), '미입력') as x_phone_last_digits,
    log.note
  from public.logs log
  join public.customers target_customer on target_customer.id = log.customer_id
  where nullif(btrim(log.jsonb->>'xCustomerName'), '') is not null
    and coalesce(log.jsonb->'xTransfer', 'null'::jsonb) = 'null'::jsonb
    and not (target_customer.name = 'X' and target_customer.phone = 'X')
    and exists (
      select 1
      from jsonb_array_elements(
        case when jsonb_typeof(log.jsonb->'masterHistoryEdits') = 'array'
          then log.jsonb->'masterHistoryEdits'
          else '[]'::jsonb
        end
      ) edit
      join public.customers source_customer
        on source_customer.id::text = edit->>'previousCustomerId'
      where source_customer.name = 'X' and source_customer.phone = 'X'
    )
)
update public.logs log
set note = format(
  'X 통합 계정 이전, 이름 : %s, 핸드폰 뒷번호 : %s%s',
  source.x_name,
  source.x_phone_last_digits,
  case when nullif(btrim(coalesce(source.note, '')), '') is null
    then ''
    else ', ' || source.note
  end
),
jsonb = (
  coalesce(log.jsonb, '{}'::jsonb)
  - 'xCustomerName'
  - 'xPhoneLastDigits'
  - 'xCustomerGender'
) || jsonb_build_object(
  'xTransfer', jsonb_build_object(
    'name', source.x_name,
    'phoneLastDigits', source.x_phone_last_digits,
    'backfilledAt', now()
  )
)
from x_transferred_logs source
where log.id = source.id;
