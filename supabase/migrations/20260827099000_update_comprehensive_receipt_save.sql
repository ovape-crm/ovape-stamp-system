create or replace function public.save_comprehensive_settlement_receipt(
  p_receipt_id uuid,
  p_entry_date date,
  p_item_name text,
  p_amount integer,
  p_balance_amount integer default 0,
  p_payment_amount integer default 0,
  p_payment_method text default null
)
returns void
language plpgsql
set search_path = public
as $$
begin
  if p_amount <= 0 or p_balance_amount < 0 or p_payment_amount < 0 then
    raise exception 'INVALID_COMPREHENSIVE_SETTLEMENT_AMOUNT';
  end if;

  delete from public.comprehensive_settlement_entries
  where related_receipt_id = p_receipt_id;

  delete from public.comprehensive_settlement_entries
  where source_receipt_id = p_receipt_id;

  insert into public.comprehensive_settlement_entries (
    entry_date, entry_type, item_name, quantity, unit_price, amount, source_receipt_id
  ) values (
    p_entry_date, 'receipt', p_item_name, 1, p_amount, p_amount, p_receipt_id
  );

  if p_balance_amount > 0 then
    insert into public.comprehensive_settlement_entries (
      entry_date, entry_type, amount, related_receipt_id
    ) values (p_entry_date, 'balance', p_balance_amount, p_receipt_id);
  end if;

  if p_payment_amount > 0 then
    insert into public.comprehensive_settlement_entries (
      entry_date, entry_type, amount, payment_method, related_receipt_id
    ) values (
      p_entry_date, 'payment', p_payment_amount, p_payment_method, p_receipt_id
    );
  end if;
end;
$$;
