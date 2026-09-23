-- PostgreSQL regular expressions use a single backslash in SQL string literals.
update public.settlement_expenses
set note = regexp_replace(note, '서비스\(\((.*)\)\)', '서비스(\1)', 'g')
where category = '서비스' and note ~ '서비스\(\(.*\)\)';
