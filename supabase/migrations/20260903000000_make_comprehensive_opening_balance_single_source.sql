-- 종합정산의 기존 잔금은 전표별 추가금이 아니라 한 번만 잡히는 기초 이월로 전환한다.
alter table public.comprehensive_settlement_entries
  drop constraint if exists comprehensive_settlement_entries_entry_type_check;

alter table public.comprehensive_settlement_entries
  add constraint comprehensive_settlement_entries_entry_type_check
  check (entry_type in ('receipt', 'balance', 'opening_balance', 'payment'));

update public.comprehensive_settlement_entries
set entry_type = 'opening_balance',
    related_receipt_id = null,
    source_receipt_id = null,
    item_name = coalesce(item_name, '기초 이월 잔액'),
    note = coalesce(nullif(note, ''), '기존 이월/잔금에서 전환')
where entry_type = 'balance';

alter table public.comprehensive_settlement_entries
  drop constraint comprehensive_settlement_entries_entry_type_check;

alter table public.comprehensive_settlement_entries
  add constraint comprehensive_settlement_entries_entry_type_check
  check (entry_type in ('receipt', 'opening_balance', 'payment'));

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
  if p_amount <= 0 or p_payment_amount < 0 then
    raise exception 'INVALID_COMPREHENSIVE_SETTLEMENT_AMOUNT';
  end if;

  -- 기초 이월은 이력에서 한 번만 관리한다. 전표 저장으로 새 잔금을 추가할 수 없다.
  if p_balance_amount <> 0 then
    raise exception 'COMPREHENSIVE_OPENING_BALANCE_MUST_BE_MANAGED_SEPARATELY';
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

  if p_payment_amount > 0 then
    insert into public.comprehensive_settlement_entries (
      entry_date, entry_type, amount, payment_method, related_receipt_id
    ) values (
      p_entry_date, 'payment', p_payment_amount, p_payment_method, p_receipt_id
    );
  end if;
end;
$$;
