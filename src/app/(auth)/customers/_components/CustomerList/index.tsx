'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CustomerType } from '@/app/_domains/_customer/_types/customer.types';
import Loading from '@/app/_components/Loading';
import Button from '@/app/_components/Button';
import { formatPhoneNumber } from '@/app/_utils/utils';


interface CustomerListProps {
  customers: CustomerType[];
  isLoading: boolean;
  error: string;
  onUpdate: () => void;
  loadMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  totalCount?: number;
  sortBy?: 'name' | 'stamp' | 'created_at';
  sortOrder?: 'asc' | 'desc';
  onSortChange?: (sortBy: 'name' | 'stamp' | 'created_at') => void;
}

const CustomerList = ({
  customers,
  isLoading,
  error,
  loadMore,
  hasMore,
  isLoadingMore,
  totalCount,
  sortBy,
  onSortChange,
}: CustomerListProps) => {
  const router = useRouter();
  const [loadingCustomerId, setLoadingCustomerId] = useState<string | null>(
    null,
  );
  if (isLoading) {
    return <Loading size="lg" text="고객 목록 불러오는 중..." />;
  }

  if (error) {
    return (
      <div className="flex justify-center items-center py-20">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="mb-10">
      <div className="flex justify-start items-center gap-3 mb-3">
        <div className="text-xs sm:text-sm text-gray-600">
          <span className="font-semibold text-brand-600">
            {customers.length}
          </span>

          {totalCount !== undefined && totalCount > 0 && (
            <>
              {' / '}
              <span className="font-semibold text-gray-600">{totalCount}</span>
            </>
          )}
        </div>
        {onSortChange && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onSortChange('name')}
              className={`whitespace-nowrap px-2 py-1 text-xs rounded border transition-colors cursor-pointer ${
                sortBy === 'name'
                  ? 'bg-brand-100 border-brand-300 text-brand-700 font-medium'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              가나다순
            </button>
            <button
              onClick={() => onSortChange('stamp')}
              className={`whitespace-nowrap px-2 py-1 text-xs rounded border transition-colors cursor-pointer ${
                sortBy === 'stamp'
                  ? 'bg-brand-100 border-brand-300 text-brand-700 font-medium'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              스탬프 많은 순
            </button>
            <button
              onClick={() => onSortChange('created_at')}
              className={`whitespace-nowrap px-2 py-1 text-xs rounded border transition-colors cursor-pointer ${
                sortBy === 'created_at'
                  ? 'bg-brand-100 border-brand-300 text-brand-700 font-medium'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              등록일 순
            </button>
          </div>
        )}
      </div>
      <div className="bg-white rounded-lg shadow-sm border border-brand-100 overflow-hidden overflow-x-auto">
        <table className="w-full min-w-[840px] divide-y divide-brand-100 table-auto">
          <thead className="bg-gradient-to-r from-brand-50 to-brand-100">
            <tr>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs sm:text-sm font-semibold text-brand-700 whitespace-nowrap">
                No
              </th>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs sm:text-sm font-semibold text-brand-700 whitespace-nowrap">
                이름
              </th>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs sm:text-sm font-semibold text-brand-700 whitespace-nowrap">
                전화번호
              </th>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs sm:text-sm font-semibold text-brand-700 whitespace-nowrap">
                성별
              </th>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-center text-xs sm:text-sm font-semibold text-brand-700 whitespace-nowrap">
                스탬프
              </th>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-center text-xs sm:text-sm font-semibold text-brand-700 whitespace-nowrap">
                작업
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-brand-50">
            {customers.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 sm:px-6 py-10 text-center text-gray-500 text-xs sm:text-sm"
                >
                  고객 데이터가 없습니다.
                </td>
              </tr>
            ) : (
              customers.map((customer, index) => {
                const stampCount = customer.stamps?.[0]?.count || 0;
                const isThisLoading = loadingCustomerId === customer.id;

                return (
                  <tr
                    key={customer.id}
                    className="hover:bg-brand-50/50 transition-colors"
                  >
                    <td className="px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm text-gray-700 whitespace-nowrap">
                      {index + 1}
                    </td>
                    <td className="px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm font-medium text-gray-900 whitespace-nowrap">
                      {customer.name}
                    </td>
                    <td className="px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm text-gray-700 whitespace-nowrap">
                      {formatPhoneNumber(customer?.phone)}
                    </td>
                    <td className="px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm text-gray-700 whitespace-nowrap">
                      {customer.gender === 'male'
                        ? '남자'
                        : customer.gender === 'female'
                          ? '여자'
                          : '-'}
                    </td>
                    <td className="px-3 sm:px-6 py-2 sm:py-3 text-center whitespace-nowrap">
                      <span className="inline-flex items-center justify-center px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs sm:text-sm font-semibold bg-brand-100 text-brand-700">
                        {stampCount}
                      </span>
                    </td>
                    <td className="px-3 sm:px-6 py-2 sm:py-3 whitespace-nowrap">
                      <div className="flex items-center justify-center">
                        <Button
                          onClick={() =>
                            router.push(`/customers/${customer.id}`)
                          }
                          disabled={isThisLoading}
                          size="sm"
                          variant="secondary"
                        >
                          상세
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {hasMore && loadMore && (
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

export default CustomerList;
