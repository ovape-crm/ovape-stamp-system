"use client";

import { formatPhoneNumber } from "@/app/_utils/utils";

export default function TargetCustomerCard({
  name,
  phone,
  address,
  note,
  className = "",
  label = "대상 고객",
  compact = false,
}: {
  name: string;
  phone: string;
  address?: string | null;
  note?: string | null;
  className?: string;
  label?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`overflow-hidden rounded-xl border border-gray-200 bg-white ${className}`}
    >
      <div className="grid sm:grid-cols-[140px_minmax(0,1fr)] sm:items-stretch">
        <div
          className={`flex min-w-0 flex-col items-center justify-center border-b border-gray-200 bg-gray-50 px-4 text-center sm:border-b-0 sm:border-r ${
            compact ? "py-2" : "py-4"
          }`}
        >
          <div
            className={`${compact ? "mb-2" : "mb-3"} flex items-center justify-center gap-2`}
          >
            <div className="h-2 w-2 rounded-full bg-brand-500" />
            <span className="text-sm font-medium text-gray-700">{label}</span>
          </div>
          <p className="block w-full min-w-0 truncate text-lg font-semibold text-gray-900">
            {name}
          </p>
          <p className="text-sm text-gray-600">{formatPhoneNumber(phone)}</p>
        </div>

        <div className="grid min-w-0 grid-rows-[repeat(2,minmax(0,1fr))] bg-white">
          <div className="grid min-w-0 grid-cols-[72px_minmax(0,1fr)] border-b border-gray-200">
            <p
              className={`flex items-center justify-center bg-gray-50 px-3 text-center text-xs font-semibold text-gray-600 ${compact ? "py-1" : "py-2"}`}
            >
              주소지
            </p>
            <p
              className={`flex min-w-0 items-center whitespace-pre-wrap break-words [overflow-wrap:anywhere] border-l border-gray-200 px-3 text-left text-sm leading-5 text-gray-800 ${compact ? "py-1" : "py-2"}`}
            >
              {address?.trim() || "등록 없음"}
            </p>
          </div>
          <div className="grid min-w-0 grid-cols-[72px_minmax(0,1fr)]">
            <p
              className={`flex items-center justify-center bg-gray-50 px-3 text-center text-xs font-semibold text-gray-600 ${compact ? "py-1" : "py-2"}`}
            >
              특이사항
            </p>
            <p
              className={`flex min-w-0 items-center whitespace-pre-wrap break-words [overflow-wrap:anywhere] border-l border-gray-200 px-3 text-left text-sm leading-5 text-gray-800 ${compact ? "py-1" : "py-2"}`}
            >
              {note?.trim() || "등록 없음"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
