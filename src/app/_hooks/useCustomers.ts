import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  getCustomers,
  Customer,
  SearchParams,
} from '@/services/customerService';

export const useCustomers = (initialParams?: SearchParams) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchParams, setSearchParams] = useState<SearchParams>(
    initialParams || {}
  );

  const hasQuery = useMemo(
    () => !!searchParams.keyword && searchParams.keyword.trim().length > 0,
    [searchParams.keyword]
  );

  const fetchCustomers = useCallback(async () => {
    try {
      setIsLoading(true);
      setError('');

      const data = await getCustomers(searchParams);
      setCustomers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setCustomers([]);
    } finally {
      setIsLoading(false);
    }
  }, [searchParams]);

  useEffect(() => {
    if (hasQuery) {
      fetchCustomers();
    } else {
      // Reset state when no query; don't fetch
      setCustomers([]);
      setError('');
      setIsLoading(false);
    }
  }, [fetchCustomers, hasQuery]);

  const search = (target: string, keyword: string) => {
    setSearchParams({ target: target as SearchParams['target'], keyword });
  };

  const refresh = () => {
    if (hasQuery) fetchCustomers();
  };

  return {
    customers,
    isLoading,
    error,
    search,
    refresh,
    hasQuery,
  };
};
