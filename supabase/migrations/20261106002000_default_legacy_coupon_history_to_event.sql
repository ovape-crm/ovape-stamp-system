-- 과거 입·폐호흡 쿠폰 이력에는 이벤트/기본 분류가 없었다.
-- 당시 기본 분류였던 이벤트로 표시를 보정한다.
create or replace function public.coupon_usage_history_note(p_coupon jsonb)
returns text language sql immutable as $$
  select format(
    '%s%s 쿠폰 %s장 사용',
    case p_coupon->>'breathType'
      when 'mtl' then '입호흡'
      when 'dtl' then '폐호흡'
      else coalesce(nullif(btrim(p_coupon->>'customMemo'), ''), '직접 입력')
    end,
    case
      when p_coupon->>'saleKind' = 'basic' then ' · 기본'
      when p_coupon->>'saleKind' = 'event'
        or p_coupon->>'breathType' in ('mtl', 'dtl') then ' · 이벤트'
      else ''
    end,
    coalesce(nullif(p_coupon->>'quantity', '')::integer, 0)
  );
$$;

update public.logs coupon
set note = public.coupon_usage_history_note(outbound.jsonb->'couponUse')
from public.logs outbound
where coupon.action ~ '^coupon-[0-9]+$'
  and coupon.jsonb->>'couponSourceOutboundLogId' = outbound.id::text
  and outbound.jsonb ? 'couponUse';
