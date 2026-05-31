import { useInfiniteQuery, useQueryClient, InfiniteData } from '@tanstack/react-query';
import { getLogsByCustomer } from '@/app/_domains/_log/_services/logService';
import { CustomersLogsResType } from '@/app/_domains/_log/_types/log.types';
import { LogCategoryEnum, LogCategoryEnumType } from '@/app/_enums/enums';
import { logKeys } from '@/app/_domains/_log/_queryKeys/logKeys';

export const useLogsByCustomerId = (
  customerId: string,
  pageSize = 10,
  category: LogCategoryEnumType['value'] = LogCategoryEnum.STAMP.value,
) => {
  const queryClient = useQueryClient();
  const queryKey = logKeys.byCustomer(customerId, category);

  const {
    data,
    isPending,
    isError,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      getLogsByCustomer(
        category,
        customerId,
        pageSize,
        pageParam as number,
      ) as Promise<CustomersLogsResType>,
    getNextPageParam: (lastPage, allPages) => {
      if ((lastPage as unknown[]).length < pageSize) return undefined;
      return allPages.flat().length;
    },
    initialPageParam: 0,
    enabled: !!customerId,
  });

  const logs = (data?.pages.flat() ?? []) as CustomersLogsResType;

  const loadMore = async (): Promise<number> => {
    const result = await fetchNextPage();
    const newPage = result.data?.pages.at(-1) ?? [];
    return (newPage as unknown[]).length;
  };

  const removeItem = (id: string) => {
    queryClient.setQueryData(
      queryKey,
      (old: InfiniteData<CustomersLogsResType> | undefined) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) =>
            (page as CustomersLogsResType).filter((item) => item.id !== id),
          ),
        };
      },
    );
  };

  const updateItem = (
    id: string,
    updater: (
      item: CustomersLogsResType[number],
    ) => CustomersLogsResType[number],
  ) => {
    queryClient.setQueryData(
      queryKey,
      (old: InfiniteData<CustomersLogsResType> | undefined) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) =>
            (page as CustomersLogsResType).map((item) =>
              item.id === id ? updater(item) : item,
            ),
          ),
        };
      },
    );
  };

  return {
    logs,
    isLoading: isPending,
    error: isError ? 'An error occurred' : '',
    hasMore: hasNextPage ?? false,
    loadMore,
    refresh: () => queryClient.invalidateQueries({ queryKey }),
    removeItem,
    updateItem,
  };
};
