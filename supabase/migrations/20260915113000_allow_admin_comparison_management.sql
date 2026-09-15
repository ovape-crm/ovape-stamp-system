-- 기초 사용법, 기기 사진, 기기 사용법, 기기 불량 관리 권한: admin과 master 모두 허용

create or replace function public.save_comparison_usage_guide_step(p_id uuid, p_step_order integer, p_title text, p_content text)
returns public.comparison_usage_guide_steps language plpgsql security definer set search_path = public as $$
declare v_step public.comparison_usage_guide_steps;
begin
  if not exists (select 1 from public.users where id = auth.uid() and oss_role in ('admin', 'master')) then raise exception 'ADMIN_REQUIRED'; end if;
  if p_step_order < 1 or nullif(btrim(p_title), '') is null or nullif(btrim(p_content), '') is null then raise exception 'INVALID_USAGE_GUIDE_STEP'; end if;
  if p_id is null then
    insert into public.comparison_usage_guide_steps(step_order, title, content) values (p_step_order, btrim(p_title), btrim(p_content)) returning * into v_step;
  else
    update public.comparison_usage_guide_steps set step_order = p_step_order, title = btrim(p_title), content = btrim(p_content), updated_at = now() where id = p_id returning * into v_step;
    if not found then raise exception 'USAGE_GUIDE_STEP_NOT_FOUND'; end if;
  end if;
  return v_step;
end;
$$;

