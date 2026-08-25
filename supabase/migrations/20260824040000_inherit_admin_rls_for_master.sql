-- Master is the highest role and inherits every policy granted to admin.
-- Master-only policies are intentionally not changed.
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
        coalesce(qual, '') like '%oss_role = ''admin''::text%'
        or coalesce(with_check, '') like '%oss_role = ''admin''::text%'
      )
  loop
    using_expression := replace(
      policy_row.qual,
      'oss_role = ''admin''::text',
      'oss_role = any (array[''admin''::text, ''master''::text])'
    );
    check_expression := replace(
      policy_row.with_check,
      'oss_role = ''admin''::text',
      'oss_role = any (array[''admin''::text, ''master''::text])'
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
end $$;
