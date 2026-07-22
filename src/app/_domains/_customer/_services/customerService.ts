import { CustomerType } from '@/app/_domains/_customer/_types/customer.types';
import supabase from '@/libs/supabaseClient';
import { createLog } from '@/app/_domains/_log/_services/logService';
import { LogCategoryEnum } from '@/app/_enums/enums';
import { getUpdateLogNote } from '@/app/_utils/utils';

export interface SearchParams {
  target?: 'all' | 'name' | 'phone';
  keyword?: string;
  sortBy?: 'name' | 'stamp' | 'created_at';
  sortOrder?: 'asc' | 'desc';
}

export type CustomerQuickLink = Pick<
  CustomerType,
  'id' | 'name' | 'phone' | 'gender'
>;

export const getCustomerQuickLinks = async (): Promise<CustomerQuickLink[]> => {
  const { data, error } = await supabase
    .from('customers')
    .select('id, name, phone, gender, created_at')
    .or(
      'and(name.eq.X,phone.eq.X),name.eq.시연용,name.eq.재고조정',
    )
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []).map(({ id, name, phone, gender }) => ({
    id,
    name,
    phone,
    gender,
  }));
};

/**
 * 전체 고객 수 조회
 */
export const getCustomersCount = async (
  params?: SearchParams
): Promise<number> => {
  let query = supabase.from('customers').select('*', {
    count: 'exact',
    head: true,
  });

  // 검색 조건 추가
  if (params?.keyword) {
    const { target, keyword } = params;

    if (target === 'name') {
      query = query.ilike('name', `%${keyword}%`);
    } else if (target === 'phone') {
      query = query.ilike('phone', `%${keyword}%`);
    } else if (target === 'all') {
      query = query.or(`name.ilike.%${keyword}%,phone.ilike.%${keyword}%`);
    }
  }

  const { count, error } = await query;

  if (error) throw error;

  return count || 0;
};

/**
 * 고객 목록 조회
 */
export const getCustomers = async (
  limit = 10,
  offset = 0,
  params?: SearchParams
): Promise<CustomerType[]> => {
  const from = offset;
  const to = offset + limit - 1;
  
  let query = supabase.from('customers').select(`
    *,
    stamps(count)
  `);

  // 검색 조건 추가
  if (params?.keyword) {
    const { target, keyword } = params;

    if (target === 'name') {
      query = query.ilike('name', `%${keyword}%`);
    } else if (target === 'phone') {
      query = query.ilike('phone', `%${keyword}%`);
    } else if (target === 'all') {
      query = query.or(`name.ilike.%${keyword}%,phone.ilike.%${keyword}%`);
    }
  }

  // 정렬 처리
  const sortBy = params?.sortBy || 'name';
  const sortOrder = params?.sortOrder || (sortBy === 'name' ? 'asc' : 'desc');

  if (sortBy === 'stamp') {
    // 스탬프 많은 순/적은 순은 클라이언트에서 정렬해야 함 (관계형 데이터이므로)
    // 페이지네이션 없이 모든 데이터 가져오기
    const { data: allData, error } = await query;

    if (error) throw error;

    // 클라이언트에서 정렬
    const sortedData = [...allData].sort((a, b) => {
      const aCount = a.stamps?.[0]?.count || 0;
      const bCount = b.stamps?.[0]?.count || 0;
      return sortOrder === 'desc' ? bCount - aCount : aCount - bCount;
    });

    // 정렬 후 페이지네이션 적용
    return sortedData.slice(from, to + 1);
  } else if (sortBy === 'created_at') {
    query = query.order('created_at', { ascending: sortOrder === 'asc' });
  } else {
    // 기본: 이름 가나다 순
    query = query.order('name', { ascending: sortOrder === 'asc' });
  }

  // 페이지네이션 적용
  query = query.range(from, to);

  const { data, error } = await query;

  if (error) throw error;

  return data;
};

/**
 * 고객 상세 조회
 */
export const getCustomerById = async (id: string): Promise<CustomerType> => {
  const { data, error } = await supabase
    .from('customers')
    .select(
      `
      *,
      stamps(count)
    `
    )
    .eq('id', id)
    .single();

  if (error) throw error;

  return data;
};

/**
 * 고객 생성
 */
export const createCustomer = async (customer: {
  name: string;
  phone: string;
  gender: 'male' | 'female';
  note?: string;
}) => {
  // X는 중복 체크 제외
  if (customer.phone !== 'X') {
    const { data: existing, error: existingError } = await supabase
      .from('customers')
      .select('id')
      .eq('phone', customer.phone)
      .maybeSingle();

    if (existingError) throw existingError;
    if (existing) {
      throw new Error('DUPLICATE_CUSTOMER');
    }
  }

  const { data, error } = await supabase
    .from('customers')
    .insert(customer)
    .select()
    .single();

  if (error) throw error;

  await createLog(
    LogCategoryEnum.CUSTOMER.value,
    data.id,
    'create-customer',
    '',
    null
  );

  return data;
};

/**
 * 고객 수정
 */
export const updateCustomer = async (
  id: string,
  updates: {
    name?: string;
    phone?: string;
    gender?: 'male' | 'female';
    note?: string;
  }
) => {
  // 중복 체크 (X는 제외)
  if (updates.phone && updates.phone !== 'X') {
    const { data: existing, error: existingError } = await supabase
      .from('customers')
      .select('id')
      .eq('phone', updates.phone)
      .neq('id', id)
      .maybeSingle();

    if (existingError) throw existingError;
    if (existing) {
      throw new Error('DUPLICATE_CUSTOMER');
    }
  }

  const prevCustomer = await getCustomerById(id);

  const changeObj = getUpdateLogNote(
    {
      name: prevCustomer.name,
      phone: prevCustomer.phone,
      gender: prevCustomer.gender,
      note: prevCustomer?.note ?? '',
    },
    {
      name: updates.name ?? prevCustomer.name,
      phone: updates.phone ?? prevCustomer.phone,
      gender: updates.gender ?? prevCustomer.gender,
      note: updates.note ?? prevCustomer?.note ?? '',
    }
  );

  await createLog(
    LogCategoryEnum.CUSTOMER.value,
    id,
    'update-customer-info',
    '',
    changeObj
  );

  // 고객 업데이트 (결과 없을 수 있음)
  const { data, error } = await supabase
    .from('customers')
    .update(updates)
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('NOT_FOUND_CUSTOMER');

  return data;
};

/**
 * 고객 삭제
 */
export const deleteCustomer = async (id: string) => {
  const { error } = await supabase.from('customers').delete().eq('id', id);

  if (error) throw error;
};
