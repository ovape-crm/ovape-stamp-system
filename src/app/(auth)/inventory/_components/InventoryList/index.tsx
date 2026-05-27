'use client';

import { useRouter } from 'next/navigation';
import Button from '@/app/_components/Button';
import Loading from '@/app/_components/Loading';
import {
  useInventories,
  InventoryFilters,
} from '@/app/_domains/_inventory/_hooks/useInventories';

interface InventoryListProps {
  filters?: InventoryFilters;
}

const InventoryList = ({ filters }: InventoryListProps) => {
  const router = useRouter();
  const { items, isLoading, isLoadingMore, error, loadMore, hasMore, totalCount } =
    useInventories(filters);

  if (isLoading) {
    return <Loading size="lg" text="재고 목록 불러오는 중..." />;
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
      <div className="flex justify-start items-center mb-3">
        <div className="text-xs sm:text-sm text-gray-600">
          <span className="font-semibold text-brand-600">{items.length}</span>
          {totalCount !== undefined && totalCount > 0 && (
            <>
              {' / '}
              <span className="font-semibold text-gray-600">{totalCount}</span>
            </>
          )}
        </div>
      </div>
      <div className="bg-white rounded-lg shadow-sm border border-brand-100 overflow-hidden overflow-x-auto">
        <table className="w-full min-w-[900px] divide-y divide-brand-100 table-auto">
          <thead className="bg-gradient-to-r from-brand-50 to-brand-100">
            <tr>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs sm:text-sm font-semibold text-brand-700 whitespace-nowrap">
                No
              </th>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs sm:text-sm font-semibold text-brand-700 whitespace-nowrap">
                작업
              </th>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-center text-xs sm:text-sm font-semibold text-brand-700 whitespace-nowrap">
                사용
              </th>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs sm:text-sm font-semibold text-brand-700 whitespace-nowrap">
                품목 종류
              </th>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs sm:text-sm font-semibold text-brand-700 whitespace-nowrap">
                품목 코드
              </th>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs sm:text-sm font-semibold text-brand-700 whitespace-nowrap">
                품목 명
              </th>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-center text-xs sm:text-sm font-semibold text-brand-700 whitespace-nowrap">
                현 재고
              </th>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs sm:text-sm font-semibold text-brand-700 whitespace-nowrap max-w-48">
                비고
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-brand-50">
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 sm:px-6 py-10 text-center text-gray-500 text-xs sm:text-sm"
                >
                  재고 데이터가 없습니다.
                </td>
              </tr>
            ) : (
              items.map((item, index) => (
                <tr
                  key={`${item.id}-${index}`}
                  className="hover:bg-brand-50/50 transition-colors"
                >
                  <td className="px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm text-gray-700 whitespace-nowrap">
                    {index + 1}
                  </td>
                  <td className="px-3 sm:px-6 py-2 sm:py-3 whitespace-nowrap">
                    <Button
                      size="xs"
                      variant="gray"
                      onClick={() => router.push(`/inventory/${item.id}`)}
                    >
                      상세
                    </Button>
                  </td>
                  <td className="px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm text-center whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] sm:text-xs font-medium ${
                        item.is_use
                          ? 'bg-brand-100 text-brand-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {item.is_use ? '사용' : '미사용'}
                    </span>
                  </td>
                  <td className="px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm whitespace-nowrap">
                    {item.item_categories ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-brand-50 text-brand-700 text-[11px] sm:text-xs font-medium">
                        {item.item_categories.name}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm text-gray-700 whitespace-nowrap font-mono">
                    {item.item_code}
                  </td>
                  <td className="px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm text-gray-900 whitespace-nowrap font-medium">
                    {item.item_name}
                  </td>
                  <td className="px-3 sm:px-6 py-2 sm:py-3 text-center whitespace-nowrap">
                    <span className="inline-flex items-center justify-center px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs sm:text-sm font-semibold bg-brand-100 text-brand-700">
                      {item.inventory_quantity}
                    </span>
                  </td>
                  <td className="px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm text-gray-700 max-w-48">
                    <p className="truncate" title={item.note || ''}>
                      {item.note || <span className="text-gray-400">-</span>}
                    </p>
                  </td>
                </tr>
              ))
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

export default InventoryList;
