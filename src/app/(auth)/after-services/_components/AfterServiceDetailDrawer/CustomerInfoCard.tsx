'use client';

import { useRouter } from 'next/navigation';
import { formatPhoneNumber } from '@/app/_utils/utils';

interface CustomerInfoCardProps {
  customerId: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  onClose: () => void;
}

const CustomerInfoCard = ({
  customerId,
  customerName,
  customerPhone,
  onClose,
}: CustomerInfoCardProps) => {
  const router = useRouter();

  return (
    <div
      onClick={() => {
        if (customerId) {
          router.push(`/customers/${customerId}`);
          onClose();
        }
      }}
      className={`p-3 rounded-lg border-2 transition-all ${
        customerId
          ? 'border-brand-200 hover:border-brand-300 hover:bg-brand-50/30 cursor-pointer bg-gradient-to-r from-brand-50/50 to-transparent'
          : 'border-gray-200'
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
      <div className="flex flex-col gap-0.5">
        <span className="text-base font-semibold text-gray-900">
          {customerName || '-'}
        </span>
        <span className="text-xs text-gray-600">
          {customerPhone ? formatPhoneNumber(customerPhone) : '-'}
        </span>
      </div>
    </div>
  );
};

export default CustomerInfoCard;
