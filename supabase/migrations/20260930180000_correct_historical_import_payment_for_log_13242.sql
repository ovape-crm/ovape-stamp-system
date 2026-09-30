-- 시트 원본 보정: 2396행(최세환) 카드 결제 84,000원.
-- 과거 이력은 재고 이동을 만들지 않으므로 동기화 트리거 없이 결제 메타데이터만 바로잡는다.
begin;
set local session_replication_role = replica;

update public.logs
set jsonb = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(jsonb, '{paymentType}', '"card"'::jsonb),
      '{payments}', jsonb_build_array(jsonb_build_object('paymentType', 'card', 'paymentTypeName', '카드', 'amount', 84000))
    ),
    '{totalAmount}', '84000'::jsonb
  ),
  '{items,0}', jsonb_set(
    jsonb_set(coalesce(jsonb->'items'->0, '{}'::jsonb), '{unitPrice}', '84000'::jsonb),
    '{amount}', '84000'::jsonb
  )
)
where id = 13242
  and jsonb->'historicalSheetImport'->>'sourceRowNumber' = '2396';

commit;
