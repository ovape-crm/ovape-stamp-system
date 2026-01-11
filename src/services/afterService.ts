import {
  AfterServiceItemTypeEnumType,
  AfterServiceStatusEnum,
  AfterServiceStatusEnumType,
  AfterServiceStatusGroupEnumType,
} from '@/app/_enums/enums';
import supabase from '@/libs/supabaseClient';
import { createAfterServiceLog } from './logService';
import { getAfterServiceStatusGroups } from '@/app/_utils/utils';

export const createAfterService = async ({
  customerId,
  itemType,
  itemName,
  quantity,
  symptom,
  note = '',
}: {
  customerId: string | null;
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
      customer_id: customerId ? String(customerId) : null,
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

  await createAfterServiceLog(
    customerId ? String(customerId) : null,
    data.id,
    'after-service-received'
  );

  return data;
};

/**
 * 전체 AS 수 조회
 */
export const getAfterServicesCount = async (filters?: {
  status?: AfterServiceStatusEnumType['value'];
  groupStatus?: AfterServiceStatusGroupEnumType['value'];
  searchTarget?: 'name' | 'phone' | 'item_name';
  searchKeyword?: string;
  customerId?: string;
}): Promise<number> => {
  // customers 테이블로 필터링할 경우 inner join 사용
  const needsInnerJoin =
    filters?.searchKeyword &&
    filters.searchKeyword.trim() &&
    filters.searchTarget &&
    (filters.searchTarget === 'name' || filters.searchTarget === 'phone');

  // select 쿼리 조건부 설정
  const selectQuery = needsInnerJoin
    ? '*, customers!inner(name, phone)'
    : '*';

  let query = supabase
    .from('after_services')
    .select(selectQuery, {
      count: 'exact',
      head: true,
    });

  // customerId 필터링 (선택사항)
  if (filters?.customerId) {
    query = query.eq('customer_id', filters.customerId);
  }

  // status 필터링 (선택사항)
  // groupStatus가 우선 (그룹 필터링이 있으면 그룹의 모든 status로 필터링)
  if (filters?.groupStatus) {
    const statusGroups = getAfterServiceStatusGroups();
    let statusArray: string[] = [];
    if (filters.groupStatus === 'received') {
      statusArray = statusGroups.received;
    } else if (filters.groupStatus === 'inProgress') {
      statusArray = statusGroups.inProgress;
    } else if (filters.groupStatus === 'completed') {
      statusArray = statusGroups.completed;
    }
    if (statusArray.length > 0) {
      query = query.in('status', statusArray);
    }
  } else if (filters?.status) {
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

  const { count, error } = await query;

  if (error) throw error;

  return count || 0;
};

/**
 * 전체 AS 조회 (페이지네이션)
 */
export const getAfterServices = async (
  limit = 10,
  offset = 0,
  filters?: {
    status?: AfterServiceStatusEnumType['value'];
    groupStatus?: AfterServiceStatusGroupEnumType['value'];
    searchTarget?: 'name' | 'phone' | 'item_name';
    searchKeyword?: string;
    customerId?: string;
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

  // customerId 필터링 (선택사항)
  if (filters?.customerId) {
    query = query.eq('customer_id', filters.customerId);
  }

  // status 필터링 (선택사항)
  // groupStatus가 우선 (그룹 필터링이 있으면 그룹의 모든 status로 필터링)
  if (filters?.groupStatus) {
    const statusGroups = getAfterServiceStatusGroups();
    let statusArray: string[] = [];
    if (filters.groupStatus === 'received') {
      statusArray = statusGroups.received;
    } else if (filters.groupStatus === 'inProgress') {
      statusArray = statusGroups.inProgress;
    } else if (filters.groupStatus === 'completed') {
      statusArray = statusGroups.completed;
    }
    if (statusArray.length > 0) {
      query = query.in('status', statusArray);
    }
  } else if (filters?.status) {
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

/**
 * AS 정보 업데이트
 */
export const updateAfterService = async (
  id: string,
  {
    customerId,
    itemType,
    itemName,
    quantity,
    symptom,
    note,
  }: {
    customerId: string | null;
    itemType: AfterServiceItemTypeEnumType['value'];
    itemName: string;
    quantity: number;
    symptom: string;
    note?: string;
  }
) => {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) {
    throw new Error('세션을 찾을 수 없습니다');
  }

  // 기존 AS 정보 가져오기
  const prevAfterService = await getAfterServiceDetail(id);

  // AS 업데이트
  const { data, error } = await supabase
    .from('after_services')
    .update({
      customer_id: customerId ? String(customerId) : null,
      item_type: itemType,
      item_name: itemName,
      quantity: quantity,
      symptom: symptom,
      note: note || null,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;

  // 변경사항 추적
  const changeObj: Record<
    string,
    { old: string | number | null; new: string | number | null }
  > = {};

  const prevCustomerId = prevAfterService.customer_id
    ? String(prevAfterService.customer_id)
    : null;
  const newCustomerId = customerId ? String(customerId) : null;

  if (prevCustomerId !== newCustomerId) {
    changeObj.customer_id = { old: prevCustomerId, new: newCustomerId };
  }
  if (prevAfterService.item_type !== itemType) {
    changeObj.item_type = { old: prevAfterService.item_type, new: itemType };
  }
  if (prevAfterService.item_name !== itemName) {
    changeObj.item_name = { old: prevAfterService.item_name, new: itemName };
  }
  if (prevAfterService.quantity !== quantity) {
    changeObj.quantity = { old: prevAfterService.quantity, new: quantity };
  }
  if (prevAfterService.symptom !== symptom) {
    changeObj.symptom = { old: prevAfterService.symptom, new: symptom };
  }
  const prevNote = prevAfterService.note || '';
  const newNote = note || '';
  if (prevNote !== newNote) {
    changeObj.note = { old: prevNote || null, new: newNote || null };
  }

  // 변경사항이 있을 때만 로그 생성
  if (Object.keys(changeObj).length > 0) {
    await createAfterServiceLog(
      newCustomerId,
      data.id,
      'update-after-service-info',
      '',
      changeObj
    );
  }

  return data;
};

/**
 * AS 삭제
 */
export const deleteAfterService = async (id: string) => {
  const { error } = await supabase.from('after_services').delete().eq('id', id);

  if (error) throw error;
};
