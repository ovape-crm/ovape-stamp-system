import {
  LogCategoryEnum,
  LogCategoryEnumType,
  PaymentTypeEnumType,
  StoreTypeEnumType,
} from '@/app/_enums/enums';
import type { StampLogMeta } from '@/app/_domains/_stamp/_services/stampService';
import { confirmOutboundInventory } from '@/app/_domains/_inventory/_services/outboundInventoryService';
import {
  AfterServiceLogsResType,
  CustomersLogsResType,
  LogsResType,
} from '@/app/_domains/_log/_types/log.types';
import supabase from '@/libs/supabaseClient';
import { getCurrentWorkerName } from '@/app/_domains/_workJournal/_utils/currentWorker';

const resolveCurrentWorkerName = async () => {
  const storedWorkerName = getCurrentWorkerName();
  if (storedWorkerName) return storedWorkerName;

  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const { data } = await supabase
    .from('work_journals')
    .select('worker_name')
    .eq('work_date', today)
    .eq('status', 'working')
    .limit(2);
  return data?.length === 1 ? data[0].worker_name : '';
};

const withCreatedWorker = async (jsonb: Record<string, unknown> | null) => {
  const workerName = await resolveCurrentWorkerName();
  return {
    ...(jsonb ?? {}),
    ...(workerName ? { createdWorkerName: workerName } : {}),
  };
};

const withModifiedWorker = async (jsonb: Record<string, unknown>) => {
  const workerName = await resolveCurrentWorkerName();
  const modifiedAt = new Date().toISOString();
  const storedHistory = Array.isArray(jsonb.modificationHistory)
    ? jsonb.modificationHistory.filter(
        (
          item,
        ): item is {
          workerName: string;
          modifiedAt: string;
        } =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as Record<string, unknown>).workerName === 'string' &&
          typeof (item as Record<string, unknown>).modifiedAt === 'string',
      )
    : [];
  const legacyHistory =
    storedHistory.length === 0 &&
    typeof jsonb.modifiedWorkerName === 'string' &&
    typeof jsonb.modifiedAt === 'string'
      ? [
          {
            workerName: jsonb.modifiedWorkerName,
            modifiedAt: jsonb.modifiedAt,
          },
        ]
      : [];
  const nextWorkerName = workerName || '알 수 없음';

  return {
    ...jsonb,
    modifiedWorkerName: nextWorkerName,
    modifiedAt,
    modificationHistory: [
      ...storedHistory,
      ...legacyHistory,
      { workerName: nextWorkerName, modifiedAt },
    ],
  };
};

/**
 * 로그 추가
 */
export const createLog = async (
  category: LogCategoryEnumType['value'],
  customerId: string,
  action: string,
  note: string = '',
  jsonb: Record<string, unknown> | null = null,
) => {
  // 현재 세션에서 user id 가져오기
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) {
    throw new Error('세션을 찾을 수 없습니다');
  }

  const adminId = session.user.id;

  const { data, error } = await supabase
    .from('logs')
    .insert({
      admin_id: adminId,
      customer_id: customerId,
      action,
      note,
      jsonb: await withCreatedWorker(jsonb),
      category,
    })
    .select()
    .single();

  if (error) throw error;

  return data;
};

/**
 * 특정 고객의 로그 조회 (최신순)
 */
export const getLogsByCustomer = async (
  category: LogCategoryEnumType['value'] = 'stamp',
  customerId: string,
  limit = 10,
  offset = 0,
): Promise<CustomersLogsResType> => {
  const from = offset;
  const to = offset + limit - 1;
  const { data, error } = await supabase
    .from('logs')
    .select(
      `
      *,
      users!admin_id(name, email)
    `,
    )
    .eq('customer_id', customerId)
    .eq('category', category)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw error;

  return data;
};

export const createAfterServiceLog = async (
  customerId: string | null,
  afterServiceId: number,
  action: string,
  note: string = '',
  jsonb: Record<string, unknown> | null = null,
) => {
  // 현재 세션에서 user id 가져오기
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) {
    throw new Error('세션을 찾을 수 없습니다');
  }

  const adminId = session.user.id;

  const { data, error } = await supabase
    .from('logs')
    .insert({
      admin_id: adminId,
      customer_id: customerId ? String(customerId) : null,
      action,
      note,
      jsonb,
      category: LogCategoryEnum.AFTER_SERVICE.value,
      after_service_id: afterServiceId,
    })
    .select()
    .single();

  if (error) throw error;

  return data;
};

