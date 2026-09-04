-- 스태프/관리자는 재고조정 이력의 기존 표시 내용을 볼 수 있지만,
-- 원본 logs 테이블과 재고조정 고객 상세에는 직접 접근할 수 없다.
create or replace function public.get_inventory_adjustment_logs_for_history(
  p_start_at timestamptz default null,
  p_end_at timestamptz default null,
  p_limit integer default 100
)
returns table (log_data jsonb)
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
  select jsonb_build_object(
    'id', adjustment_log.id::text,
    'admin_id', adjustment_log.admin_id,
    'customer_id', adjustment_log.customer_id::text,
    'action', adjustment_log.action,
    'note', adjustment_log.note,
    'created_at', adjustment_log.created_at,
    'updated_at', adjustment_log.updated_at,
    'category', adjustment_log.category,
    'jsonb', coalesce(adjustment_log.jsonb, '{}'::jsonb),
    'users', jsonb_build_object(
      'name', coalesce(actor.name, '알 수 없음'),
      'email', coalesce(actor.email, ''),
      'oss_role', actor.oss_role
    ),
    'customers', jsonb_build_object(
      'name', customer.name,
      'phone', customer.phone,
      'address', customer.address,
      'note', customer.note,
      'gender', customer.gender,
      'is_stamp_eligible', customer.is_stamp_eligible
    )
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

revoke all on function public.get_inventory_adjustment_logs_for_history(
  timestamptz, timestamptz, integer
) from public, anon;
grant execute on function public.get_inventory_adjustment_logs_for_history(
  timestamptz, timestamptz, integer
) to authenticated;
