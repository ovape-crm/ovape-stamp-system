import { useState, useEffect, useCallback } from 'react';
import { getLogsByCustomer } from '@/services/logService';
import { CustomersLogsResType } from '@/app/_types/log.types';
import { LogCategoryEnum, LogCategoryEnumType } from '../_enums/enums';

export const useLogsByCustomerId = (
  customerId: string,
  pageSize = 10,
  category: LogCategoryEnumType['value'] = LogCategoryEnum.STAMP.value
) => {
  const [logs, setLogs] = useState<CustomersLogsResType>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const fetchLogs = useCallback(async () => {
    try {
      setIsLoading(true);
      setError('');

      const data = await getLogsByCustomer(category, customerId, pageSize, 0);
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
  }, [customerId, pageSize, category]);

  const loadMore = useCallback(async (): Promise<number> => {
    try {
      setIsLoading(true);
      const more = await getLogsByCustomer(
        category,
        customerId,
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
  }, [customerId, pageSize, offset, category]);

  useEffect(() => {
    if (customerId) {
      fetchLogs();
    }
  }, [customerId, fetchLogs]);

  return {
    logs,
    isLoading,
    error,
    refresh: fetchLogs,
    loadMore,
    hasMore,
  };
};
