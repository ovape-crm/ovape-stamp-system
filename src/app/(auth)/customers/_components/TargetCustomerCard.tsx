'use client';

import { formatPhoneNumber } from '@/app/_utils/utils';

export default function TargetCustomerCard({
  name,
  phone,
  note,
  className = '',
}: {
  name: string;
  phone: string;
  note?: string | null;
  className?: string;
}) {
  return (
    <div className={`bg-gray-100 rounded-lg p-4 ${className}`}>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-2 bg-brand-500 rounded-full" />
        <span className="text-sm font-medium text-gray-700">대상 고객</span>
      </div>
      <p className="text-lg font-semibold text-gray-900">{name}</p>
      <p className="text-sm text-gray-600">{formatPhoneNumber(phone)}</p>
      {note && (
        <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">
          <span className="font-medium text-gray-600">특이사항: </span>
          {note}
        </p>
      )}
    </div>
  );
}
