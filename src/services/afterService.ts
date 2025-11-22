import {
  AfterServiceItemTypeEnumType,
  AfterServiceStatusEnum,
} from '@/app/_enums/enums';
import supabase from '@/libs/supabaseClient';

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

  return data;
};
