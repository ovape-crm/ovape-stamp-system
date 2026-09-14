create table if not exists public.comparison_device_photos (
  device_id uuid primary key references public.comparison_devices(id) on delete cascade,
  image_urls jsonb not null default '[]'::jsonb,
  image_width_percent integer not null default 70 check (image_width_percent between 20 and 100),
  image_alignment text not null default 'center' check (image_alignment in ('left', 'center', 'right')),
  updated_at timestamptz not null default now()
);

alter table public.comparison_device_photos enable row level security;
create policy "comparison_device_photos_select" on public.comparison_device_photos for select to authenticated using (true);

create or replace function public.save_comparison_device_photos(
  p_device_id uuid,
  p_image_urls jsonb,
  p_image_width_percent integer,
  p_image_alignment text
) returns public.comparison_device_photos
language plpgsql security definer set search_path = public
as $$
declare v_photo public.comparison_device_photos;
begin
  if not public.is_current_user_master() then raise exception 'MASTER_REQUIRED'; end if;
  if not exists (select 1 from public.comparison_devices where id = p_device_id) then raise exception 'COMPARISON_DEVICE_NOT_FOUND'; end if;
  if jsonb_typeof(p_image_urls) <> 'array' or exists (select 1 from jsonb_array_elements_text(p_image_urls) value where nullif(btrim(value), '') is null) then raise exception 'INVALID_IMAGE_URLS'; end if;
  if p_image_width_percent not between 20 and 100 then raise exception 'INVALID_IMAGE_WIDTH'; end if;
  if p_image_alignment not in ('left', 'center', 'right') then raise exception 'INVALID_IMAGE_ALIGNMENT'; end if;
  insert into public.comparison_device_photos(device_id, image_urls, image_width_percent, image_alignment)
  values (p_device_id, p_image_urls, p_image_width_percent, p_image_alignment)
  on conflict (device_id) do update set image_urls = excluded.image_urls, image_width_percent = excluded.image_width_percent, image_alignment = excluded.image_alignment, updated_at = now()
  returning * into v_photo;
  return v_photo;
end;
$$;

revoke all on function public.save_comparison_device_photos(uuid, jsonb, integer, text) from public, anon;
grant execute on function public.save_comparison_device_photos(uuid, jsonb, integer, text) to authenticated;
