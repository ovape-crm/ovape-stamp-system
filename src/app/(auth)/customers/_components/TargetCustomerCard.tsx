'use client';

import { formatPhoneNumber } from '@/app/_utils/utils';

export default function TargetCustomerCard({
  name,
  phone,
  address,
  note,
  className = '',
  label = '대상 고객',
}: {
  name: string;
  phone: string;
  address?: string | null;
  note?: string | null;
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-xl border border-gray-200 bg-white ${className}`}
    >
      <div className="grid sm:grid-cols-[140px_minmax(0,1fr)] sm:items-stretch">
        <div className="flex min-w-0 flex-col justify-center border-b border-gray-200 bg-gray-50 px-4 py-4 sm:border-b-0 sm:border-r">
          <div className="mb-3 flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-brand-500" />
            <span className="text-sm font-medium text-gray-700">{label}</span>
          </div>
          <p className="truncate text-lg font-semibold text-gray-900">{name}</p>
          <p className="text-sm text-gray-600">{formatPhoneNumber(phone)}</p>
        </div>

        <div className="grid min-w-0 grid-rows-2 bg-white">
          <div className="grid min-w-0 grid-cols-[72px_minmax(0,1fr)] border-b border-gray-200">
            <p className="flex items-center bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">
              주소지
            </p>
            <p className="whitespace-pre-wrap break-words border-l border-gray-200 px-3 py-2 text-sm text-gray-800">
              {address?.trim() || "등록 없음"}
            </p>
          </div>
          <div className="grid min-w-0 grid-cols-[72px_minmax(0,1fr)]">
            <p className="flex items-center bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">
              특이사항
            </p>
            <p className="whitespace-pre-wrap break-words border-l border-gray-200 px-3 py-2 text-sm text-gray-800">
              {note?.trim() || "등록 없음"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
