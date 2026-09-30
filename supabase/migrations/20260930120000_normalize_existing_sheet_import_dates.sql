update public.customer_sheet_import_rows
set sold_at_text = regexp_replace(
  sold_at_text,
  '^' || chr(92) || 's*([0-9]{4})년' || chr(92) || 's*([0-9]{1,2})월' || chr(92) || 's*([0-9]{1,2})일.*$',
  chr(92) || '1.' || chr(92) || '2.' || chr(92) || '3'
)
where sold_at_text ~ ('^' || chr(92) || 's*[0-9]{4}년' || chr(92) || 's*[0-9]{1,2}월' || chr(92) || 's*[0-9]{1,2}일');
