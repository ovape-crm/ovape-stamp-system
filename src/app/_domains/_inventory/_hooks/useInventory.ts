import { useQuery } from '@tanstack/react-query';
import { getInventoryById } from '../_services/inventoryService';
import { inventoryKeys } from '../_queryKeys/inventoryKeys';

export const useInventory = (id: string) => {
  const { data, isPending, isError } = useQuery({
    queryKey: inventoryKeys.detail(id),
    queryFn: () => getInventoryById(id),
    enabled: !!id,
  });

  return {
    item: data ?? null,
    isLoading: isPending,
    error: isError ? '재고 정보를 불러오는데 실패했습니다.' : '',
  };
};
