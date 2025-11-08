import { CustomersLogsResType, LogsResType } from '@/app/_types/log.types';
import supabase from '@/libs/supabaseClient';

/**
 * 로그 추가
 */
export const createLog = async (
  customerId: string,
  action: string,
  note: string = '',
  jsonb: Record<string, unknown> | null = null
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
      jsonb,
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
  customerId: string,
  limit = 10,
  offset = 0
): Promise<CustomersLogsResType> => {
  const from = offset;
  const to = offset + limit - 1;
  const { data, error } = await supabase
    .from('logs')
    .select(
      `
      *,
      users!admin_id(name, email)
    `
    )
    .eq('customer_id', customerId)
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
  offset = 0
): Promise<LogsResType[]> => {
  const from = offset;
  const to = offset + limit - 1;
  const { data, error } = await supabase
    .from('logs')
    .select(
      `
      *,
      users!admin_id(name, email),
      customers(name, phone)
    `
    )
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw error;
  return data;
};

/**
 * 로그 노트 업데이트
 */
export const updateLogNote = async (logId: string, note: string) => {
  const { data, error } = await supabase
    .from('logs')
    .update({ note })
    .eq('id', logId)
    .select()
    .single();

  if (error) throw error;
  return data;
};
