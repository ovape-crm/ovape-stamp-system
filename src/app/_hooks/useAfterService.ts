import { useQuery } from '@tanstack/react-query';
import { getAfterServiceDetail } from '@/app/_services/afterService';
import { afterServiceKeys } from '@/app/_queryKeys/afterServiceKeys';

type AfterServiceDetailType = {
  id: string;
  customer_id: string;
  item_type: string;
  item_name: string;
  quantity: number;
  symptom: string;
  shop_note?: string | null;
  customer_note?: string | null;
  is_loaner_device_issued?: boolean;
  status: string;
  created_at: string;
  updated_at?: string;
  users: {
    name: string;
    email: string;
  } | null;
  customers: {
    name: string;
    phone: string;
  } | null;
};

export const useAfterService = (id: string | null) => {
  const { data, isPending, isError } = useQuery({
    queryKey: afterServiceKeys.detail(id),
    queryFn: () => getAfterServiceDetail(id!),
    enabled: !!id,
  });

  return {
    afterService: (data as AfterServiceDetailType | undefined) ?? null,
    isLoading: !!id && isPending,
    error: isError ? 'AS 상세 정보를 불러오는데 실패했습니다.' : '',
  };
};
