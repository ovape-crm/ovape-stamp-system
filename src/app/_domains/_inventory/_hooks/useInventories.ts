import { useInfiniteQuery } from '@tanstack/react-query';
import {
  getInventories,
  getInventoriesCount,
} from '../_services/inventoryService';
import { inventoryKeys, InventoryFilters } from '../_queryKeys/inventoryKeys';

export type { InventoryFilters };

const PAGE_SIZE = 20;

export const useInventories = (filters?: InventoryFilters) => {
  const {
    data,
    isPending,
    isError,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: inventoryKeys.list(filters),
    queryFn: async ({ pageParam }) => {
      const f = {
        categoryId: filters?.categoryId,
        searchConditions: filters?.searchConditions,
        isUse: filters?.isUse,
      };
      if (pageParam === 0) {
        const [items, totalCount] = await Promise.all([
          getInventories(PAGE_SIZE, 0, f),
          getInventoriesCount(f),
        ]);
        return { items, totalCount };
      }
      const items = await getInventories(PAGE_SIZE, pageParam as number, f);
      return { items, totalCount: undefined };
    },
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.items.length < PAGE_SIZE) return undefined;
      return allPages.reduce((sum, page) => sum + page.items.length, 0);
    },
    initialPageParam: 0,
  });

  const items = data?.pages.flatMap((p) => p.items) ?? [];
  const totalCount = data?.pages[0]?.totalCount;

  return {
    items,
    isLoading: isPending,
    isLoadingMore: isFetchingNextPage,
    error: isError ? '데이터를 불러오는데 실패했습니다.' : '',
    loadMore: () => fetchNextPage(),
    hasMore: hasNextPage ?? false,
    totalCount,
  };
};
