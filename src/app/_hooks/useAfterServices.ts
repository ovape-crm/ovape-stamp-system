import { useInfiniteQuery } from '@tanstack/react-query';
import {
  getAfterServices,
  getAfterServicesCount,
} from '@/app/_services/afterService';
import { AfterServiceStatusEnumType } from '@/app/_enums/enums';
import {
  afterServiceKeys,
  AfterServiceFilters,
} from '@/app/_queryKeys/afterServiceKeys';

export type { AfterServiceFilters };

const PAGE_SIZE = 10;

type AfterServiceType = {
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
  users: {
    name: string;
    email: string;
  } | null;
  customers: {
    name: string;
    phone: string;
  } | null;
};

const buildFilterParams = (filters?: AfterServiceFilters) => ({
  status:
    filters?.status && filters.status !== 'all'
      ? (filters.status as AfterServiceStatusEnumType['value'])
      : undefined,
  groupStatus: filters?.groupStatus,
  searchTarget: filters?.searchTarget as
    | 'name'
    | 'phone'
    | 'item_name'
    | undefined,
  searchKeyword: filters?.searchKeyword,
});

export const useAfterServices = (filters?: AfterServiceFilters) => {
  const {
    data,
    isPending,
    isError,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: afterServiceKeys.list(filters),
    queryFn: async ({ pageParam }) => {
      const filterParams = buildFilterParams(filters);
      if (pageParam === 0) {
        const [items, totalCount] = await Promise.all([
          getAfterServices(PAGE_SIZE, 0, filterParams),
          getAfterServicesCount(filterParams),
        ]);
        return { items: items as AfterServiceType[], totalCount };
      }
      const items = await getAfterServices(
        PAGE_SIZE,
        pageParam as number,
        filterParams,
      );
      return { items: items as AfterServiceType[], totalCount: undefined };
    },
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.items.length < PAGE_SIZE) return undefined;
      return allPages.reduce((sum, page) => sum + page.items.length, 0);
    },
    initialPageParam: 0,
  });

  const afterServices = data?.pages.flatMap((p) => p.items) ?? [];
  const totalCount = data?.pages[0]?.totalCount;

  return {
    afterServices,
    isLoading: isPending,
    isLoadingMore: isFetchingNextPage,
    error: isError ? '데이터를 불러오는데 실패했습니다.' : '',
    loadMore: () => fetchNextPage(),
    hasMore: hasNextPage ?? false,
    totalCount,
  };
};
