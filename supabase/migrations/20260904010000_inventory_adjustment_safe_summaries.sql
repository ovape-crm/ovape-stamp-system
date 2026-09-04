-- 일반 로그 RLS를 우회해 재고조정의 존재 정보만 제공한다.
-- 품목, 수량, 금액, 메모, jsonb는 반환 형식에 포함하지 않는다.
create or replace function public.get_inventory_adjustment_log_summaries(
  p_start_at timestamptz default null,
  p_end_at timestamptz default null,
  p_limit integer default 100
)
returns table (
  log_id bigint,
  occurred_at timestamptz,
  actor_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.users app_user
    where app_user.id = auth.uid()
      and app_user.oss_role in ('staff', 'admin', 'master')
  ) then
    raise exception 'permission denied';
  end if;

  return query
  select
    adjustment_log.id,
    adjustment_log.created_at,
    coalesce(
      nullif(btrim(adjustment_log.jsonb->>'createdWorkerName'), ''),
      nullif(btrim(actor.name), ''),
      '알 수 없음'
    )
  from public.logs adjustment_log
  join public.customers customer on customer.id = adjustment_log.customer_id
  left join public.users actor on actor.id = adjustment_log.admin_id
  where adjustment_log.category = 'stamp'
    and btrim(customer.name) = '재고조정'
    and (p_start_at is null or adjustment_log.created_at >= p_start_at)
    and (p_end_at is null or adjustment_log.created_at <= p_end_at)
  order by adjustment_log.created_at desc, adjustment_log.id desc
  limit least(greatest(coalesce(p_limit, 100), 1), 100);
end;
$$;

revoke all on function public.get_inventory_adjustment_log_summaries(
  timestamptz, timestamptz, integer
) from public, anon;
grant execute on function public.get_inventory_adjustment_log_summaries(
  timestamptz, timestamptz, integer
) to authenticated;
