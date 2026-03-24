import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { AfterServiceLogsResType } from '../_types/log.types';
import { getLogsByAfterServiceId } from '@/app/_services/logService';
import { logKeys } from '@/app/_queryKeys/logKeys';

export const useLogsByAfterServiceId = (
  afterServiceId: number,
  pageSize = 10,
) => {
  const queryClient = useQueryClient();
  const queryKey = logKeys.byAfterService(afterServiceId);

  const {
    data,
    isPending,
    isError,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      getLogsByAfterServiceId(
        afterServiceId,
        pageSize,
        pageParam as number,
      ) as Promise<AfterServiceLogsResType>,
    getNextPageParam: (lastPage, allPages) => {
      if ((lastPage as unknown[]).length < pageSize) return undefined;
      return allPages.flat().length;
    },
    initialPageParam: 0,
    enabled: !!afterServiceId,
  });

  const logs = (data?.pages.flat() ?? []) as AfterServiceLogsResType;

  return {
    logs,
    isLoading: isPending,
    isLoadingMore: isFetchingNextPage,
    error: isError ? 'An error occurred' : '',
    hasMore: hasNextPage ?? false,
    loadMore: () => fetchNextPage(),
    refresh: () => queryClient.invalidateQueries({ queryKey }),
  };
};