create or replace function public.delete_comparison_usage_guide_step(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_step public.comparison_usage_guide_steps;
begin
  if not exists (select 1 from public.users where id = auth.uid() and oss_role in ('admin', 'master')) then raise exception 'ADMIN_REQUIRED'; end if;
  select * into v_step from public.comparison_usage_guide_steps where id = p_id for update;
  if not found then raise exception 'USAGE_GUIDE_STEP_NOT_FOUND'; end if;
  if v_step.step_order = 1 then raise exception 'FIRST_USAGE_GUIDE_STEP_CANNOT_BE_DELETED'; end if;
  delete from public.comparison_usage_guide_steps where id = p_id;
end;
$$;

create or replace function public.save_comparison_device_usage_note(p_device_id uuid, p_step_id uuid, p_content text)
returns public.comparison_device_usage_notes language plpgsql security definer set search_path = public as $$
declare v_note public.comparison_device_usage_notes;
begin
  if not exists (select 1 from public.users where id = auth.uid() and oss_role in ('admin', 'master')) then raise exception 'ADMIN_REQUIRED'; end if;
  if nullif(btrim(p_content), '') is null then raise exception 'INVALID_DEVICE_USAGE_NOTE'; end if;
  if not exists (select 1 from public.comparison_devices where id = p_device_id) then raise exception 'COMPARISON_DEVICE_NOT_FOUND'; end if;
  if not exists (select 1 from public.comparison_usage_guide_steps where id = p_step_id) then raise exception 'USAGE_GUIDE_STEP_NOT_FOUND'; end if;
  insert into public.comparison_device_usage_notes(device_id, step_id, content) values (p_device_id, p_step_id, btrim(p_content))
  on conflict (device_id, step_id) do update set content = excluded.content, updated_at = now() returning * into v_note;
  return v_note;
end;
$$;

create or replace function public.save_comparison_device_usage_guide(p_device_id uuid, p_header_content text, p_image_urls jsonb, p_image_width_percent integer, p_image_alignment text, p_body_content text)
returns public.comparison_device_usage_guides language plpgsql security definer set search_path = public as $$
declare v_guide public.comparison_device_usage_guides;
begin
  if not exists (select 1 from public.users where id = auth.uid() and oss_role in ('admin', 'master')) then raise exception 'ADMIN_REQUIRED'; end if;
  if not exists (select 1 from public.comparison_devices where id = p_device_id) then raise exception 'COMPARISON_DEVICE_NOT_FOUND'; end if;
  if jsonb_typeof(p_image_urls) <> 'array' or exists (select 1 from jsonb_array_elements_text(p_image_urls) value where nullif(btrim(value), '') is null) then raise exception 'INVALID_IMAGE_URLS'; end if;
  if p_image_width_percent not between 20 and 100 then raise exception 'INVALID_IMAGE_WIDTH'; end if;
  if p_image_alignment not in ('left', 'center', 'right') then raise exception 'INVALID_IMAGE_ALIGNMENT'; end if;
  insert into public.comparison_device_usage_guides(device_id, header_content, image_url, image_urls, image_width_percent, image_alignment, body_content)
  values (p_device_id, coalesce(p_header_content, ''), coalesce(p_image_urls->>0, ''), p_image_urls, p_image_width_percent, p_image_alignment, coalesce(p_body_content, ''))
  on conflict (device_id) do update set header_content = excluded.header_content, image_url = excluded.image_url, image_urls = excluded.image_urls, image_width_percent = excluded.image_width_percent, image_alignment = excluded.image_alignment, body_content = excluded.body_content, updated_at = now()
  returning * into v_guide;
  return v_guide;
end;
$$;

create or replace function public.save_comparison_device_photos(p_device_id uuid, p_image_urls jsonb, p_image_width_percent integer, p_image_alignment text, p_header_content text default '')
returns public.comparison_device_photos language plpgsql security definer set search_path = public as $$
declare v_photo public.comparison_device_photos;
begin
  if not exists (select 1 from public.users where id = auth.uid() and oss_role in ('admin', 'master')) then raise exception 'ADMIN_REQUIRED'; end if;
  if not exists (select 1 from public.comparison_devices where id = p_device_id) then raise exception 'COMPARISON_DEVICE_NOT_FOUND'; end if;
  if p_image_urls is null or jsonb_typeof(p_image_urls) <> 'array' then raise exception 'INVALID_IMAGE_URLS'; end if;
  if exists (select 1 from jsonb_array_elements_text(p_image_urls) value where nullif(btrim(value), '') is null) then raise exception 'INVALID_IMAGE_URLS'; end if;
  if p_image_width_percent not between 20 and 100 then raise exception 'INVALID_IMAGE_WIDTH'; end if;
  if p_image_alignment not in ('left', 'center', 'right') then raise exception 'INVALID_IMAGE_ALIGNMENT'; end if;
  insert into public.comparison_device_photos(device_id, image_urls, image_width_percent, image_alignment, header_content)
  values (p_device_id, p_image_urls, p_image_width_percent, p_image_alignment, coalesce(p_header_content, ''))
  on conflict (device_id) do update set image_urls = excluded.image_urls, image_width_percent = excluded.image_width_percent, image_alignment = excluded.image_alignment, header_content = excluded.header_content, updated_at = now()
  returning * into v_photo;
  return v_photo;
end;
$$;

create or replace function public.save_comparison_device_defect_symptom(p_device_id uuid, p_content text)
returns public.comparison_device_defect_symptoms language plpgsql security definer set search_path = public as $$
declare v_result public.comparison_device_defect_symptoms;
begin
  if not exists (select 1 from public.users where id = auth.uid() and oss_role in ('admin', 'master')) then raise exception 'ADMIN_REQUIRED'; end if;
  if not exists (select 1 from public.comparison_devices where id = p_device_id) then raise exception 'COMPARISON_DEVICE_NOT_FOUND'; end if;
  insert into public.comparison_device_defect_symptoms(device_id, content) values (p_device_id, coalesce(p_content, ''))
  on conflict (device_id) do update set content = excluded.content, updated_at = now() returning * into v_result;
  return v_result;
end;
$$;

create or replace function public.save_comparison_device_defect_symptom_step(p_id uuid, p_device_id uuid, p_step_order integer, p_title text, p_content text)
returns public.comparison_device_defect_symptom_steps language plpgsql security definer set search_path = public as $$
declare v_result public.comparison_device_defect_symptom_steps;
begin
  if not exists (select 1 from public.users where id = auth.uid() and oss_role in ('admin', 'master')) then raise exception 'ADMIN_REQUIRED'; end if;
  if not exists (select 1 from public.comparison_devices where id = p_device_id) then raise exception 'COMPARISON_DEVICE_NOT_FOUND'; end if;
  if p_id is null then insert into public.comparison_device_defect_symptom_steps(device_id, step_order, title, content) values (p_device_id, p_step_order, p_title, p_content) returning * into v_result;
  else update public.comparison_device_defect_symptom_steps set title = p_title, content = p_content, updated_at = now() where id = p_id and device_id = p_device_id returning * into v_result;
  end if;
  if not found then raise exception 'DEFECT_STEP_NOT_FOUND'; end if;
  return v_result;
end;
$$;

create or replace function public.delete_comparison_device_defect_symptom_step(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.users where id = auth.uid() and oss_role in ('admin', 'master')) then raise exception 'ADMIN_REQUIRED'; end if;
  delete from public.comparison_device_defect_symptom_steps where id = p_id;
  if not found then raise exception 'DEFECT_STEP_NOT_FOUND'; end if;
end;
$$;
