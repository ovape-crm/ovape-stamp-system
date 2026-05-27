import supabase from '@/libs/supabaseClient';
import { PartnerType } from '../_types/partner.types';

export const getPartners = async (): Promise<PartnerType[]> => {
  const { data, error } = await supabase
    .from('partners')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw error;
  return data ?? [];
};

export const createPartner = async (values: {
  name: string;
  customerServicePhone: string | null;
  asServicePhone: string | null;
  link: string | null;
  note: string | null;
}): Promise<void> => {
  const { error } = await supabase.from('partners').insert({
    name: values.name,
    customer_service_phone: values.customerServicePhone,
    as_service_phone: values.asServicePhone,
    link: values.link,
    note: values.note,
  });

  if (error) throw error;
};

export const updatePartner = async (
  id: string,
  values: {
    name: string;
    customerServicePhone: string | null;
    asServicePhone: string | null;
    link: string | null;
    note: string | null;
  },
): Promise<void> => {
  const { error } = await supabase
    .from('partners')
    .update({
      name: values.name,
      customer_service_phone: values.customerServicePhone,
      as_service_phone: values.asServicePhone,
      link: values.link,
      note: values.note,
    })
    .eq('id', id);

  if (error) throw error;
};

export const deletePartner = async (id: string): Promise<void> => {
  const { error } = await supabase.from('partners').delete().eq('id', id);
  if (error) throw error;
};
