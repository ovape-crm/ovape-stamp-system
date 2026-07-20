'use client';

import Button from '@/app/_components/Button';
import Loading from '@/app/_components/Loading';
import {
  useItems,
  ItemFilters,
} from '@/app/_domains/_item/_hooks/useItems';
import { ItemType } from '@/app/_domains/_item/_types/item.types';
import { useModal } from '@/app/_contexts/ModalContext';
import CategoryManageModal from '../CategoryManageModal';
import ItemDetailModal from '../ItemDetailModal';

interface ItemListProps {
  filters?: ItemFilters;
  isAdmin?: boolean;
  onEdit?: (item: ItemType) => void;
  onDelete?: (item: ItemType) => void;
}

const ItemList = ({ filters, isAdmin = false, onEdit, onDelete }: ItemListProps) => {
  const { items, isLoading, isLoadingMore, error, loadMore, hasMore, totalCount } =
    useItems(filters);
  const { open, close } = useModal();

  const openCategoryManage = () => {
    open({
      content: (
        <CategoryManageModal onClose={close} />
      ),
      options: { dismissOnBackdrop: false, dismissOnEsc: true },
    });
  };

  if (isLoading) {
    return <Loading size="lg" text="품목 목록 불러오는 중..." />;
  }

  if (error) {
    return (
      <div className="flex justify-center items-center py-20">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex shrink-0 items-center justify-start">
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
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-brand-100 bg-white shadow-sm">
        <table className="w-full min-w-[1000px] divide-y divide-brand-100 table-auto">
          <thead className="sticky top-0 z-10 bg-gradient-to-r from-brand-50 to-brand-100">
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
                <div className="flex items-center gap-1.5">
                  <span>품목 종류</span>
                  {isAdmin && (
                    <button
                      onClick={openCategoryManage}
                      title="카테고리 관리"
                      className="text-gray-400 hover:text-gray-600 cursor-pointer transition-all hover:rotate-45 translate-y-[1px]"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="w-3.5 h-3.5 sm:w-4 sm:h-4 transition-transform"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              </th>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs sm:text-sm font-semibold text-brand-700 whitespace-nowrap">
                품목 코드
              </th>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs sm:text-sm font-semibold text-brand-700 whitespace-nowrap">
                품목 명
              </th>
              {isAdmin && (
                <th className="px-3 sm:px-6 py-2 sm:py-3 text-right text-xs sm:text-sm font-semibold text-brand-700 whitespace-nowrap">
                  매입단가
                </th>
              )}
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-right text-xs sm:text-sm font-semibold text-brand-700 whitespace-nowrap">
                매출단가
              </th>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs sm:text-sm font-semibold text-brand-700 whitespace-nowrap">
                액상 종류
              </th>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs sm:text-sm font-semibold text-brand-700 whitespace-nowrap">
                액상 맛
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
                  colSpan={isAdmin ? 11 : 10}
                  className="px-3 sm:px-6 py-10 text-center text-gray-500 text-xs sm:text-sm"
                >
                  품목 데이터가 없습니다.
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
                  <td className="px-3 sm:px-6 py-2 sm:py-3 whitespace-nowrap space-x-1">
                    {isAdmin ? (
                      <>
                        <Button
                          size="xs"
                          variant="gray"
                          onClick={() => onEdit?.(item)}
                        >
                          수정
                        </Button>
                        <Button
                          size="xs"
                          variant="danger"
                          onClick={() => onDelete?.(item)}
                        >
                          삭제
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="xs"
                        variant="gray"
                        onClick={() => {
                          open({
                            content: (
                              <ItemDetailModal item={item} onClose={close} />
                            ),
                            options: { dismissOnBackdrop: true, dismissOnEsc: true },
                          });
                        }}
                      >
                        상세
                      </Button>
                    )}
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
                  {isAdmin && (
                    <td className="px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm text-gray-700 whitespace-nowrap text-right">
                      {item.purchase_price != null
                        ? item.purchase_price.toLocaleString() + '원'
                        : <span className="text-gray-400">-</span>}
                    </td>
                  )}
                  <td className="px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm text-gray-700 whitespace-nowrap text-right">
                    {item.selling_price != null
                      ? item.selling_price.toLocaleString() + '원'
                      : <span className="text-gray-400">-</span>}
                  </td>
                  <td className="px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm text-gray-700 whitespace-nowrap">
                    {item.liquid_type || <span className="text-gray-400">-</span>}
                  </td>
                  <td className="px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm text-gray-700 whitespace-nowrap">
                    {item.liquid_flavor || <span className="text-gray-400">-</span>}
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
        <div className="mt-3 flex shrink-0 justify-center">
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

export default ItemList;
