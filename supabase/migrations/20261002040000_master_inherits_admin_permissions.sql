-- 마스터는 관리자 권한을 모두 상속한다. 이전 권한 보정 뒤에 추가된 RPC와
-- RLS 정책까지 포함해, admin 단독 판별을 admin·master 공통 판별로 정규화한다.
create or replace function public.has_admin_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where id = auth.uid()
      and oss_role in ('admin', 'master')
  );
$$;

revoke all on function public.has_admin_access() from public;
grant execute on function public.has_admin_access() to authenticated;

do $$
declare
  function_row record;
  definition text;
  updated_definition text;
begin
  for function_row in
    select procedure.oid
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.prokind = 'f'
  loop
    definition := pg_get_functiondef(function_row.oid);

    -- auth.uid() 기반의 권한 검사만 대상으로 하므로, 역할 표시용 CASE 등
    -- 권한과 무관한 admin 문자열은 변경하지 않는다.
    if definition !~ 'auth\.uid\(\)' then
      continue;
    end if;

    updated_definition := regexp_replace(
      definition,
      'oss_role[[:space:]]*=[[:space:]]*''admin''([[:space:]]*::[[:space:]]*text)?',
      'oss_role in (''admin'', ''master'')',
      'g'
    );
    updated_definition := regexp_replace(
      updated_definition,
      'oss_role[[:space:]]+in[[:space:]]*\([[:space:]]*''staff''[[:space:]]*,[[:space:]]*''admin''[[:space:]]*\)',
      'oss_role in (''staff'', ''admin'', ''master'')',
      'g'
    );

    if updated_definition <> definition then
      execute updated_definition;
    end if;
  end loop;
end;
$$;

do $$
declare
  policy_row record;
  using_expression text;
  check_expression text;
  role_list text;
  statement text;
begin
  for policy_row in
    select *
    from pg_policies
    where schemaname = 'public'
      and (
        coalesce(qual, '') ~ 'oss_role[[:space:]]*=[[:space:]]*''admin'''
        or coalesce(with_check, '') ~ 'oss_role[[:space:]]*=[[:space:]]*''admin'''
        or coalesce(qual, '') ~ 'oss_role[[:space:]]+in[[:space:]]*\([[:space:]]*''staff''[[:space:]]*,[[:space:]]*''admin'''
        or coalesce(with_check, '') ~ 'oss_role[[:space:]]+in[[:space:]]*\([[:space:]]*''staff''[[:space:]]*,[[:space:]]*''admin'''
      )
  loop
    using_expression := regexp_replace(
      policy_row.qual,
      'oss_role[[:space:]]*=[[:space:]]*''admin''([[:space:]]*::[[:space:]]*text)?',
      'oss_role in (''admin'', ''master'')',
      'g'
    );
    using_expression := regexp_replace(
      using_expression,
      'oss_role[[:space:]]+in[[:space:]]*\([[:space:]]*''staff''[[:space:]]*,[[:space:]]*''admin''[[:space:]]*\)',
      'oss_role in (''staff'', ''admin'', ''master'')',
      'g'
    );
    check_expression := regexp_replace(
      policy_row.with_check,
      'oss_role[[:space:]]*=[[:space:]]*''admin''([[:space:]]*::[[:space:]]*text)?',
      'oss_role in (''admin'', ''master'')',
      'g'
    );
    check_expression := regexp_replace(
      check_expression,
      'oss_role[[:space:]]+in[[:space:]]*\([[:space:]]*''staff''[[:space:]]*,[[:space:]]*''admin''[[:space:]]*\)',
      'oss_role in (''staff'', ''admin'', ''master'')',
      'g'
    );

    select string_agg(quote_ident(role_name), ', ')
    into role_list
    from unnest(policy_row.roles) as role_name;

    execute format(
      'drop policy %I on %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );

    statement := format(
      'create policy %I on %I.%I as %s for %s to %s',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename,
      policy_row.permissive,
      policy_row.cmd,
      role_list
    );
    if using_expression is not null then
      statement := statement || format(' using (%s)', using_expression);
    end if;
    if check_expression is not null then
      statement := statement || format(' with check (%s)', check_expression);
    end if;
    execute statement;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
