import { useEffect, useState, useCallback, useRef } from 'react';
import { LogsResType } from '../_types/log.types';
import { getLogs } from '@/app/_services/logService';
import toast from 'react-hot-toast';
import { LogCategoryEnum, LogCategoryEnumType } from '../_enums/enums';

const useLogs = (
  pageSize = 10,
  category: LogCategoryEnumType['value'] = LogCategoryEnum.STAMP.value,
  dateRange?: { start: string; end: string } | null,
) => {
  const [items, setItems] = useState<LogsResType[]>([]);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(true);

  const dateRangeRef = useRef(dateRange);
  dateRangeRef.current = dateRange;
  const categoryRef = useRef(category);
  categoryRef.current = category;

  const dateRangeKey = dateRange ? `${dateRange.start}_${dateRange.end}` : '';
  const prevDateRangeKeyRef = useRef(dateRangeKey);

  const fetchLogs = useCallback(
    async (currentOffset: number, isLoadMore = false) => {
      try {
        setIsLoading(true);
        setError('');
        const data = await getLogs(
          pageSize,
          currentOffset,
          categoryRef.current,
          dateRangeRef.current ?? undefined,
        );
        if (isLoadMore) {
          setItems((prev) => [...prev, ...data]);
        } else {
          setItems(data);
        }
        setHasMore(data.length === pageSize);
        setOffset(currentOffset + data.length);
        if (isLoadMore && data.length > 0) {
          toast.success(`${data.length}개 더 불러오기 성공!`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : '에러가 발생했습니다');
      } finally {
        setIsLoading(false);
      }
    },
    [pageSize],
  );

  // 더 불러오기
  const load = useCallback(() => {
    void fetchLogs(offset, true);
  }, [fetchLogs, offset]);

  // 초기 로드
  useEffect(() => {
    void fetchLogs(0);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // dateRange 변경 시 처음부터 다시 로드
  useEffect(() => {
    if (prevDateRangeKeyRef.current !== dateRangeKey) {
      prevDateRangeKeyRef.current = dateRangeKey;
      setOffset(0);
      setHasMore(true);
      void fetchLogs(0);
    }
  }, [dateRangeKey, fetchLogs]);

  return {
    items,
    setItems,
    isLoading,
    error,
    hasMore,
    load,
  };
};

export default useLogs;
