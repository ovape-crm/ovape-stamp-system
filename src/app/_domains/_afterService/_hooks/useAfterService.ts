import { useQuery } from '@tanstack/react-query';
import { getAfterServiceDetail } from '@/app/_domains/_afterService/_services/afterService';
import { afterServiceKeys } from '@/app/_domains/_afterService/_queryKeys/afterServiceKeys';

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
  customer_purchase_date?: string | null;
  customer_received_date?: string | null;
  supplier_name?: string | null;
  has_after_service_cost?: boolean;
  after_service_payment_method?: 'card' | 'transfer' | 'cash' | null;
  after_service_cost_amount?: number | null;
  after_service_cost_memo?: string | null;
  is_rental_issued?: boolean;
  rental_date?: string | null;
  rental_note?: string | null;
  is_exchange_issued?: boolean;
  exchange_date?: string | null;
  exchange_item_id?: string | null;
  exchange_item_name?: string | null;
  exchange_item_category_name?: string | null;
  exchange_quantity?: number | null;
  exchange_note?: string | null;
  repair_receipt_order_id?: string | null;
  repair_receipt_id?: string | null;
  repair_receipt_item_name?: string | null;
  repair_receipt_quantity?: number | null;
  repair_receipt_match_type?: 'match' | 'mismatch' | null;
  repair_receipt_note?: string | null;
  repair_receipt_arrived_on?: string | null;
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
  const { data, isPending, isError } = useQuery({
    queryKey: afterServiceKeys.detail(id),
    queryFn: () => getAfterServiceDetail(id!),
    enabled: !!id,
  });

  return {
    afterService: (data as AfterServiceDetailType | undefined) ?? null,
    isLoading: !!id && isPending,
    error: isError ? 'AS 상세 정보를 불러오는데 실패했습니다.' : '',
  };
};
