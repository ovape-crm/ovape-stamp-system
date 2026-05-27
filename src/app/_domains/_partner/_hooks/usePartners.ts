import { useQuery } from '@tanstack/react-query';
import { getPartners } from '../_services/partnerService';
import { partnerKeys } from '../_queryKeys/partnerKeys';

export const usePartners = () => {
  const { data, isPending, isError } = useQuery({
    queryKey: partnerKeys.lists(),
    queryFn: getPartners,
  });

  return {
    partners: data ?? [],
    isLoading: isPending,
    error: isError ? '거래처를 불러오는데 실패했습니다.' : '',
  };
};
