create or replace function public.delete_comparison_usage_guide_step(
  p_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_step public.comparison_usage_guide_steps;
begin
  if not public.is_current_user_master() then
    raise exception 'MASTER_REQUIRED';
  end if;

  select * into v_step
  from public.comparison_usage_guide_steps
  where id = p_id
  for update;
  if not found then
    raise exception 'USAGE_GUIDE_STEP_NOT_FOUND';
  end if;
  if v_step.step_order = 1 then
    raise exception 'FIRST_USAGE_GUIDE_STEP_CANNOT_BE_DELETED';
  end if;

  delete from public.comparison_usage_guide_steps where id = p_id;
end;
$$;

revoke all on function public.delete_comparison_usage_guide_step(uuid) from public, anon;
grant execute on function public.delete_comparison_usage_guide_step(uuid) to authenticated;
