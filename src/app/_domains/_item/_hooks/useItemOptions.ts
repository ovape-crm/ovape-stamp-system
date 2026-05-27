import { useQuery } from '@tanstack/react-query';
import { getItemOptions } from '../_services/itemService';
import { itemKeys } from '../_queryKeys/itemKeys';

export const useItemOptions = () => {
  const { data, isPending, isError } = useQuery({
    queryKey: itemKeys.options(),
    queryFn: getItemOptions,
  });

  return {
    items: data ?? [],
    isLoading: isPending,
    error: isError ? '품목 목록을 불러오는데 실패했습니다.' : '',
  };
};
