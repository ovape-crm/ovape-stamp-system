import {
  AfterServiceItemTypeEnumType,
  AfterServiceStatusEnum,
  AfterServiceStatusEnumType,
} from '@/app/_enums/enums';
import supabase from '@/libs/supabaseClient';
import { createAfterServiceLog } from './logService';

export const createAfterService = async ({
  customerId,
  itemType,
  itemName,
  quantity,
  symptom,
  note = '',
}: {
  customerId: string;
  itemType: AfterServiceItemTypeEnumType['value'];
  itemName: string;
  quantity: number;
  symptom: string;
  note?: string;
}) => {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) {
    throw new Error('세션을 찾을 수 없습니다');
  }

  const adminId = session.user.id;

  const { data, error } = await supabase
    .from('after_services')
    .insert({
      admin_id: adminId,
      customer_id: customerId,
      item_type: itemType,
      item_name: itemName,
      quantity: quantity,
      symptom: symptom,
      note: note,
      status: AfterServiceStatusEnum.RECEIVED.value,
    })
    .select()
    .single();

  if (error) throw error;

  await createAfterServiceLog(customerId, data.id, 'after-service-recieved');

  return data;
};

/**
 * 전체 AS 조회 (페이지네이션)
 */
export const getAfterServices = async (
  limit = 10,
  offset = 0,
  filters?: {
    status?: AfterServiceStatusEnumType['value'];
    searchTarget?: 'name' | 'phone' | 'item_name';
    searchKeyword?: string;
  }
) => {
  const from = offset;
  const to = offset + limit - 1;

  // customers 테이블로 필터링할 경우 inner join 사용
  const needsInnerJoin =
    filters?.searchKeyword &&
    filters.searchKeyword.trim() &&
    filters.searchTarget &&
    (filters.searchTarget === 'name' || filters.searchTarget === 'phone');

  const selectQuery = needsInnerJoin
    ? `
      *,
      users!admin_id(name, email),
      customers!inner(name, phone)
    `
    : `
      *,
      users!admin_id(name, email),
      customers(name, phone)
    `;

  let query = supabase
    .from('after_services')
    .select(selectQuery)
    .order('created_at', { ascending: false })
    .range(from, to);

  // status 필터링 (선택사항)
  if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  // 검색 필터링
  if (
    filters?.searchKeyword &&
    filters.searchKeyword.trim() &&
    filters.searchTarget
  ) {
    const keyword = filters.searchKeyword.trim();
    if (filters.searchTarget === 'name') {
      query = query.ilike('customers.name', `%${keyword}%`);
    } else if (filters.searchTarget === 'phone') {
      query = query.ilike('customers.phone', `%${keyword}%`);
    } else if (filters.searchTarget === 'item_name') {
      query = query.ilike('item_name', `%${keyword}%`);
    }
  }

  const { data, error } = await query;

  if (error) throw error;
  return data;
};

/**
 * AS 상세 조회
 */
export const getAfterServiceDetail = async (id: string) => {
  const { data, error } = await supabase
    .from('after_services')
    .select(
      `
      *,
      users!admin_id(name, email),
      customers(name, phone)
    `
    )
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
};

/**
 * AS 상태 업데이트
 */
export const updateAfterServiceStatus = async (
  id: string,
  status: AfterServiceStatusEnumType['value'],
  note: string = ''
) => {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) {
    throw new Error('세션을 찾을 수 없습니다');
  }

  // AS 상태 업데이트
  const { data: afterService, error: updateError } = await supabase
    .from('after_services')
    .update({ status })
    .eq('id', id)
    .select()
    .single();

  if (updateError) throw updateError;

  // 로그 생성
  const action = `after-service-${status}`;
  await createAfterServiceLog(
    afterService.customer_id,
    afterService.id,
    action,
    note
  );

  return afterService;
};
