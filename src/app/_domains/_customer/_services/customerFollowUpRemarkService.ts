import supabase from '@/libs/supabaseClient';

export type CustomerFollowUpRemark = {
  id: string;
  customer_id: string;
  content: string;
  created_by_name: string;
  created_at: string;
  is_completed: boolean;
  completed_content: string | null;
  completed_by_name: string | null;
  completed_at: string | null;
  customers?: { name: string; phone: string } | null;
};

export const getOpenCustomerFollowUpRemarks = async (customerId?: string) => {
  let query = supabase
    .from('customer_follow_up_remarks')
    .select('id, customer_id, content, created_by_name, created_at, is_completed, completed_content, completed_by_name, completed_at, customers(name, phone)')
    .eq('is_completed', false)
    .order('created_at', { ascending: true });
  if (customerId) query = query.eq('customer_id', customerId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as CustomerFollowUpRemark[];
};

export const createCustomerFollowUpRemark = async ({
  customerId,
  content,
  authorName,
}: {
  customerId: string;
  content: string;
  authorName: string;
}) => {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('customer_follow_up_remarks').insert({
    customer_id: customerId,
    content,
    created_by: user?.id ?? null,
    created_by_name: authorName,
  });
  if (error) throw error;
};

export const completeCustomerFollowUpRemark = async ({
  id,
  content,
  workerName,
}: {
  id: string;
  content: string;
  workerName: string;
}) => {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('customer_follow_up_remarks')
    .update({
      is_completed: true,
      completed_content: content,
      completed_by: user?.id ?? null,
      completed_by_name: workerName,
      completed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('is_completed', false);
  if (error) throw error;
};
