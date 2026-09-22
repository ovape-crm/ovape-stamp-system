import supabase from '@/libs/supabaseClient';

export type RequiredSystemNotice = {
  id: string;
  title: string;
  content: string;
  created_at: string;
};

export const getPendingRequiredSystemNotices = async () => {
  const { data, error } = await supabase.rpc('get_pending_required_system_notices');
  if (error) throw error;
  return (data ?? []) as RequiredSystemNotice[];
};

export const acknowledgeRequiredSystemNotice = async (noticeId: string) => {
  const { error } = await supabase.rpc('acknowledge_required_system_notice', {
    p_notice_id: noticeId,
  });
  if (error) throw error;
};
