import { useQuery } from '@tanstack/react-query';
import { getItemCategories } from '../_services/itemCategoryService';
import { itemKeys } from '../_queryKeys/itemKeys';

export const useItemCategories = () => {
  const { data, isPending, isError } = useQuery({
    queryKey: itemKeys.categories(),
    queryFn: getItemCategories,
  });

  return {
    categories: data ?? [],
    isLoading: isPending,
    error: isError ? '카테고리를 불러오는데 실패했습니다.' : '',
  };
};
