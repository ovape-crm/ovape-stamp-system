do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.process_work_journal_payroll(uuid[],text,integer,integer,date,integer,jsonb)'::regprocedure)
  into v_definition;

  execute replace(
    v_definition,
    'trim(to_char(v_hours, ''FM999999990.99''))',
    'trim(trailing ''.'' from trim(to_char(v_hours, ''FM999999990.99'')))'
  );
end $$;

notify pgrst, 'reload schema';