/**
 * AS 로그 조회
 */
export const getLogsByAfterServiceId = async (
  afterServiceId: number,
  limit = 10,
  offset = 0,
): Promise<AfterServiceLogsResType> => {
  const from = offset;
  const to = offset + limit - 1;
  const { data, error } = await supabase
    .from('logs')
    .select(
      `*,
      users!admin_id(name, email)`,
    )
    .eq('after_service_id', afterServiceId)
    .eq('category', 'after_service')
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw error;

  return data;
};
/**
 * 전체 로그 조회 (페이지네이션)
 */
export const getLogs = async (
  limit = 10,
  offset = 0,
  category: LogCategoryEnumType['value'] = 'stamp',
  dateRange?: { start: string; end: string },
  paymentMethod?: string,
  searchKeyword?: string,
): Promise<LogsResType[]> => {
  const from = offset;
  const to = offset + limit - 1;
  let query = supabase
    .from('logs')
    .select(
      `
      *,
      users!admin_id(name, email),
      customers(name, phone, address, note, gender)
    `,
    )
    .eq('category', category);

  if (dateRange) {
    query = query
      .gte('created_at', dateRange.start)
      .lte('created_at', `${dateRange.end}T23:59:59.999Z`);
  }

  if (paymentMethod) {
    query = query.eq('jsonb->>paymentType', paymentMethod);
  }

  if (searchKeyword) {
    query = query.ilike('note', `%${searchKeyword}%`);
  }

  const { data, error } = await query
    .order('created_at', { ascending: !!dateRange })
    .range(from, to);

  if (error) throw error;
  return data;
};

/**
 * 로그 삭제
 */
export const deleteLog = async (logId: string) => {
  const { error } = await supabase.from('logs').delete().eq('id', logId);
  if (error) throw error;
};

/**
 * 로그 노트 업데이트
 */
export const updateLogNote = async (
  logId: string,
  note: string,
  paymentType?: PaymentTypeEnumType['value'],
  storeName?: StoreTypeEnumType['value'],
  logMeta?: StampLogMeta,
  action?: string,
) => {
  const { data: existing, error: fetchError } = await supabase
    .from('logs')
    .select('jsonb, category')
    .eq('id', logId)
    .single();

  if (fetchError) throw fetchError;

  if (
    logMeta?.items &&
    existing?.category === LogCategoryEnum.STAMP.value &&
    !(await confirmOutboundInventory(logMeta.items, logId))
  ) {
    throw new Error('사용자가 출고 수정을 취소했습니다.');
  }

  const currentJsonb =
    (existing?.jsonb as Record<string, unknown> | null) ?? {};
  const nextJsonb: Record<string, unknown> = { ...currentJsonb };
  if (paymentType !== undefined) nextJsonb.paymentType = paymentType;
  if (storeName !== undefined) nextJsonb.storeName = storeName;
  if (logMeta !== undefined) {
    nextJsonb.totalAmount = logMeta.totalAmount;
    nextJsonb.items = logMeta.items;
    if (logMeta.discount) {
      nextJsonb.discount = logMeta.discount;
    } else {
      delete nextJsonb.discount;
    }
    if (logMeta.extraNote) {
      nextJsonb.extraNote = logMeta.extraNote;
    } else {
      delete nextJsonb.extraNote;
    }
    nextJsonb.deliveryMethod = logMeta.deliveryMethod ?? 'store_visit';
    if (logMeta.deliveryAddressSource) {
      nextJsonb.deliveryAddressSource = logMeta.deliveryAddressSource;
    } else {
      delete nextJsonb.deliveryAddressSource;
    }
    if (logMeta.deliveryAddress) {
      nextJsonb.deliveryAddress = logMeta.deliveryAddress;
    } else {
      delete nextJsonb.deliveryAddress;
    }
    if (logMeta.deliveryFee !== undefined) {
      nextJsonb.deliveryFee = logMeta.deliveryFee;
    } else {
      delete nextJsonb.deliveryFee;
    }
    if (logMeta.payments?.length) {
      nextJsonb.payments = logMeta.payments;
    } else {
      delete nextJsonb.payments;
    }
  }

  const updatePayload: Record<string, unknown> = {
    note,
    jsonb: await withModifiedWorker(nextJsonb),
  };
  if (action !== undefined) updatePayload.action = action;

  const { data, error } = await supabase
    .from('logs')
    .update(updatePayload)
    .eq('id', logId)
    .select()
    .single();

  if (error) throw error;
  return data;
};
