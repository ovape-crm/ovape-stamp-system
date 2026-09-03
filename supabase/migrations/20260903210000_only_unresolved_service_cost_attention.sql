-- The attention list is not a list of every historical source gap.
-- Manually confirmed/reviewed amounts remain recorded, but are no longer actionable.
create function public.get_service_cost_attention(p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
 if not exists(select 1 from public.users where id=auth.uid() and oss_role='master') then raise exception 'MASTER_REQUIRED'; end if;
 with entries as materialized (
  select public.get_service_cost_entry(l.id,i.n::integer) entry
  from public.logs l cross join lateral jsonb_array_elements(coalesce(l.jsonb->'items','[]')) with ordinality i(value,n)
  where l.category='stamp' and public.is_inventory_item_tracked(btrim(i.value->>'itemName'))
   and btrim(coalesce(i.value->>'remark','')) ~ '^서비스($|[,\s(])'
   and btrim(coalesce(i.value->>'inventoryAction','')) in ('','out')
   and coalesce(nullif(i.value->>'quantity','')::integer,0)>0
 ), unresolved as (
  select entry from entries where entry->>'total_cost' is null
   or (entry->>'source'='manual' and (entry->'review'->>'kind' is null or entry->'review'->>'kind'='offset_review'))
 )
 select jsonb_build_object('count',(select count(*) from unresolved),
 'rows',coalesce((select jsonb_agg(entry order by entry->>'event_at' desc,(entry->>'log_id')::bigint desc,(entry->>'line_index')::integer)
  from (select entry from unresolved order by entry->>'event_at' desc,(entry->>'log_id')::bigint desc,(entry->>'line_index')::integer
   limit greatest(1,least(coalesce(p_limit,100),10000))) page),'[]'::jsonb)) into result;
 return result;
end $$;
revoke all on function public.get_service_cost_attention(integer) from public,anon;
grant execute on function public.get_service_cost_attention(integer) to authenticated;
