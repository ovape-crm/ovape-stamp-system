import { useState, useEffect, useCallback } from 'react';
import { getCustomerById } from '@/services/customerService';
import { CustomerType } from '@/app/_types/customer.types';

export const useCustomer = (id: string) => {
  const [customer, setCustomer] = useState<CustomerType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchCustomer = useCallback(async () => {
    try {
      setIsLoading(true);
      setError('');

      const data = await getCustomerById(id);
      setCustomer(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setCustomer(null);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      fetchCustomer();
    }
  }, [id, fetchCustomer]);

  return {
    customer,
    isLoading,
    error,
    refresh: fetchCustomer,
  };
};
