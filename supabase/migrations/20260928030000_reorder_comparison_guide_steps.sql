-- 단계형 안내의 순서를 안전하게 한 번에 바꾼다.

create or replace function public.reorder_comparison_usage_guide_steps(p_step_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare
  v_step_count integer;
begin
  if not exists (select 1 from public.users where id = auth.uid() and oss_role in ('admin', 'master')) then
    raise exception 'ADMIN_REQUIRED';
  end if;

  select count(*) into v_step_count from public.comparison_usage_guide_steps;
  if p_step_ids is null
    or cardinality(p_step_ids) <> v_step_count
    or exists (select 1 from unnest(p_step_ids) as step_id where step_id is null)
    or (select count(distinct step_id) from unnest(p_step_ids) as step_id) <> v_step_count
    or exists (select 1 from unnest(p_step_ids) as step_id where not exists (select 1 from public.comparison_usage_guide_steps where id = step_id)) then
    raise exception 'INVALID_USAGE_GUIDE_STEP_ORDER';
  end if;

  update public.comparison_usage_guide_steps set step_order = step_order + 1000000;
  update public.comparison_usage_guide_steps as steps
  set step_order = ordered.position, updated_at = now()
  from unnest(p_step_ids) with ordinality as ordered(id, position)
  where steps.id = ordered.id;
end;
$$;

create or replace function public.reorder_comparison_customer_required_guide_steps(p_step_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare
  v_step_count integer;
begin
  if not exists (select 1 from public.users where id = auth.uid() and oss_role in ('admin', 'master')) then
    raise exception 'ADMIN_REQUIRED';
  end if;

  select count(*) into v_step_count from public.comparison_customer_required_guide_steps;
  if p_step_ids is null
    or cardinality(p_step_ids) <> v_step_count
    or exists (select 1 from unnest(p_step_ids) as step_id where step_id is null)
    or (select count(distinct step_id) from unnest(p_step_ids) as step_id) <> v_step_count
    or exists (select 1 from unnest(p_step_ids) as step_id where not exists (select 1 from public.comparison_customer_required_guide_steps where id = step_id)) then
    raise exception 'INVALID_CUSTOMER_REQUIRED_GUIDE_STEP_ORDER';
  end if;

  update public.comparison_customer_required_guide_steps set step_order = step_order + 1000000;
  update public.comparison_customer_required_guide_steps as steps
  set step_order = ordered.position, updated_at = now()
  from unnest(p_step_ids) with ordinality as ordered(id, position)
  where steps.id = ordered.id;
end;
$$;

create or replace function public.reorder_comparison_device_defect_symptom_steps(p_device_id uuid, p_step_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare
  v_step_count integer;
begin
  if not exists (select 1 from public.users where id = auth.uid() and oss_role in ('admin', 'master')) then
    raise exception 'ADMIN_REQUIRED';
  end if;

  select count(*) into v_step_count from public.comparison_device_defect_symptom_steps where device_id = p_device_id;
  if p_step_ids is null
    or cardinality(p_step_ids) <> v_step_count
    or exists (select 1 from unnest(p_step_ids) as step_id where step_id is null)
    or (select count(distinct step_id) from unnest(p_step_ids) as step_id) <> v_step_count
    or exists (select 1 from unnest(p_step_ids) as step_id where not exists (select 1 from public.comparison_device_defect_symptom_steps where id = step_id and device_id = p_device_id)) then
    raise exception 'INVALID_DEFECT_SYMPTOM_STEP_ORDER';
  end if;

  update public.comparison_device_defect_symptom_steps
  set step_order = step_order + 1000000
  where device_id = p_device_id;
  update public.comparison_device_defect_symptom_steps as steps
  set step_order = ordered.position, updated_at = now()
  from unnest(p_step_ids) with ordinality as ordered(id, position)
  where steps.id = ordered.id and steps.device_id = p_device_id;
end;
$$;

revoke all on function public.reorder_comparison_usage_guide_steps(uuid[]) from public, anon;
revoke all on function public.reorder_comparison_customer_required_guide_steps(uuid[]) from public, anon;
revoke all on function public.reorder_comparison_device_defect_symptom_steps(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_comparison_usage_guide_steps(uuid[]) to authenticated;
grant execute on function public.reorder_comparison_customer_required_guide_steps(uuid[]) to authenticated;
grant execute on function public.reorder_comparison_device_defect_symptom_steps(uuid, uuid[]) to authenticated;
