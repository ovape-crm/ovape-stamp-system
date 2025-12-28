import { useCallback, useEffect, useState } from 'react';
import { AfterServiceLogsResType } from '../_types/log.types';
import { getLogsByAfterServiceId } from '@/services/logService';

export const useLogsByAfterServiceId = (
  afterServiceId: number,
  pageSize = 10
) => {
  const [logs, setLogs] = useState<AfterServiceLogsResType>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const fetchLogs = useCallback(async () => {
    try {
      setIsLoading(true);
      setError('');

      const data = await getLogsByAfterServiceId(afterServiceId, pageSize, 0);
      setLogs(data);
      setOffset(data.length);
      setHasMore(data.length === pageSize);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLogs([]);
      setOffset(0);
      setHasMore(false);
    } finally {
      setIsLoading(false);
    }
  }, [afterServiceId, pageSize]);

  const loadMore = useCallback(async (): Promise<number> => {
    try {
      setIsLoading(true);
      const more = await getLogsByAfterServiceId(
        afterServiceId,
        pageSize,
        offset
      );
      setLogs((prev) => [...prev, ...more]);
      setOffset((prev) => prev + more.length);
      setHasMore(more.length === pageSize);
      return more.length;
    } finally {
      setIsLoading(false);
    }
  }, [afterServiceId, pageSize, offset]);

  useEffect(() => {
    if (afterServiceId) {
      fetchLogs();
    }
  }, [afterServiceId, fetchLogs]);

  return {
    logs,
    isLoading,
    error,
    refresh: fetchLogs,
    loadMore,
    hasMore,
  };
};
