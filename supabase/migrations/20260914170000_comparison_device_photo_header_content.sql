alter table public.comparison_device_photos
  add column if not exists header_content text not null default '';

drop function if exists public.save_comparison_device_photos(uuid, jsonb, integer, text);
create function public.save_comparison_device_photos(p_device_id uuid, p_image_urls jsonb, p_image_width_percent integer, p_image_alignment text, p_header_content text default '') returns public.comparison_device_photos
language plpgsql security definer set search_path = public
as $$
declare v_photo public.comparison_device_photos;
begin
 if not public.is_current_user_master() then raise exception 'MASTER_REQUIRED'; end if;
 insert into public.comparison_device_photos(device_id,image_urls,image_width_percent,image_alignment,header_content) values(p_device_id,p_image_urls,p_image_width_percent,p_image_alignment,coalesce(p_header_content,''))
 on conflict(device_id) do update set image_urls=excluded.image_urls,image_width_percent=excluded.image_width_percent,image_alignment=excluded.image_alignment,header_content=excluded.header_content,updated_at=now() returning * into v_photo;
 return v_photo;
end; $$;
grant execute on function public.save_comparison_device_photos(uuid,jsonb,integer,text,text) to authenticated;
