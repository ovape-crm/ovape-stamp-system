import { useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  getCustomers,
  getCustomersCount,
  SearchParams,
} from "@/app/_domains/_customer/_services/customerService";
import { CustomerType } from "@/app/_domains/_customer/_types/customer.types";
import { customerKeys } from "@/app/_domains/_customer/_queryKeys/customerKeys";

const PAGE_SIZE = 5;

export const useCustomers = (initialParams?: SearchParams) => {
  const [searchParams, setSearchParams] = useState<SearchParams>(
    initialParams || {},
  );
  const [sortBy, setSortBy] = useState<
    "recent_usage" | "name" | "stamp" | "created_at" | "all"
  >("recent_usage");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

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
        if (sortBy === "recent_usage") {
          const recentCustomers = await getCustomers(30, 0, paramsWithSort);
          return {
            items: recentCustomers.slice(0, PAGE_SIZE) as CustomerType[],
            totalCount: recentCustomers.length,
          };
        }
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
      const previousCustomerIds = new Set(
        allPages
          .slice(0, -1)
          .flatMap((page) => page.items.map((customer) => String(customer.id))),
      );
      const hasNewCustomer = lastPage.items.some(
        (customer) => !previousCustomerIds.has(String(customer.id)),
      );
      if (allPages.length > 1 && !hasNewCustomer) return undefined;

      const loadedCount = allPages.reduce(
        (sum, page) => sum + page.items.length,
        0,
      );
      const totalCount = allPages[0]?.totalCount;
      if (totalCount !== undefined && loadedCount >= totalCount)
        return undefined;
      if (lastPage.items.length < PAGE_SIZE) return undefined;
      return loadedCount;
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
    setSearchParams({ target: target as SearchParams["target"], keyword });
    if (keyword.trim()) {
      setSortBy("all");
      setSortOrder("desc");
    }
  };

  const setSort = (
    by: "recent_usage" | "name" | "stamp" | "created_at" | "all",
  ) => {
    setSortBy(by);
    setSortOrder(by === "name" ? "asc" : "desc");
  };

  return {
    customers,
    isLoading: isPending,
    isLoadingMore: isFetchingNextPage,
    error: isError ? "데이터를 불러오는데 실패했습니다." : "",
    search,
    loadMore: () => fetchNextPage(),
    hasMore: hasNextPage ?? false,
    totalCount,
    sortBy,
    sortOrder,
    setSort,
  };
};
