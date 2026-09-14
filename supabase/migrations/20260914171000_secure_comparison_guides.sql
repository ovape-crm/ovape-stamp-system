create or replace function public.save_comparison_column_visibility(
  p_column_id uuid,
  p_is_visible boolean
) returns public.comparison_columns
language plpgsql
security definer
set search_path = public
as $$
declare
  v_column public.comparison_columns;
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid() and oss_role in ('admin', 'master')
  ) then
    raise exception 'ADMIN_REQUIRED';
  end if;

  update public.comparison_columns
  set is_visible_in_comparison = p_is_visible
  where id = p_column_id and is_active = true
  returning * into v_column;

  if not found then
    raise exception 'COMPARISON_COLUMN_NOT_FOUND';
  end if;
  return v_column;
end;
$$;

revoke all on function public.save_comparison_column_visibility(uuid, boolean) from public, anon;
grant execute on function public.save_comparison_column_visibility(uuid, boolean) to authenticated;

drop function if exists public.save_comparison_device_photos(uuid, jsonb, integer, text, text);
create function public.save_comparison_device_photos(
  p_device_id uuid,
  p_image_urls jsonb,
  p_image_width_percent integer,
  p_image_alignment text,
  p_header_content text default ''
) returns public.comparison_device_photos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_photo public.comparison_device_photos;
begin
  if not public.is_current_user_master() then
    raise exception 'MASTER_REQUIRED';
  end if;
  if not exists (select 1 from public.comparison_devices where id = p_device_id) then
    raise exception 'COMPARISON_DEVICE_NOT_FOUND';
  end if;
  if p_image_urls is null or jsonb_typeof(p_image_urls) <> 'array' then
    raise exception 'INVALID_IMAGE_URLS';
  end if;
  if exists (select 1 from jsonb_array_elements_text(p_image_urls) value where nullif(btrim(value), '') is null) then
    raise exception 'INVALID_IMAGE_URLS';
  end if;
  if p_image_width_percent not between 20 and 100 then
    raise exception 'INVALID_IMAGE_WIDTH';
  end if;
  if p_image_alignment not in ('left', 'center', 'right') then
    raise exception 'INVALID_IMAGE_ALIGNMENT';
  end if;

  insert into public.comparison_device_photos(device_id, image_urls, image_width_percent, image_alignment, header_content)
  values (p_device_id, p_image_urls, p_image_width_percent, p_image_alignment, coalesce(p_header_content, ''))
  on conflict (device_id) do update
  set image_urls = excluded.image_urls,
      image_width_percent = excluded.image_width_percent,
      image_alignment = excluded.image_alignment,
      header_content = excluded.header_content,
      updated_at = now()
  returning * into v_photo;
  return v_photo;
end;
$$;

revoke all on function public.save_comparison_device_photos(uuid, jsonb, integer, text, text) from public, anon;
grant execute on function public.save_comparison_device_photos(uuid, jsonb, integer, text, text) to authenticated;
