alter table public.comparison_device_usage_guides
  add column if not exists image_urls jsonb not null default '[]'::jsonb;

update public.comparison_device_usage_guides
set image_urls = jsonb_build_array(image_url)
where jsonb_array_length(image_urls) = 0
  and nullif(btrim(image_url), '') is not null;

drop function if exists public.save_comparison_device_usage_guide(uuid, text, text, integer, text, text);

create function public.save_comparison_device_usage_guide(
  p_device_id uuid,
  p_header_content text,
  p_image_urls jsonb,
  p_image_width_percent integer,
  p_image_alignment text,
  p_body_content text
) returns public.comparison_device_usage_guides
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guide public.comparison_device_usage_guides;
begin
  if not public.is_current_user_master() then raise exception 'MASTER_REQUIRED'; end if;
  if not exists (select 1 from public.comparison_devices where id = p_device_id) then raise exception 'COMPARISON_DEVICE_NOT_FOUND'; end if;
  if jsonb_typeof(p_image_urls) <> 'array' or exists (select 1 from jsonb_array_elements_text(p_image_urls) value where nullif(btrim(value), '') is null) then raise exception 'INVALID_IMAGE_URLS'; end if;
  if p_image_width_percent not between 20 and 100 then raise exception 'INVALID_IMAGE_WIDTH'; end if;
  if p_image_alignment not in ('left', 'center', 'right') then raise exception 'INVALID_IMAGE_ALIGNMENT'; end if;

  insert into public.comparison_device_usage_guides(device_id, header_content, image_url, image_urls, image_width_percent, image_alignment, body_content)
  values (p_device_id, coalesce(p_header_content, ''), coalesce(p_image_urls->>0, ''), p_image_urls, p_image_width_percent, p_image_alignment, coalesce(p_body_content, ''))
  on conflict (device_id) do update
  set header_content = excluded.header_content,
      image_url = excluded.image_url,
      image_urls = excluded.image_urls,
      image_width_percent = excluded.image_width_percent,
      image_alignment = excluded.image_alignment,
      body_content = excluded.body_content,
      updated_at = now()
  returning * into v_guide;
  return v_guide;
end;
$$;

revoke all on function public.save_comparison_device_usage_guide(uuid, text, jsonb, integer, text, text) from public, anon;
grant execute on function public.save_comparison_device_usage_guide(uuid, text, jsonb, integer, text, text) to authenticated;
