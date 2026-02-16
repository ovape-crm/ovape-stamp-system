import { useState, useEffect, useCallback } from 'react';
import {
  getAfterServices,
  getAfterServicesCount,
} from '@/services/afterService';
import { AfterServiceStatusEnumType } from '@/app/_enums/enums';

const PAGE_SIZE = 10;

export type AfterServiceFilters = {
  status?: string;
  groupStatus?: 'received' | 'inProgress' | 'completed';
  searchTarget?: string;
  searchKeyword?: string;
};

type AfterServiceType = {
  id: string;
  customer_id: string;
  item_type: string;
  item_name: string;
  quantity: number;
  symptom: string;
  shop_note?: string | null;
  customer_note?: string | null;
  is_loaner_device_issued?: boolean;
  status: string;
  created_at: string;
  users: {
    name: string;
    email: string;
  } | null;
  customers: {
    name: string;
    phone: string;
  } | null;
};

const buildFilterParams = (filters?: AfterServiceFilters) => ({
  status:
    filters?.status && filters.status !== 'all'
      ? (filters.status as AfterServiceStatusEnumType['value'])
      : undefined,
  groupStatus: filters?.groupStatus,
  searchTarget: filters?.searchTarget as
    | 'name'
    | 'phone'
    | 'item_name'
    | undefined,
  searchKeyword: filters?.searchKeyword,
});

export const useAfterServices = (filters?: AfterServiceFilters) => {
  const [afterServices, setAfterServices] = useState<AfterServiceType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState<number | undefined>(undefined);

  const fetchAfterServices = useCallback(async () => {
    try {
      setIsLoading(true);
      setError('');
      setOffset(0);
      setHasMore(true);

      const filterParams = buildFilterParams(filters);

      const [data, count] = await Promise.all([
        getAfterServices(PAGE_SIZE, 0, filterParams),
        getAfterServicesCount(filterParams),
      ]);

      setAfterServices(data);
      setTotalCount(count);
      setOffset(data.length);
      setHasMore(data.length === PAGE_SIZE);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setAfterServices([]);
      setTotalCount(undefined);
      setOffset(0);
      setHasMore(false);
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;

    try {
      setIsLoadingMore(true);
      const filterParams = buildFilterParams(filters);
      const data = await getAfterServices(PAGE_SIZE, offset, filterParams);
      setAfterServices((prev) => [...prev, ...data]);
      setOffset((prev) => prev + data.length);
      setHasMore(data.length === PAGE_SIZE);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoadingMore(false);
    }
  }, [offset, hasMore, isLoadingMore, filters]);

  useEffect(() => {
    fetchAfterServices();
  }, [fetchAfterServices]);

  return {
    afterServices,
    isLoading,
    isLoadingMore,
    error,
    loadMore,
    hasMore,
    totalCount,
    refresh: fetchAfterServices,
  };
};
