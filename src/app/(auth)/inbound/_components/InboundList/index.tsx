'use client';

import { useModal } from '@/app/_contexts/ModalContext';
import Button from '@/app/_components/Button';
import Loading from '@/app/_components/Loading';
import {
  useInboundOrders,
  InboundFilters,
} from '@/app/_domains/_inbound/_hooks/useInboundOrders';
import { InboundOrderItemType } from '@/app/_domains/_inbound/_types/inbound.types';
import InboundDetailModal from '../InboundDetailModal';

interface InboundListProps {
  filters?: InboundFilters;
}

const formatDate = (value: string | null | undefined) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

const ItemChips = ({ items }: { items: InboundOrderItemType[] }) => {
  if (!items || items.length === 0) {
    return <span className="text-gray-400">—</span>;
  }
  const totalQty = items.reduce((sum, i) => sum + (i.quantity ?? 0), 0);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-1">
        {items.map((it) => (
          <span
            key={it.id}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] sm:text-xs ${
              it.is_inventory_processed
                ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                : 'bg-gray-100 border-gray-200 text-gray-700'
            }`}
            title={it.items?.item_code ? `코드: ${it.items.item_code}` : undefined}
          >
            <span className="font-medium">
              {it.items?.item_name ?? '(삭제된 품목)'}
            </span>
            <span
              className={
                it.is_inventory_processed ? 'text-emerald-600' : 'text-gray-500'
              }
            >
              {it.quantity}개
            </span>
          </span>
        ))}
      </div>
      <div className="text-[11px] text-gray-500">
        총 {items.length}종 / {totalQty.toLocaleString()}개
      </div>
    </div>
  );
};

const InboundList = ({ filters }: InboundListProps) => {
  const { open, close } = useModal();
  const {
    orders,
    isLoading,
    isLoadingMore,
    error,
    loadMore,
    hasMore,
    totalCount,
  } = useInboundOrders(filters);

  if (isLoading) {
    return <Loading size="lg" text="입고 목록 불러오는 중..." />;
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
          <span className="font-semibold text-brand-600">{orders.length}</span>
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
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs sm:text-sm font-semibold text-brand-700 whitespace-nowrap">
                거래처
              </th>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs sm:text-sm font-semibold text-brand-700 whitespace-nowrap">
                주문 날짜
              </th>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs sm:text-sm font-semibold text-brand-700 whitespace-nowrap">
                입고 날짜
              </th>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs sm:text-sm font-semibold text-brand-700">
                품목
              </th>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs sm:text-sm font-semibold text-brand-700 max-w-64">
                비고
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-brand-50">
            {orders.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 sm:px-6 py-10 text-center text-gray-500 text-xs sm:text-sm"
                >
                  입고 데이터가 없습니다.
                </td>
              </tr>
            ) : (
              orders.map((order, index) => (
                <tr
                  key={`${order.id}-${index}`}
                  className="hover:bg-brand-50/50 transition-colors align-top"
                >
                  <td className="px-3 sm:px-6 py-3 text-xs sm:text-sm text-gray-700 whitespace-nowrap">
                    {index + 1}
                  </td>
                  <td className="px-3 sm:px-6 py-3 whitespace-nowrap">
                    <Button
                      size="xs"
                      variant="gray"
                      onClick={() =>
                        open({
                          content: (
                            <InboundDetailModal order={order} onClose={close} />
                          ),
                          options: {
                            dismissOnBackdrop: false,
                            dismissOnEsc: true,
                            maxWidthClassName: 'max-w-4xl',
                          },
                        })
                      }
                    >
                      상세
                    </Button>
                  </td>
                  <td className="px-3 sm:px-6 py-3 text-xs sm:text-sm text-gray-900 whitespace-nowrap font-medium">
                    {order.partners?.name ?? (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-3 sm:px-6 py-3 text-xs sm:text-sm text-gray-700 whitespace-nowrap">
                    {formatDate(order.order_date)}
                  </td>
                  <td className="px-3 sm:px-6 py-3 text-xs sm:text-sm text-gray-700 whitespace-nowrap">
                    {formatDate(order.inbound_date)}
                  </td>
                  <td className="px-3 sm:px-6 py-3 text-xs sm:text-sm text-gray-700">
                    <ItemChips items={order.inbound_order_items ?? []} />
                  </td>
                  <td className="px-3 sm:px-6 py-3 text-xs sm:text-sm text-gray-700 max-w-64">
                    <p className="truncate" title={order.note || ''}>
                      {order.note || <span className="text-gray-400">—</span>}
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

export default InboundList;
