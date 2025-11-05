import supabase from '@/libs/supabaseClient';
import { createLog } from './logService';

export interface Stamp {
  id: string;
  customer_id: string;
  count: number;
  created_at: string;
}

/**
 * 스탬프 추가 (count 증가)
 */
export const addStamp = async (
  customerId: string,
  amount: number = 1,
  note: string = ''
) => {
  // 먼저 해당 customer의 stamp 레코드가 있는지 확인
  const { data: existing } = await supabase
    .from('stamps')
    .select('*')
    .eq('customer_id', customerId)
    .single();

  let result;

  if (existing) {
    // 기존 레코드가 있으면 count 증가
    const { data, error } = await supabase
      .from('stamps')
      .update({ count: existing.count + amount })
      .eq('customer_id', customerId)
      .select()
      .single();

    if (error) throw error;
    result = data;
  } else {
    // 없으면 새로 생성
    const { data, error } = await supabase
      .from('stamps')
      .insert({ customer_id: customerId, count: amount })
      .select()
      .single();

    if (error) throw error;
    result = data;
  }

  // 로그 추가
  await createLog(customerId, `add-${amount}`, note);

  return result;
};

/**
 * 스탬프 제거 (count 감소)
 */
export const removeStamp = async (
  mode: 'remove' | 'coupon',
  customerId: string,
  amount: number = 1,
  note: string = ''
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
    throw new Error('제거할 스탬프가 부족합니다');
  }

  // count 업데이트 (0이 되어도 레코드는 유지하여 UI 일관성 확보)
  const { error: updateError } = await supabase
    .from('stamps')
    .update({ count: newCount })
    .eq('customer_id', customerId);

  if (updateError) throw updateError;

  // 로그 추가
  await createLog(customerId, `${mode}-${amount}`, note);
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
