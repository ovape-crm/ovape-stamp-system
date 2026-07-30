import supabase from '@/libs/supabaseClient';
import { createLog } from '@/app/_domains/_log/_services/logService';
import {
  LogCategoryEnum,
  PaymentTypeEnumType,
  StoreTypeEnumType,
} from '@/app/_enums/enums';
import { confirmOutboundInventory } from '@/app/_domains/_inventory/_services/outboundInventoryService';

export interface Stamp {
  id: string;
  customer_id: string;
  count: number;
  created_at: string;
}

export type StampLogItem = {
  itemId: string;
  itemName: string;
  itemCategoryName?: string | null;
  quantity: number;
  unitPrice: number;
  adjustedUnitPrice?: number | null;
  amount: number;
  remark: string;
  lineText: string;
  inventoryAction?:
    'out' | 'exchange_in' | 'exchange_out' | 'adjustment_in' | 'adjustment_out';
};

export type StampLogMeta = {
  storeName?: StoreTypeEnumType['value'];
  totalAmount?: number;
  extraNote?: string;
  reservationDate?: string;
  deliveryMethod?: 'store_visit' | 'parcel' | 'delivery';
  deliveryAddressSource?: 'registered' | 'new';
  deliveryAddress?: string;
  deliveryMemo?: string;
  deliveryFee?: number;
  payments?: Array<{
    paymentType: PaymentTypeEnumType['value'];
    paymentTypeName: string;
    amount: number;
  }>;
  discount?: {
    type: string;
    name: string;
    amount: number;
    lineText: string;
  };
  items?: StampLogItem[];
};

/**
 * action 문자열에서 스탬프 개수 추출 ('add-3' → 3, 'no-stamp' → 0)
 */
const getStampAmountFromAction = (action: string) => {
  if (action.startsWith('add-')) {
    const amount = Number(action.replace('add-', ''));
    return Number.isFinite(amount) ? amount : 0;
  }
  return 0;
};

/**
 * 스탬프 카운트 적용 (로그 기록 없이 count만 증가)
 */
const applyStampCount = async (customerId: string, amount: number) => {
  // 먼저 해당 customer의 stamp 레코드가 있는지 확인
  const { data: existing } = await supabase
    .from('stamps')
    .select('*')
    .eq('customer_id', customerId)
    .single();

  if (amount === 0) {
    // 미적립: 스탬프 카운트 변경 없음
    return existing ?? null;
  }

  if (existing) {
    // 기존 레코드가 있으면 count 증가
    const { data, error } = await supabase
      .from('stamps')
      .update({ count: existing.count + amount })
      .eq('customer_id', customerId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // 없으면 새로 생성
  const { data, error } = await supabase
    .from('stamps')
    .insert({ customer_id: customerId, count: amount })
    .select()
    .single();

  if (error) throw error;
  return data;
};

/**
 * 스탬프 추가 (count 증가)
 */
export const addStamp = async (
  customerId: string,
  amount: number = 1,
  note: string = '',
  paymentType?: PaymentTypeEnumType['value'],
  logMeta?: StampLogMeta,
) => {
  if (!(await confirmOutboundInventory(logMeta?.items ?? []))) {
    throw new Error('출고 처리를 취소했습니다.');
  }
  const result = await applyStampCount(customerId, amount);

  // 로그 추가
  await createLog(
    LogCategoryEnum.STAMP.value,
    customerId,
    amount === 0 ? 'no-stamp' : `add-${amount}`,
    note,
    { paymentType, ...logMeta },
  );

  return result;
};

/**
 * 출고 예약 (스탬프 카운트는 변경하지 않고 reservation 로그만 기록)
 */
export const addReservationStamp = async (
  customerId: string,
  amount: number = 0,
  note: string = '',
  paymentType?: PaymentTypeEnumType['value'],
  logMeta?: StampLogMeta,
) => {
  return createLog(
    LogCategoryEnum.RESERVATION.value,
    customerId,
    amount === 0 ? 'no-stamp' : `add-${amount}`,
    note,
    { paymentType, ...logMeta },
  );
};

/**
 * 예약 이력 확정 (스탬프 카운트를 적용하고 reservation → stamp 로그로 전환)
 */
export const confirmReservationStamp = async (logId: string) => {
  const { data: log, error } = await supabase
    .from('logs')
    .select('*')
    .eq('id', logId)
    .single();

  if (error) throw error;
  if (!log) throw new Error('예약 이력을 찾을 수 없습니다');

  const reservationItems = Array.isArray(log.jsonb?.items)
    ? (log.jsonb.items as StampLogItem[])
    : [];
  if (!(await confirmOutboundInventory(reservationItems, logId))) {
    throw new Error('출고 확정을 취소했습니다.');
  }

  const amount = getStampAmountFromAction(log.action);

  if (amount > 0 && log.customer_id) {
    await applyStampCount(log.customer_id, amount);
  }

  const { data: updated, error: updateError } = await supabase
    .from('logs')
    .update({
      category: LogCategoryEnum.STAMP.value,
      created_at: new Date().toISOString(),
    })
    .eq('id', logId)
    .select()
    .single();

  if (updateError) throw updateError;

  return updated;
};

/**
 * 스탬프 제거 (count 감소)
 */
export const removeStamp = async (
  mode: 'remove' | 'coupon',
  customerId: string,
  amount: number = 1,
  note: string = '',
) => {
  // 먼저 해당 customer의 stamp 레코드 확인
  const { data: existing, error: findError } = await supabase
    .from('stamps')
    .select('*')
    .eq('customer_id', customerId)
    .single();

  if (findError) throw findError;
  if (!existing) {
    throw new Error('스탬프가 없습니다');
  }

  const newCount = existing.count - amount;

  if (newCount < 0) {
    throw new Error('차감할 스탬프가 부족합니다');
  }

  // count 업데이트 (0이 되어도 레코드는 유지하여 UI 일관성 확보)
  const { error: updateError } = await supabase
    .from('stamps')
    .update({ count: newCount })
    .eq('customer_id', customerId);

  if (updateError) throw updateError;

  // 로그 추가
  await createLog(
    LogCategoryEnum.STAMP.value,
    customerId,
    `${mode}-${amount}`,
    note,
  );
};

/**
 * 특정 고객의 스탬프 목록 조회
 */
export const getStampsByCustomer = async (customerId: string) => {
  const { data, error } = await supabase
    .from('stamps')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return data as Stamp[];
};

/**
 * 특정 스탬프 삭제
 */
export const deleteStamp = async (stampId: string) => {
  const { error } = await supabase.from('stamps').delete().eq('id', stampId);

  if (error) throw error;
};
