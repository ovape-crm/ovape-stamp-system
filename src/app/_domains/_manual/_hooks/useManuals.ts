import { useInfiniteQuery } from '@tanstack/react-query';
import { getManuals, getManualsCount } from '../_services/manualService';
import { manualKeys, ManualFilters } from '../_queryKeys/manualKeys';

export type { ManualFilters };

const PAGE_SIZE = 20;

export const useManuals = (filters?: ManualFilters) => {
  const {
    data,
    isPending,
    isError,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: manualKeys.list(filters),
    queryFn: async ({ pageParam }) => {
      const f = {
        subCategoryId: filters?.subCategoryId,
        subCategoryIds: filters?.subCategoryIds,
        searchConditions: filters?.searchConditions,
      };
      if (pageParam === 0) {
        const [manuals, totalCount] = await Promise.all([
          getManuals(PAGE_SIZE, 0, f),
          getManualsCount(f),
        ]);
        return { manuals, totalCount };
      }
      const manuals = await getManuals(PAGE_SIZE, pageParam as number, f);
      return { manuals, totalCount: undefined };
    },
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.manuals.length < PAGE_SIZE) return undefined;
      return allPages.reduce((sum, page) => sum + page.manuals.length, 0);
    },
    initialPageParam: 0,
  });

  const manuals = data?.pages.flatMap((p) => p.manuals) ?? [];
  const totalCount = data?.pages[0]?.totalCount;

  return {
    manuals,
    isLoading: isPending,
    isLoadingMore: isFetchingNextPage,
    error: isError ? '데이터를 불러오는데 실패했습니다.' : '',
    loadMore: () => fetchNextPage(),
    hasMore: hasNextPage ?? false,
    totalCount,
  };
};
