import { useInfiniteQuery } from '@tanstack/react-query';
import {
  getInboundOrders,
  getInboundOrdersCount,
} from '../_services/inboundService';
import { inboundKeys, InboundFilters } from '../_queryKeys/inboundKeys';

export type { InboundFilters };

const PAGE_SIZE = 20;

export const useInboundOrders = (filters?: InboundFilters) => {
  const {
    data,
    isPending,
    isError,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: inboundKeys.list(filters),
    queryFn: async ({ pageParam }) => {
      const f = {
        dateFrom: filters?.dateFrom,
        dateTo: filters?.dateTo,
        itemName: filters?.itemName,
      };
      if (pageParam === 0) {
        const [orders, totalCount] = await Promise.all([
          getInboundOrders(PAGE_SIZE, 0, f),
          getInboundOrdersCount(f),
        ]);
        return { orders, totalCount };
      }
      const orders = await getInboundOrders(PAGE_SIZE, pageParam as number, f);
      return { orders, totalCount: undefined };
    },
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.orders.length < PAGE_SIZE) return undefined;
      return allPages.reduce((sum, page) => sum + page.orders.length, 0);
    },
    initialPageParam: 0,
  });

  const orders = data?.pages.flatMap((p) => p.orders) ?? [];
  const totalCount = data?.pages[0]?.totalCount;

  return {
    orders,
    isLoading: isPending,
    isLoadingMore: isFetchingNextPage,
    error: isError ? '데이터를 불러오는데 실패했습니다.' : '',
    loadMore: () => fetchNextPage(),
    hasMore: hasNextPage ?? false,
    totalCount,
  };
};
