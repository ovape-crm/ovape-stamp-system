import { useMemo, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
  getCustomers,
  getCustomersCount,
  SearchParams,
} from '@/app/_domains/_customer/_services/customerService';
import { CustomerType } from '@/app/_domains/_customer/_types/customer.types';
import { customerKeys } from '@/app/_domains/_customer/_queryKeys/customerKeys';

const PAGE_SIZE = 10;

export const useCustomers = (initialParams?: SearchParams) => {
  const [searchParams, setSearchParams] = useState<SearchParams>(
    initialParams || {},
  );
  const [sortBy, setSortBy] = useState<'name' | 'stamp' | 'created_at'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const queryKey = customerKeys.list({ ...searchParams, sortBy, sortOrder });

  const {
    data,
    isPending,
    isError,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam }) => {
      const paramsWithSort = { ...searchParams, sortBy, sortOrder };
      if (pageParam === 0) {
        const [items, totalCount] = await Promise.all([
          getCustomers(PAGE_SIZE, 0, paramsWithSort),
          getCustomersCount(searchParams),
        ]);
        return { items: items as CustomerType[], totalCount };
      }
      const items = await getCustomers(
        PAGE_SIZE,
        pageParam as number,
        paramsWithSort,
      );
      return { items: items as CustomerType[], totalCount: undefined };
    },
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.items.length < PAGE_SIZE) return undefined;
      return allPages.reduce((sum, page) => sum + page.items.length, 0);
    },
    initialPageParam: 0,
  });

  const customers = useMemo(() => {
    const uniqueCustomers = new Map<string, CustomerType>();
    data?.pages.forEach((page) => {
      page.items.forEach((customer) => {
        uniqueCustomers.set(String(customer.id), customer);
      });
    });
    return Array.from(uniqueCustomers.values());
  }, [data?.pages]);
  const totalCount = data?.pages[0]?.totalCount ?? 0;

  const search = (target: string, keyword: string) => {
    setSearchParams({ target: target as SearchParams['target'], keyword });
  };

  const setSort = (by: 'name' | 'stamp' | 'created_at') => {
    setSortBy(by);
    setSortOrder(by === 'name' ? 'asc' : 'desc');
  };

  return {
    customers,
    isLoading: isPending,
    isLoadingMore: isFetchingNextPage,
    error: isError ? '데이터를 불러오는데 실패했습니다.' : '',
    search,
    loadMore: () => fetchNextPage(),
    hasMore: hasNextPage ?? false,
    totalCount,
    sortBy,
    sortOrder,
    setSort,
  };
};
