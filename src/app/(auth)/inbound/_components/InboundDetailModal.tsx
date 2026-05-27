'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Button from '@/app/_components/Button';
import { inboundKeys } from '@/app/_domains/_inbound/_queryKeys/inboundKeys';
import {
  processInboundOrderItemInventory,
  updateInboundOrderItemQuantityConfirmed,
} from '@/app/_domains/_inbound/_services/inboundService';
import { InboundOrderItemType, InboundOrderType } from '@/app/_domains/_inbound/_types/inbound.types';
import { inventoryKeys } from '@/app/_domains/_inventory/_queryKeys/inventoryKeys';
import toast from 'react-hot-toast';

interface InboundDetailModalProps {
  order: InboundOrderType;
  onClose: () => void;
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

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex flex-col gap-1">
    <label className="text-sm font-medium text-gray-700">{label}</label>
    <div className="flex min-h-[38px] items-center rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
      {value || <span className="text-gray-400">—</span>}
    </div>
  </div>
);

const StatusChip = ({
  active,
  activeLabel,
  inactiveLabel,
}: {
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
}) => (
  <span
    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
      active ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-500'
    }`}
  >
    {active ? activeLabel : inactiveLabel}
  </span>
);

const InboundDetailModal = ({ order, onClose }: InboundDetailModalProps) => {
  const queryClient = useQueryClient();
  const [currentOrder, setCurrentOrder] = useState(order);
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);

  const updateOrderItem = (
    itemId: string,
    updater: (item: InboundOrderItemType) => InboundOrderItemType,
  ) => {
    setCurrentOrder((prev) => ({
      ...prev,
      inbound_order_items: prev.inbound_order_items.map((item) =>
        item.id === itemId ? updater(item) : item,
      ),
    }));
  };

  const refreshLists = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: inboundKeys.lists() }),
      queryClient.invalidateQueries({ queryKey: inventoryKeys.lists() }),
    ]);
  };

  const handleToggleQuantityConfirmed = async (item: InboundOrderItemType) => {
    setLoadingItemId(item.id);
    try {
      const nextValue = !item.is_quantity_confirmed;
      await updateInboundOrderItemQuantityConfirmed(item.id, nextValue);
      updateOrderItem(item.id, (prev) => ({
        ...prev,
        is_quantity_confirmed: nextValue,
      }));
      await refreshLists();
      toast.success(
        nextValue ? '수량 확인이 완료되었습니다.' : '수량 확인이 해제되었습니다.',
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : '수량 확인 변경에 실패했습니다.',
      );
    } finally {
      setLoadingItemId(null);
    }
  };

  const handleProcessInventory = async (item: InboundOrderItemType) => {
    setLoadingItemId(item.id);
    try {
      const { processedAt } = await processInboundOrderItemInventory({
        inboundOrderId: currentOrder.id,
        inboundOrderItemId: item.id,
        itemId: item.item_id,
        quantity: item.quantity,
      });

      updateOrderItem(item.id, (prev) => ({
        ...prev,
        is_inventory_processed: true,
        processed_at: processedAt,
      }));
      setCurrentOrder((prev) => ({
        ...prev,
        inbound_date: processedAt.slice(0, 10),
      }));
      await refreshLists();
      toast.success('재고 반영이 완료되었습니다.');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : '재고 반영에 실패했습니다.',
      );
    } finally {
      setLoadingItemId(null);
    }
  };

  return (
    <div className="flex min-h-0 max-h-full w-full flex-col gap-4 overflow-hidden">
      <div>
        <h2 className="text-base font-semibold text-gray-900">입고 상세</h2>
        <p className="mt-1 text-sm text-gray-500">
          입고 정보와 품목별 진행 상태를 확인할 수 있습니다.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="거래처" value={currentOrder.partners?.name} />
        <Field label="주문 날짜" value={formatDate(currentOrder.order_date)} />
        <Field label="입고 날짜" value={formatDate(currentOrder.inbound_date)} />
        <Field label="품목 수" value={`${currentOrder.inbound_order_items.length}건`} />
      </div>

      <Field label="메모" value={currentOrder.note} />

      <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-brand-100 bg-brand-50/30">
        <div className="border-b border-brand-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-900">입고 품목 상태</h3>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          {currentOrder.inbound_order_items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-400">
              등록된 품목이 없습니다.
            </div>
          ) : (
            currentOrder.inbound_order_items.map((item, index) => {
              const isLoading = loadingItemId === item.id;

              return (
                <div
                  key={item.id}
                  className="rounded-lg border border-brand-100 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-gray-100 px-1.5 text-xs font-semibold text-gray-600">
                          {index + 1}
                        </span>
                        <h4 className="truncate text-sm font-semibold text-gray-900">
                          {item.items?.item_name ?? '(삭제된 품목)'}
                        </h4>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                        <span className="font-mono">
                          {item.items?.item_code ?? '코드 없음'}
                        </span>
                        <span>수량 {item.quantity.toLocaleString()}개</span>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      <StatusChip
                        active={item.is_quantity_confirmed}
                        activeLabel="수량 확인 완료"
                        inactiveLabel="수량 미확인"
                      />
                      <StatusChip
                        active={item.is_inventory_processed}
                        activeLabel="재고 반영 완료"
                        inactiveLabel="재고 미반영"
                      />
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <Field label="품목 메모" value={item.note} />
                    <Field
                      label="재고 반영 일시"
                      value={formatDateTime(item.processed_at)}
                    />
                  </div>

                  <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-3">
                    <Button
                      size="sm"
                      variant={item.is_quantity_confirmed ? 'gray' : 'secondary'}
                      onClick={() => handleToggleQuantityConfirmed(item)}
                      disabled={isLoading}
                    >
                      {isLoading && !item.is_inventory_processed
                        ? '처리 중...'
                        : item.is_quantity_confirmed
                          ? '수량 확인 해제'
                          : '수량 확인'}
                    </Button>
                    <Button
                      size="sm"
                      variant={
                        item.is_inventory_processed
                          ? 'gray'
                          : item.is_quantity_confirmed
                            ? 'primary'
                            : 'secondary'
                      }
                      onClick={() => handleProcessInventory(item)}
                      disabled={
                        isLoading ||
                        item.is_inventory_processed
                      }
                    >
                      {item.is_inventory_processed ? '재고 반영 완료' : '재고 반영'}
                    </Button>
                  </div>
                  {!item.is_quantity_confirmed && !item.is_inventory_processed && (
                    <p className="mt-2 text-xs text-amber-600">
                      재고 반영 전에 먼저 수량 확인을 완료해주세요.
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="flex justify-end border-t border-gray-100 pt-2">
        <Button type="button" variant="gray" size="sm" onClick={onClose}>
          닫기
        </Button>
      </div>
    </div>
  );
};

export default InboundDetailModal;
