import supabase from '@/libs/supabaseClient';
import {
  CashClosingType,
  CashCounts,
  DailyCashSales,
  DailyPaymentSales,
  WorkShift,
} from '../_types/cashManagement.types';

const CASH_PAYMENT_TYPES = new Set([
  'cash',
  'cash_receipt',
  'egu_cash',
  'egu_cash_receipt',
]);

const NON_PAYMENT_TYPES = new Set(['remark', 'shipment_remark']);
const OVAPE_PAYMENT_TYPES = [
  { paymentType: 'card', label: '카드' },
  { paymentType: 'transfer', label: '이체' },
  { paymentType: 'cash', label: '현금' },
  { paymentType: 'cash_receipt', label: '현금영수증' },
  { paymentType: 'transfer_cash_receipt', label: '이체현금영수증' },
  { paymentType: 'kakaotalk', label: '카카오톡' },
] as const;
const EGU_PAYMENT_TYPES = [
  { paymentType: 'egu_card', label: '카드' },
  { paymentType: 'egu_transfer', label: '이체' },
  { paymentType: 'egu_cash', label: '현금' },
  { paymentType: 'egu_cash_receipt', label: '현금영수증' },
] as const;

const getKoreaDateRange = (date: string) => {
  const startDate = new Date(`${date}T00:00:00+09:00`);
  const endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);
  return { start: startDate.toISOString(), end: endDate.toISOString() };
};

export const getDailyCashSales = async (
  date: string,
): Promise<DailyCashSales> => {
  const { start, end } = getKoreaDateRange(date);
  const { data, error } = await supabase
    .from('logs')
    .select('jsonb')
    .eq('category', 'stamp')
    .gte('created_at', start)
    .lt('created_at', end);

  if (error) throw error;

  let ovape = 0;
  let eguVape = 0;

  for (const log of data ?? []) {
    const jsonb = (log.jsonb ?? {}) as Record<string, unknown>;
    const paymentType = String(jsonb.paymentType ?? '');
    if (!CASH_PAYMENT_TYPES.has(paymentType)) continue;

    const amount = Number(jsonb.totalAmount ?? 0);
    if (!Number.isFinite(amount)) continue;

    if (paymentType.startsWith('egu_')) {
      eguVape += amount;
    } else {
      ovape += amount;
    }
  }

  return { ovape, eguVape, total: ovape + eguVape };
};

export const getDailyPaymentSales = async (
  date: string,
): Promise<DailyPaymentSales> => {
  const { start, end } = getKoreaDateRange(date);
  const { data, error } = await supabase
    .from('logs')
    .select('jsonb')
    .eq('category', 'stamp')
    .gte('created_at', start)
    .lt('created_at', end);

  if (error) throw error;

  const amountByPaymentType = new Map<string, number>();
  const quantityByCategory = new Map<string, number>();

  for (const log of data ?? []) {
    const jsonb = (log.jsonb ?? {}) as Record<string, unknown>;
    const paymentType = String(jsonb.paymentType ?? '').trim();
    const amount = Number(jsonb.totalAmount ?? 0);
    if (
      !paymentType ||
      NON_PAYMENT_TYPES.has(paymentType) ||
      !Number.isFinite(amount)
    ) {
      continue;
    }

    amountByPaymentType.set(
      paymentType,
      (amountByPaymentType.get(paymentType) ?? 0) + amount,
    );

    const items = Array.isArray(jsonb.items)
      ? (jsonb.items as Array<{
          itemCategoryName?: unknown;
          quantity?: unknown;
        }>)
      : [];
    for (const item of items) {
      const categoryName =
        String(item.itemCategoryName ?? "").trim() || "기타";
      const quantity = Number(item.quantity ?? 0);
      if (!Number.isFinite(quantity) || quantity <= 0) continue;
      quantityByCategory.set(
        categoryName,
        (quantityByCategory.get(categoryName) ?? 0) + quantity,
      );
    }
  }

  const ovapeBreakdown = OVAPE_PAYMENT_TYPES.map((item) => ({
    ...item,
    amount: amountByPaymentType.get(item.paymentType) ?? 0,
  }));
  const eguVapeBreakdown = EGU_PAYMENT_TYPES.map((item) => ({
    ...item,
    amount: amountByPaymentType.get(item.paymentType) ?? 0,
  }));
  const breakdown = [...ovapeBreakdown, ...eguVapeBreakdown];

  return {
    breakdown,
    ovapeBreakdown,
    eguVapeBreakdown,
    itemSummary: [...quantityByCategory.entries()]
      .map(([categoryName, quantity]) => ({ categoryName, quantity }))
      .sort((a, b) => b.quantity - a.quantity),
    total: breakdown.reduce((sum, item) => sum + item.amount, 0),
  };
};

export const getCashClosing = async (
  date: string,
): Promise<CashClosingType | null> => {
  const { data, error } = await supabase
    .from('cash_register_closings')
    .select('*')
    .eq('business_date', date)
    .maybeSingle();

  if (error) throw error;
  return data as CashClosingType | null;
};

export const getPreviousClosing = async (
  date: string,
): Promise<CashClosingType | null> => {
  const { data, error } = await supabase
    .from('cash_register_closings')
    .select('*')
    .lt('business_date', date)
    .order('business_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as CashClosingType | null;
};

export const getCashClosingHistory = async (
  startDate: string,
  endDate: string,
): Promise<CashClosingType[]> => {
  const { data, error } = await supabase
    .from('cash_register_closings')
    .select('*')
    .gte('business_date', startDate)
    .lte('business_date', endDate)
    .order('business_date', { ascending: false })
    .limit(366);

  if (error) throw error;
  return (data ?? []) as CashClosingType[];
};

export const saveCashClosing = async (values: {
  businessDate: string;
  openingCash: number;
  cashIn: number;
  cashOut: number;
  ovapeCashSales: number;
  eguCashSales: number;
  expectedCash: number;
  actualCash: number;
  cashCounts: CashCounts;
  workShifts: WorkShift[];
  workerName: string;
  note: string;
}): Promise<void> => {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) throw new Error('세션을 찾을 수 없습니다.');

  const { error } = await supabase.from('cash_register_closings').upsert(
    {
      business_date: values.businessDate,
      opening_cash: values.openingCash,
      cash_in: values.cashIn,
      cash_out: values.cashOut,
      ovape_cash_sales: values.ovapeCashSales,
      egu_cash_sales: values.eguCashSales,
      expected_cash: values.expectedCash,
      actual_cash: values.actualCash,
      cash_counts: values.cashCounts,
      work_shifts: values.workShifts,
      worker_name: values.workerName,
      note: values.note || null,
      created_by: session.user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'business_date' },
  );

  if (error) throw error;
};
