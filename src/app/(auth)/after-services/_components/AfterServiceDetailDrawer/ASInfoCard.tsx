'use client';

import { AfterServiceItemTypeEnum } from '@/app/_enums/enums';

interface ASInfoCardProps {
  itemType: string;
  itemName: string;
  quantity: number;
  createdAt: string;
  user?: {
    name: string;
    email: string;
  } | null;
}

const ASInfoCard = ({
  itemType,
  itemName,
  quantity,
  createdAt,
  user,
}: ASInfoCardProps) => {
  const getItemTypeInfo = (itemTypeValue: string) => {
    const itemTypeOption = Object.values(AfterServiceItemTypeEnum).find(
      (opt) => opt.value === itemTypeValue
    );
    return itemTypeOption || { name: itemTypeValue, value: itemTypeValue };
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const year = String(date.getFullYear()).slice(-2);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${year}.${month}.${day} ${hour}:${minute}`;
  };

  return (
    <div className="row-span-2 bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/30 rounded-xl p-5 border-2 border-slate-200 relative flex flex-col justify-between">
      <div>
        {/* 품목, 품명, 수량 - 모던한 디자인 */}
        <div className="mb-4">
          {/* 상단 태그 영역 */}
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-xs font-medium text-blue-700">
              {getItemTypeInfo(itemType).name}
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-xs font-medium text-slate-700">
              <svg
                className="w-3 h-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"
                />
              </svg>
              {quantity}개
            </span>
          </div>
          {/* 품명 - 크게 강조 */}
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-medium text-gray-500">제품명:</span>
            <h2 className="text-3xl font-bold text-gray-900 tracking-tight leading-tight">
              {itemName}
            </h2>
          </div>
        </div>
      </div>

      {/* 등록 정보 - 작고 예쁘게 */}
      <div className="pt-3 border-t border-gray-200/60 -mx-5 -mb-5 px-5 pb-3">
        <div className="flex items-center justify-end gap-4 text-xs text-gray-500">
          <div className="flex items-center gap-1.5">
            <svg
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <span>{formatDate(createdAt)}</span>
          </div>
          {user && (
            <div className="flex items-center gap-1.5">
              <svg
                className="w-3 h-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
              <span>{user.name || user.email}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ASInfoCard;
