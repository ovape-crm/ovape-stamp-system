-- 화면에 표시하는 한글 결제 방식도 이력 검색 대상으로 포함한다.
create or replace function public.search_history_log_ids(
  p_category text,
  p_keyword text,
  p_start_at timestamptz default null,
  p_end_at timestamptz default null,
  p_payment_method text default null
)
returns table(id bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select log.id
  from public.logs as log
  left join public.customers as customer on customer.id = log.customer_id
  where log.category = p_category
    and (p_start_at is null or log.created_at >= p_start_at)
    and (p_end_at is null or log.created_at <= p_end_at)
    and (
      p_payment_method is null
      or log.jsonb->>'paymentType' = p_payment_method
      or coalesce(log.jsonb->'payments', '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('paymentType', p_payment_method))
    )
    and concat_ws(
      ' ',
      log.action,
      log.note,
      coalesce(log.jsonb::text, ''),
      case coalesce(log.jsonb->>'paymentType', '')
        when 'card' then '카드'
        when 'transfer' then '이체'
        when 'cash' then '현금'
        when 'cash_receipt' then '현금영수증'
        when 'transfer_cash_receipt' then '이체현금영수증'
        when 'kakaotalk' then '카카오톡'
        when 'egu_card' then '카드'
        when 'egu_transfer' then '이체'
        when 'egu_cash' then '현금'
        when 'egu_cash_receipt' then '현금영수증'
        when 'remark' then '고객 특이사항'
        when 'shipment_remark' then '특이사항'
        else ''
      end,
      coalesce((
        select string_agg(
          case coalesce(payment->>'paymentType', '')
            when 'card' then '카드'
            when 'transfer' then '이체'
            when 'cash' then '현금'
            when 'cash_receipt' then '현금영수증'
            when 'transfer_cash_receipt' then '이체현금영수증'
            when 'kakaotalk' then '카카오톡'
            when 'egu_card' then '카드'
            when 'egu_transfer' then '이체'
            when 'egu_cash' then '현금'
            when 'egu_cash_receipt' then '현금영수증'
            when 'remark' then '고객 특이사항'
            when 'shipment_remark' then '특이사항'
            else payment->>'paymentType'
          end,
          ' '
        )
        from jsonb_array_elements(coalesce(log.jsonb->'payments', '[]'::jsonb)) as payment
      ), ''),
      customer.name,
      customer.phone,
      customer.address,
      customer.note,
      case customer.gender
        when 'male' then '남자'
        when 'female' then '여자'
        when 'special' then '특수'
        else ''
      end,
      case
        when customer.is_stamp_eligible is true then '적립'
        when customer.is_stamp_eligible is false then '미적립'
        else ''
      end
    ) ilike '%' || p_keyword || '%';
$$;

grant execute on function public.search_history_log_ids(text, text, timestamptz, timestamptz, text) to authenticated;
