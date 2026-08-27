-- Master is always above admin. Apply this hierarchy to every existing DB function and RLS policy,
-- including functions added after the first role-hierarchy migration.
do $$
declare
  function_row record;
  policy_row record;
  definition text;
  using_expression text;
  check_expression text;
  statement text;
begin
  for function_row in
    select procedure.oid
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    join pg_language language on language.oid = procedure.prolang
    where namespace.nspname = 'public'
      and language.lanname in ('plpgsql', 'sql')
  loop
    definition := pg_get_functiondef(function_row.oid);
    definition := replace(
      definition,
      'oss_role = ''admin''::text',
      'oss_role = any (array[''admin''::text, ''master''::text])'
    );
    definition := replace(
      definition,
      'oss_role = ''admin''',
      'oss_role in (''admin'', ''master'')'
    );
    definition := replace(
      definition,
      'oss_role in (''staff'', ''admin'')',
      'oss_role in (''staff'', ''admin'', ''master'')'
    );
    execute definition;
  end loop;

  for policy_row in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (
        coalesce(qual, '') like '%oss_role = ''admin''%'
        or coalesce(with_check, '') like '%oss_role = ''admin''%'
        or coalesce(qual, '') like '%oss_role IN (''staff'', ''admin'')%'
        or coalesce(with_check, '') like '%oss_role IN (''staff'', ''admin'')%'
      )
  loop
    using_expression := replace(
      coalesce(policy_row.qual, ''),
      'oss_role = ''admin''::text',
      'oss_role = ANY (ARRAY[''admin''::text, ''master''::text])'
    );
    using_expression := replace(
      using_expression,
      'oss_role = ''admin''',
      'oss_role IN (''admin'', ''master'')'
    );
    using_expression := replace(
      using_expression,
      'oss_role IN (''staff'', ''admin'')',
      'oss_role IN (''staff'', ''admin'', ''master'')'
    );
    check_expression := replace(
      coalesce(policy_row.with_check, ''),
      'oss_role = ''admin''::text',
      'oss_role = ANY (ARRAY[''admin''::text, ''master''::text])'
    );
    check_expression := replace(
      check_expression,
      'oss_role = ''admin''',
      'oss_role IN (''admin'', ''master'')'
    );
    check_expression := replace(
      check_expression,
      'oss_role IN (''staff'', ''admin'')',
      'oss_role IN (''staff'', ''admin'', ''master'')'
    );
    statement := format(
      'alter policy %I on %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
    if policy_row.qual is not null then
      statement := statement || format(' using (%s)', using_expression);
    end if;
    if policy_row.with_check is not null then
      statement := statement || format(' with check (%s)', check_expression);
    end if;
    execute statement;
  end loop;
end;
$$;
