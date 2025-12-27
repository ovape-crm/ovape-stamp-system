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
  status?: AfterServiceStatusEnumType['value']
) => {
  const from = offset;
  const to = offset + limit - 1;
  let query = supabase
    .from('after_services')
    .select(
      `
      *,
      users!admin_id(name, email),
      customers(name, phone)
    `
    )
    .order('created_at', { ascending: false })
    .range(from, to);

  // status 필터링 (선택사항)
  if (status) {
    query = query.eq('status', status);
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
