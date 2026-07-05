'use client';

import Button from '@/app/_components/Button';
import Loading from '@/app/_components/Loading';
import {
  useManuals,
  ManualFilters,
} from '@/app/_domains/_manual/_hooks/useManuals';
import { ManualType } from '@/app/_domains/_manual/_types/manual.types';

interface ManualListProps {
  filters?: ManualFilters;
  isAdmin?: boolean;
  onView?: (manual: ManualType) => void;
  onEdit?: (manual: ManualType) => void;
  onDelete?: (manual: ManualType) => void;
}

const ManualList = ({
  filters,
  isAdmin = false,
  onView,
  onEdit,
  onDelete,
}: ManualListProps) => {
  const {
    manuals,
    isLoading,
    isLoadingMore,
    error,
    loadMore,
    hasMore,
    totalCount,
  } = useManuals(filters);

  if (isLoading) {
    return <Loading size="lg" text="매뉴얼 목록 불러오는 중..." />;
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
          <span className="font-semibold text-brand-600">{manuals.length}</span>
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
              {isAdmin && (
                <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs sm:text-sm font-semibold text-brand-700 whitespace-nowrap">
                  작업
                </th>
              )}
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs sm:text-sm font-semibold text-brand-700 whitespace-nowrap">
                상위 카테고리
              </th>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs sm:text-sm font-semibold text-brand-700 whitespace-nowrap">
                하위 카테고리
              </th>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs sm:text-sm font-semibold text-brand-700 whitespace-nowrap">
                제목
              </th>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs sm:text-sm font-semibold text-brand-700 whitespace-nowrap max-w-xs">
                내용
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-brand-50">
            {manuals.length === 0 ? (
              <tr>
                <td
                  colSpan={isAdmin ? 6 : 5}
                  className="px-3 sm:px-6 py-10 text-center text-gray-500 text-xs sm:text-sm"
                >
                  매뉴얼 데이터가 없습니다.
                </td>
              </tr>
            ) : (
              manuals.map((manual, index) => (
                <tr
                  key={manual.id}
                  className="hover:bg-brand-50/50 transition-colors cursor-pointer"
                  onClick={() => onView?.(manual)}
                >
                  <td className="px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm text-gray-700 whitespace-nowrap">
                    {index + 1}
                  </td>
                  {isAdmin && (
                    <td
                      className="px-3 sm:px-6 py-2 sm:py-3 whitespace-nowrap space-x-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button size="xs" variant="gray" onClick={() => onEdit?.(manual)}>
                        수정
                      </Button>
                      <Button size="xs" variant="danger" onClick={() => onDelete?.(manual)}>
                        삭제
                      </Button>
                    </td>
                  )}
                  <td className="px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm whitespace-nowrap">
                    {manual.manual_sub_categories?.manual_top_categories ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-brand-50 text-brand-700 text-[11px] sm:text-xs font-medium">
                        {manual.manual_sub_categories.manual_top_categories.name}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm whitespace-nowrap">
                    {manual.manual_sub_categories ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-gray-100 text-gray-600 text-[11px] sm:text-xs font-medium">
                        {manual.manual_sub_categories.name}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm text-gray-900 whitespace-nowrap font-medium">
                    {manual.title}
                  </td>
                  <td className="px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm text-gray-700 max-w-xs">
                    <p className="truncate">{manual.content}</p>
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

export default ManualList;
