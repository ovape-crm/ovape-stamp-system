import { useQuery } from '@tanstack/react-query';
import { getCustomerById } from '@/app/_domains/_customer/_services/customerService';
import { CustomerType } from '@/app/_domains/_customer/_types/customer.types';
import { customerKeys } from '@/app/_domains/_customer/_queryKeys/customerKeys';

export const useCustomer = (id: string) => {
  const { data, isPending, isError } = useQuery({
    queryKey: customerKeys.detail(id),
    queryFn: () => getCustomerById(id) as Promise<CustomerType>,
    enabled: !!id,
  });

  return {
    customer: data ?? null,
    isLoading: !!id && isPending,
    error: isError ? '고객 정보를 불러오는데 실패했습니다.' : '',
  };
};
