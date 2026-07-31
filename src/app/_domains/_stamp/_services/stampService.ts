import supabase from '@/libs/supabaseClient';
import {
  createLog,
  withCreatedWorker,
} from '@/app/_domains/_log/_services/logService';
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
  const { error } = await supabase.rpc('apply_stamp_log_operation', {
    p_customer_id: customerId,
    p_stamp_delta: amount,
    p_action: amount === 0 ? 'no-stamp' : `add-${amount}`,
    p_note: note,
    p_jsonb: await withCreatedWorker({ paymentType, ...logMeta }),
  });
  if (error) throw error;
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

  const { error: updateError } = await supabase.rpc(
    'confirm_reservation_stamp_operation',
    { p_log_id: String(logId) },
  );
  if (updateError) throw updateError;
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
  const { error } = await supabase.rpc('apply_stamp_log_operation', {
    p_customer_id: customerId,
    p_stamp_delta: -amount,
    p_action: `${mode}-${amount}`,
    p_note: note,
    p_jsonb: await withCreatedWorker(null),
  });
  if (error) throw error;
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
