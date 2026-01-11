import { useState, useEffect, useCallback } from 'react';
import {
  getCustomers,
  getCustomersCount,
  SearchParams,
} from '@/services/customerService';
import { CustomerType } from '@/app/_types/customer.types';

const PAGE_SIZE = 10;

export const useCustomers = (initialParams?: SearchParams) => {
  const [customers, setCustomers] = useState<CustomerType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [searchParams, setSearchParams] = useState<SearchParams>(
    initialParams || {}
  );
  const [sortBy, setSortBy] = useState<'name' | 'stamp' | 'created_at'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const fetchCustomers = useCallback(async () => {
    try {
      setIsLoading(true);
      setError('');
      setOffset(0);
      setHasMore(true);

      // 정렬 파라미터 추가
      const paramsWithSort = {
        ...searchParams,
        sortBy,
        sortOrder,
      };

      // 전체 갯수와 목록을 병렬로 가져오기
      const [data, count] = await Promise.all([
        getCustomers(PAGE_SIZE, 0, paramsWithSort),
        getCustomersCount(searchParams),
      ]);

      setCustomers(data);
      setTotalCount(count);
      setOffset(data.length);
      setHasMore(data.length === PAGE_SIZE);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setCustomers([]);
      setTotalCount(0);
      setOffset(0);
      setHasMore(false);
    } finally {
      setIsLoading(false);
    }
  }, [searchParams, sortBy, sortOrder]);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;

    try {
      setIsLoadingMore(true);
      const paramsWithSort = {
        ...searchParams,
        sortBy,
        sortOrder,
      };
      const data = await getCustomers(PAGE_SIZE, offset, paramsWithSort);
      setCustomers((prev) => [...prev, ...data]);
      setOffset((prev) => prev + data.length);
      setHasMore(data.length === PAGE_SIZE);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoadingMore(false);
    }
  }, [offset, hasMore, isLoadingMore, searchParams, sortBy, sortOrder]);

  useEffect(() => {
    // 항상 데이터 가져오기 (검색어가 없어도 초기 10개 표시)
    fetchCustomers();
  }, [fetchCustomers]);

  const search = (target: string, keyword: string) => {
    setSearchParams({ target: target as SearchParams['target'], keyword });
  };

  const refresh = () => {
    fetchCustomers();
  };

  const setSort = (by: 'name' | 'stamp' | 'created_at') => {
    setSortBy(by);
    // 가나다순은 asc, 나머지는 desc
    setSortOrder(by === 'name' ? 'asc' : 'desc');
  };

  return {
    customers,
    isLoading,
    isLoadingMore,
    error,
    search,
    refresh,
    loadMore,
    hasMore,
    totalCount,
    sortBy,
    sortOrder,
    setSort,
  };
};
