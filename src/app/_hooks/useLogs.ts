import { useInfiniteQuery, useQueryClient, InfiniteData } from '@tanstack/react-query';
import { LogsResType } from '../_types/log.types';
import { getLogs } from '@/app/_services/logService';
import { LogCategoryEnum, LogCategoryEnumType } from '../_enums/enums';
import { logKeys } from '@/app/_queryKeys/logKeys';
import toast from 'react-hot-toast';

const useLogs = (
  pageSize = 10,
  category: LogCategoryEnumType['value'] = LogCategoryEnum.STAMP.value,
  dateRange?: { start: string; end: string } | null,
) => {
  const queryClient = useQueryClient();
  const queryKey = logKeys.list({ category, dateRange: dateRange ?? null });

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
      getLogs(pageSize, pageParam as number, category, dateRange ?? undefined),
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < pageSize) return undefined;
      return allPages.flat().length;
    },
    initialPageParam: 0,
  });

  const items = data?.pages.flat() ?? [];

  const updateItem = (
    id: string,
    updater: (item: LogsResType) => LogsResType,
  ) => {
    queryClient.setQueryData(
      queryKey,
      (old: InfiniteData<LogsResType[]> | undefined) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) =>
            page.map((item) => (item.id === id ? updater(item) : item)),
          ),
        };
      },
    );
  };

  const load = async () => {
    const result = await fetchNextPage();
    const newPage = result.data?.pages.at(-1) ?? [];
    if (newPage.length > 0) {
      toast.success(`${newPage.length}개 더 불러오기 성공!`);
    }
  };

  return {
    items,
    isLoading: isPending || isFetchingNextPage,
    error: isError ? '에러가 발생했습니다.' : '',
    hasMore: hasNextPage ?? false,
    load,
    updateItem,
  };
};

export default useLogs;
