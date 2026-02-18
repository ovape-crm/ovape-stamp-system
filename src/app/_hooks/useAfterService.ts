import { useState, useEffect, useCallback } from 'react';
import { getAfterServiceDetail } from '@/app/_services/afterService';

type AfterServiceDetailType = {
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
  updated_at?: string;
  users: {
    name: string;
    email: string;
  } | null;
  customers: {
    name: string;
    phone: string;
  } | null;
};

export const useAfterService = (id: string | null) => {
  const [afterService, setAfterService] =
    useState<AfterServiceDetailType | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchAfterService = useCallback(async () => {
    if (!id) {
      setAfterService(null);
      setError('');
      return;
    }

    try {
      setIsLoading(true);
      setError('');
      const data = await getAfterServiceDetail(id);
      setAfterService(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'AS 상세 정보를 불러오는데 실패했습니다.',
      );
      setAfterService(null);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchAfterService();
  }, [fetchAfterService]);

  return {
    afterService,
    isLoading,
    error,
    refresh: fetchAfterService,
  };
};
