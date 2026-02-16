'use client';

import { useEffect } from 'react';
import Loading from '@/app/_components/Loading';
import Button from '@/app/_components/Button';
import { formatPhoneNumber } from '@/app/_utils/utils';
import { AfterServiceItemTypeEnum } from '@/app/_enums/enums';
import { ActionInfoLabel } from '@/app/(auth)/_components/HistoriesComponents';
import {
  useAfterServices,
  AfterServiceFilters,
} from '@/app/_hooks/useAfterServices';

interface AfterServiceListProps {
  refreshKey?: number;
  onRowClick?: (afterServiceId: string) => void;
  filters?: AfterServiceFilters;
}

const AfterServiceList = ({
  refreshKey,
  onRowClick,
  filters,
}: AfterServiceListProps) => {
  const {
    afterServices,
    isLoading,
    isLoadingMore,
    error,
    loadMore,
    hasMore,
    totalCount,
    refresh,
  } = useAfterServices(filters);

  useEffect(() => {
    if (refreshKey !== undefined && refreshKey > 0) {
      refresh();
    }
  }, [refreshKey]);

  if (isLoading) {
    return <Loading size="lg" text="AS 목록 불러오는 중..." />;
  }

  if (error) {
    return (
      <div className="flex justify-center items-center py-20">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  const getItemTypeInfo = (itemType: string) => {
    const itemTypeOption = Object.values(AfterServiceItemTypeEnum).find(
      (opt) => opt.value === itemType
    );
    return itemTypeOption || { name: itemType, value: itemType };
  };

  // 상태를 액션 형식으로 변환 (ActionInfoLabel과 일관성 유지)
  const getStatusAction = (status: string) => {
    return `after-service-${status}`;
  };

  return (
    <div className="mb-10">
      <div className="flex justify-start items-center mb-3">
        <div className="text-xs sm:text-sm text-gray-600">
          <span className="font-semibold text-brand-600">
            {afterServices.length}
          </span>

          {totalCount !== undefined && totalCount > 0 && (
            <>
              {' / '}
              <span className="font-semibold text-gray-600">{totalCount}</span>
            </>
          )}
        </div>
      </div>
      <div className="bg-white rounded-lg shadow-sm border border-brand-100 overflow-hidden overflow-x-auto">
        <table className="w-full min-w-[1100px] divide-y divide-brand-100 table-auto">
          <thead className="bg-gradient-to-r from-brand-50 to-brand-100">
            <tr>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs sm:text-sm font-semibold text-brand-700 whitespace-nowrap flex-shrink-0">
                No
              </th>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-center text-xs sm:text-sm font-semibold text-brand-700 whitespace-nowrap">
                상태
              </th>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs sm:text-sm font-semibold text-brand-700 whitespace-nowrap">
                기기 종류
              </th>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs sm:text-sm font-semibold text-brand-700 whitespace-nowrap">
                제품 이름 / 수량
              </th>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs sm:text-sm font-semibold text-brand-700 max-w-64 whitespace-nowrap">
                증상
              </th>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-center text-xs sm:text-sm font-semibold text-brand-700 whitespace-nowrap">
                재고처리
              </th>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs sm:text-sm font-semibold text-brand-700 max-w-48 whitespace-nowrap">
                고객 특이사항
              </th>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs sm:text-sm font-semibold text-brand-700 whitespace-nowrap">
                고객
              </th>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs sm:text-sm font-semibold text-brand-700 whitespace-nowrap">
                등록일
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-brand-50">
            {afterServices.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-3 sm:px-6 py-10 text-center text-gray-500 text-xs sm:text-sm"
                >
                  AS 데이터가 없습니다.
                </td>
              </tr>
            ) : (
              afterServices.map((as, index) => {
                const itemTypeInfo = getItemTypeInfo(as.item_type);
                const date = new Date(as.created_at);
                const year = String(date.getFullYear()).slice(-2);
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                const hour = String(date.getHours()).padStart(2, '0');
                const minute = String(date.getMinutes()).padStart(2, '0');
                const createdAt = `${year}.${month}.${day} ${hour}:${minute}`;

                return (
                  <tr
                    key={as.id}
                    className="hover:bg-brand-50/50 transition-colors cursor-pointer"
                    onClick={() => onRowClick?.(as.id)}
                  >
                    <td className="px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm text-gray-700 whitespace-nowrap">
                      {index + 1}
                    </td>
                    <td className="px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm text-center whitespace-nowrap">
                      <div className="inline-block scale-90 sm:scale-100 origin-center">
                        <ActionInfoLabel action={getStatusAction(as.status)} />
                      </div>
                    </td>
                    <td className="px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-md bg-gray-100 text-gray-700 text-[11px] sm:text-xs font-medium">
                        {itemTypeInfo.name}
                      </span>
                    </td>
                    <td className="px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm text-gray-700 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        <span>{as.item_name}</span>
                        <span className="text-gray-400">/</span>
                        <span className="font-medium">{as.quantity}개</span>
                      </div>
                    </td>
                    <td className="px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm text-gray-700 max-w-64">
                      <p className="truncate" title={as.symptom}>
                        {as.symptom}
                      </p>
                    </td>
                    <td className="px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm text-center whitespace-nowrap">
                      {as.is_loaner_device_issued == null ? (
                        <span className="text-gray-400">-</span>
                      ) : (
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] sm:text-xs font-medium ${
                            as.is_loaner_device_issued
                              ? 'bg-brand-100 text-brand-700'
                              : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {as.is_loaner_device_issued ? 'O' : 'X'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm text-gray-700 max-w-48">
                      <p className="truncate" title={as.customer_note || ''}>
                        {as.customer_note || '-'}
                      </p>
                    </td>
                    <td className="px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm whitespace-nowrap align-middle">
                      <div className="min-h-[40px] flex flex-col justify-center">
                        {as.customers ? (
                          <>
                            <p className="font-medium text-gray-900">
                              {as.customers.name}
                            </p>
                            <p className="text-[11px] sm:text-xs text-gray-600 whitespace-nowrap">
                              {formatPhoneNumber(as.customers.phone)}
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="font-medium text-gray-400">
                              고객 정보 없음
                            </p>
                            <p className="text-[11px] sm:text-xs text-gray-400 whitespace-nowrap">
                              -
                            </p>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm text-gray-700 whitespace-nowrap">
                      {createdAt}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {hasMore && (
        <div className="flex justify-center mt-6">
          <Button
            size="sm"
            onClick={loadMore}
            disabled={isLoadingMore}
            variant="secondary"
          >
            {isLoadingMore ? '불러오는 중...' : '더 불러오기'}
          </Button>
        </div>
      )}
    </div>
  );
};

export default AfterServiceList;
