import { useInfiniteQuery } from "@tanstack/react-query";
import { getItems, getItemsCount } from "../_services/itemService";
import { itemKeys, ItemFilters } from "../_queryKeys/itemKeys";

export type { ItemFilters };

const PAGE_SIZE = 20;

export const useItems = (
  filters?: ItemFilters,
  options?: { enabled?: boolean },
) => {
  const {
    data,
    isPending,
    isFetching,
    isError,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: itemKeys.list(filters),
    queryFn: async ({ pageParam }) => {
      const f = {
        categoryId: filters?.categoryId,
        searchConditions: filters?.searchConditions,
        searchKeyword: filters?.searchKeyword,
        isUse: filters?.isUse,
      };
      if (pageParam === 0) {
        const [items, totalCount] = await Promise.all([
          getItems(PAGE_SIZE, 0, f),
          getItemsCount(f),
        ]);
        return { items, totalCount };
      }
      const items = await getItems(PAGE_SIZE, pageParam as number, f);
      return { items, totalCount: undefined };
    },
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.items.length < PAGE_SIZE) return undefined;
      return allPages.reduce((sum, page) => sum + page.items.length, 0);
    },
    initialPageParam: 0,
    enabled: options?.enabled ?? true,
    retry: 1,
  });

  const items = data?.pages.flatMap((p) => p.items) ?? [];
  const totalCount = data?.pages[0]?.totalCount;

  return {
    items,
    isLoading: isPending,
    isFetching,
    isLoadingMore: isFetchingNextPage,
    error: isError ? "데이터를 불러오는데 실패했습니다." : "",
    loadMore: () => fetchNextPage(),
    hasMore: hasNextPage ?? false,
    totalCount,
  };
};
