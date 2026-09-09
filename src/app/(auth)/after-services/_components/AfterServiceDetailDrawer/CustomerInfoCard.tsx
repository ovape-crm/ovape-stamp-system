'use client';

import { useRouter } from 'next/navigation';
import { formatPhoneNumber } from '@/app/_utils/utils';

interface CustomerInfoCardProps {
  customerId: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  serviceCaseType?: 'vendor_exchange' | 'store_product_as' | 'customer_as';
  supplierName?: string | null;
}

const CustomerInfoCard = ({
  customerId,
  customerName,
  customerPhone,
  serviceCaseType,
  supplierName,
}: CustomerInfoCardProps) => {
  const router = useRouter();

  const handleClick = () => {
    if (customerId) {
      router.push(`/customers/${customerId}`);
    }
  };

  const isCustomerlessService =
    serviceCaseType === 'vendor_exchange' || serviceCaseType === 'store_product_as';

  if (isCustomerlessService) {
    return (
      <div className="rounded-lg border-2 border-violet-200 bg-violet-50/40 p-3">
        <div className="mb-1.5 flex items-center justify-between">
          <h4 className="text-xs font-medium text-violet-700">업무 정보</h4>
          <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-violet-700">
            {serviceCaseType === 'vendor_exchange' ? '업체 불량교환' : '매장제품 A/S'}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-base font-semibold text-gray-900">
            {supplierName?.trim() || '거래처 미지정'}
          </span>
          <span className="text-xs text-gray-600">고객 연동 없이 처리하는 A/S 건입니다.</span>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={customerId ? handleClick : undefined}
      className={`p-3 rounded-lg border-2 transition-all ${
        customerId
          ? 'border-brand-200 hover:border-brand-300 hover:bg-brand-50/30 cursor-pointer bg-gradient-to-r from-brand-50/50 to-transparent'
          : 'border-gray-200 bg-gray-50/50'
      }`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <h4 className="text-xs font-medium text-gray-500">고객 정보</h4>
        {customerId && (
          <svg
            className="w-3.5 h-3.5 text-brand-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        )}
      </div>
      {customerId && customerName ? (
        <div className="flex flex-col gap-0.5">
          <span className="text-base font-semibold text-gray-900">
            {customerName}
          </span>
          <span className="text-xs text-gray-600">
            {customerPhone ? formatPhoneNumber(customerPhone) : '-'}
          </span>
        </div>
      ) : (
        <span className="text-xs text-gray-400">고객 정보 없음</span>
      )}
    </div>
  );
};

export default CustomerInfoCard;
