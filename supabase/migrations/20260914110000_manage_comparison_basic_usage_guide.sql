create or replace function public.save_comparison_usage_guide_step(
  p_id uuid,
  p_step_order integer,
  p_title text,
  p_content text
) returns public.comparison_usage_guide_steps
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
  if p_step_order < 1 or nullif(btrim(p_title), '') is null or nullif(btrim(p_content), '') is null then
    raise exception 'INVALID_USAGE_GUIDE_STEP';
  end if;

  if p_id is null then
    insert into public.comparison_usage_guide_steps(step_order, title, content)
    values (p_step_order, btrim(p_title), btrim(p_content))
    returning * into v_step;
  else
    update public.comparison_usage_guide_steps
    set step_order = p_step_order,
        title = btrim(p_title),
        content = btrim(p_content),
        updated_at = now()
    where id = p_id
    returning * into v_step;
    if not found then
      raise exception 'USAGE_GUIDE_STEP_NOT_FOUND';
    end if;
  end if;
  return v_step;
end;
$$;

create or replace function public.save_comparison_device_usage_note(
  p_device_id uuid,
  p_step_id uuid,
  p_content text
) returns public.comparison_device_usage_notes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note public.comparison_device_usage_notes;
begin
  if not public.is_current_user_master() then
    raise exception 'MASTER_REQUIRED';
  end if;
  if nullif(btrim(p_content), '') is null then
    raise exception 'INVALID_DEVICE_USAGE_NOTE';
  end if;
  if not exists (select 1 from public.comparison_devices where id = p_device_id) then
    raise exception 'COMPARISON_DEVICE_NOT_FOUND';
  end if;
  if not exists (select 1 from public.comparison_usage_guide_steps where id = p_step_id) then
    raise exception 'USAGE_GUIDE_STEP_NOT_FOUND';
  end if;

  insert into public.comparison_device_usage_notes(device_id, step_id, content)
  values (p_device_id, p_step_id, btrim(p_content))
  on conflict (device_id, step_id) do update
  set content = excluded.content,
      updated_at = now()
  returning * into v_note;
  return v_note;
end;
$$;

revoke all on function public.save_comparison_usage_guide_step(uuid, integer, text, text) from public, anon;
grant execute on function public.save_comparison_usage_guide_step(uuid, integer, text, text) to authenticated;
revoke all on function public.save_comparison_device_usage_note(uuid, uuid, text) from public, anon;
grant execute on function public.save_comparison_device_usage_note(uuid, uuid, text) to authenticated;
