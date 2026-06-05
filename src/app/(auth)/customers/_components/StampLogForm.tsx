'use client';

import Button from '@/app/_components/Button';
import {
  PaymentTypeEnum,
  PaymentTypeEnumType,
  StoreTypeEnum,
  StoreTypeEnumType,
} from '@/app/_enums/enums';
import { useItems } from '@/app/_domains/_item/_hooks/useItems';
import type { ItemType } from '@/app/_domains/_item/_types/item.types';
import type {
  StampLogItem,
  StampLogMeta,
} from '@/app/_domains/_stamp/_services/stampService';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

const ovapePaymentTypes = [
  PaymentTypeEnum.CARD,
  PaymentTypeEnum.TRANSFER,
  PaymentTypeEnum.CASH,
  PaymentTypeEnum.KAKAOTALK,
  PaymentTypeEnum.CASH_RECEIPT,
  PaymentTypeEnum.TRANSFER_CASH_RECEIPT,
];

const eguVapePaymentTypes = [
  PaymentTypeEnum.EGU_CARD,
  PaymentTypeEnum.EGU_TRANSFER,
  PaymentTypeEnum.EGU_CASH_RECEIPT,
];

const paymentTypesByStore = {
  [StoreTypeEnum.OVAPE.value]: ovapePaymentTypes,
  [StoreTypeEnum.EGU_VAPE.value]: eguVapePaymentTypes,
};

const remarkOptions = [
  { value: '', name: '미입력' },
  { value: 'service', name: '서비스' },
  { value: 'custom', name: '메모 직접 입력' },
  { value: 'price_adjust', name: '가격 조정' },
] as const;

type RemarkOptionValue = (typeof remarkOptions)[number]['value'];

const discountOptions = [
  { value: 'special', name: '특별' },
  { value: 'transfer', name: '이체' },
  { value: 'cash', name: '현금' },
] as const;

type DiscountOptionValue = (typeof discountOptions)[number]['value'];

type DraftStampLogLine = StampLogItem & {
  id: string;
  itemCategoryName?: string | null;
};

export type StampLogValue = {
  note: string;
  paymentType: PaymentTypeEnumType['value'];
  paymentTypeName: string;
  amount: number;
  logMeta: StampLogMeta;
  storeName: StoreTypeEnumType['value'];
  storeLabel: string;
  finalAmount: number;
  finalAmountExpression: string;
};

export type StampLogFormInitialValue = {
  paymentType?: PaymentTypeEnumType['value'];
  storeName?: StoreTypeEnumType['value'];
  amount?: number;
  logMeta?: StampLogMeta | null;
};

const formatAmount = (value: number) => value.toLocaleString('ko-KR');

export default function StampLogForm({
  onChange,
  initialValue,
  isStampAmountEditable = true,
}: {
  onChange: (value: StampLogValue | null) => void;
  initialValue?: StampLogFormInitialValue;
  isStampAmountEditable?: boolean;
}) {
  const [paymentType, setPaymentType] = useState<
    PaymentTypeEnumType['value'] | ''
  >(initialValue?.paymentType ?? '');
  const [amount, setAmount] = useState<number>(initialValue?.amount ?? 0);
  const [storeName, setStoreName] = useState<StoreTypeEnumType['value']>(
    initialValue?.storeName ?? StoreTypeEnum.OVAPE.value,
  );
  const [itemSearch, setItemSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<ItemType | null>(null);
  const [showItemResults, setShowItemResults] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [remarkType, setRemarkType] = useState<RemarkOptionValue>('');
  const [customRemark, setCustomRemark] = useState('');
  const [priceAdjustAmount, setPriceAdjustAmount] = useState(0);
  const [priceAdjustMemo, setPriceAdjustMemo] = useState('');
  const [draftLines, setDraftLines] = useState<DraftStampLogLine[]>(
    () =>
      initialValue?.logMeta?.items?.map((item, index) => ({
        ...item,
        id: `${item.itemId}-${index}`,
      })) ?? [],
  );
  const [discountType, setDiscountType] = useState<DiscountOptionValue | ''>(
    () => {
      const initialDiscountType = initialValue?.logMeta?.discount?.type;
      return discountOptions.some((option) => option.value === initialDiscountType)
        ? (initialDiscountType as DiscountOptionValue)
        : '';
    },
  );
  const [discountAmount, setDiscountAmount] = useState(
    initialValue?.logMeta?.discount?.amount ?? 0,
  );
  const itemSearchRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef(new Map<string, HTMLDivElement>());
  const previousLineRectsRef = useRef(new Map<string, DOMRect>());

  const itemFilters = useMemo(
    () => ({
      searchKeyword: itemSearch.trim() || undefined,
      isUse: true,
    }),
    [itemSearch],
  );
  const { items, isLoading: isItemsLoading } = useItems(itemFilters);

  const paymentTypeOptions = paymentTypesByStore[storeName];
  const totalAmount = draftLines.reduce((sum, line) => sum + line.amount, 0);
  const discountLabel = discountOptions.find(
    (option) => option.value === discountType,
  )?.name;
  const activeDiscountAmount = discountLabel ? discountAmount : 0;
  const discountLine =
    discountLabel && activeDiscountAmount > 0
      ? `${discountLabel}할인${activeDiscountAmount})`
      : '';
  const itemNote = draftLines.map((line) => line.lineText).join(', ');
  const generatedNote = [discountLine, itemNote].filter(Boolean).join(' ');
  const finalAmount = Math.max(totalAmount - activeDiscountAmount, 0);
  const amountExpression = draftLines
    .map((line) => formatAmount(line.amount))
    .join(' + ');
  const finalAmountExpression = activeDiscountAmount > 0
    ? `${amountExpression || '0'} - ${formatAmount(activeDiscountAmount)}`
    : amountExpression;

  const resetLineInputs = () => {
    setItemSearch('');
    setSelectedItem(null);
    setShowItemResults(false);
    setQuantity(1);
    setRemarkType('');
    setCustomRemark('');
    setPriceAdjustAmount(0);
    setPriceAdjustMemo('');
  };

  const getItemLabel = (item: ItemType) => {
    return item.item_name;
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        itemSearchRef.current &&
        !itemSearchRef.current.contains(event.target as Node)
      ) {
        setShowItemResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!selectedItem && itemSearch.trim()) {
      setShowItemResults(true);
    }
  }, [itemSearch, selectedItem]);

  // 부모에게 현재 값을 전달 (유효하지 않으면 null)
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (paymentType === '' || draftLines.length === 0) {
      onChangeRef.current(null);
      return;
    }

    const logMeta: StampLogMeta = {
      storeName,
      totalAmount: finalAmount,
      discount:
        discountLabel && activeDiscountAmount > 0
          ? {
              type: discountType,
              name: discountLabel,
              amount: activeDiscountAmount,
              lineText: discountLine,
            }
          : undefined,
      items: draftLines.map((line) => ({
        itemId: line.itemId,
        itemName: line.itemName,
        itemCategoryName: line.itemCategoryName,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        adjustedUnitPrice: line.adjustedUnitPrice,
        amount: line.amount,
        remark: line.remark,
        lineText: line.lineText,
      })),
    };

    onChangeRef.current({
      note: generatedNote,
      paymentType,
      paymentTypeName:
        paymentTypeOptions.find((o) => o.value === paymentType)?.name ?? '',
      amount,
      logMeta,
      storeName,
      storeLabel:
        Object.values(StoreTypeEnum).find((o) => o.value === storeName)?.name ??
        '',
      finalAmount,
      finalAmountExpression,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    paymentType,
    draftLines,
    storeName,
    amount,
    finalAmount,
    finalAmountExpression,
    generatedNote,
    discountLabel,
    activeDiscountAmount,
    discountType,
    discountLine,
  ]);

  const handleItemSelect = (item: ItemType) => {
    setSelectedItem(item);
    setItemSearch('');
    setShowItemResults(false);
  };

  const handleItemRemove = () => {
    setSelectedItem(null);
    setItemSearch('');
    setShowItemResults(false);
  };

  const handleAddLine = () => {
    if (!selectedItem || quantity < 1) return;

    const price = selectedItem.selling_price ?? 0;
    const priceAdjustmentMemo = priceAdjustMemo.trim() || '가격 조정';
    const remark =
      remarkType === 'custom'
        ? customRemark.trim()
        : remarkType === 'price_adjust'
        ? priceAdjustmentMemo
        : remarkType === ''
        ? ''
        : remarkOptions.find((option) => option.value === remarkType)?.name ?? '';
    const lineAmount =
      remarkType === 'service'
        ? 0
        : remarkType === 'price_adjust'
        ? priceAdjustAmount * quantity
        : price * quantity;
    const remarkText = remark;
    const lineText = `${selectedItem.item_name} ${quantity}개${
      remarkText ? ` (${remarkText})` : ''
    }`;

    setDraftLines((prev) => [
      ...prev,
      {
        id: `${selectedItem.id}-${Date.now()}`,
        itemId: selectedItem.id,
        itemName: selectedItem.item_name,
        itemCategoryName: selectedItem.item_categories?.name ?? null,
        quantity,
        unitPrice: price,
        adjustedUnitPrice:
          remarkType === 'price_adjust' ? priceAdjustAmount : null,
        amount: lineAmount,
        remark,
        lineText,
      },
    ]);
    resetLineInputs();
  };

  const setLineRef = (id: string) => (node: HTMLDivElement | null) => {
    if (node) {
      lineRefs.current.set(id, node);
    } else {
      lineRefs.current.delete(id);
    }
  };

  const captureLinePositions = () => {
    const nextRects = new Map<string, DOMRect>();
    lineRefs.current.forEach((node, id) => {
      nextRects.set(id, node.getBoundingClientRect());
    });
    previousLineRectsRef.current = nextRects;
  };

  const moveLine = (fromIndex: number, direction: -1 | 1) => {
    const toIndex = fromIndex + direction;
    captureLinePositions();
    setDraftLines((prev) => {
      if (toIndex < 0 || toIndex >= prev.length) return prev;

      const next = [...prev];
      const [movedLine] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, movedLine);
      return next;
    });
  };

  useLayoutEffect(() => {
    const previousRects = previousLineRectsRef.current;
    if (previousRects.size === 0) return;

    lineRefs.current.forEach((node, id) => {
      const previousRect = previousRects.get(id);
      if (!previousRect) return;

      const currentRect = node.getBoundingClientRect();
      const deltaY = previousRect.top - currentRect.top;
      if (deltaY === 0) return;

      node.style.transition = 'none';
      node.style.transform = `translateY(${deltaY}px)`;
      node.style.zIndex = '1';

      requestAnimationFrame(() => {
        node.style.transition = 'transform 180ms ease';
        node.style.transform = 'translateY(0)';

        node.addEventListener(
          'transitionend',
          () => {
            node.style.transition = '';
            node.style.transform = '';
            node.style.zIndex = '';
          },
          { once: true },
        );
      });
    });

    previousLineRectsRef.current = new Map();
  }, [draftLines]);

  return (
    <div className="space-y-5">
      <div>
        <span className="block text-sm font-medium mb-2">
          매장명 <span className="text-rose-600">*</span>
        </span>
        <div className="grid grid-cols-2 gap-2">
          {Object.values(StoreTypeEnum).map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={storeName === option.value ? 'primary' : 'gray'}
              onClick={() => {
                setStoreName(option.value);
                setPaymentType('');
              }}
            >
              {option.name}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <span className="block text-sm font-medium mb-2">
          결제 유형 <span className="text-rose-600">*</span>
        </span>
        <div className="grid grid-cols-3 gap-2">
          {paymentTypeOptions.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={paymentType === option.value ? 'primary' : 'gray'}
              onClick={() => setPaymentType(option.value)}
            >
              {option.name}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          스탬프 개수 <span className="text-rose-600">*</span>
        </label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={amount}
            onChange={(e) => {
              if (!isStampAmountEditable) return;
              const v = e.target.value;
              if (v === '' || /^[0-9]+$/.test(v)) {
                setAmount(v === '' ? 0 : Number(v));
              }
            }}
            disabled={!isStampAmountEditable}
            className="w-16 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm text-center disabled:bg-gray-100 disabled:text-gray-500"
          />
          <button
            type="button"
            onClick={() => setAmount((v) => Math.max(0, v - 1))}
            disabled={!isStampAmountEditable}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition-colors text-lg leading-none disabled:cursor-not-allowed disabled:opacity-40"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => setAmount((v) => v + 1)}
            disabled={!isStampAmountEditable}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700 transition-colors text-lg leading-none disabled:cursor-not-allowed disabled:opacity-40"
          >
            +
          </button>
        </div>
        {!isStampAmountEditable ? (
          <p className="mt-1.5 text-xs text-gray-400">
            수정 시 스탬프 개수는 변경되지 않습니다.
          </p>
        ) : amount === 0 && (
          <p className="mt-1.5 text-xs text-gray-400">
            0개 입력 시 <span className="font-medium text-gray-500">미적립</span>
            으로 기록됩니다.
          </p>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px]">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              품목 선택 <span className="text-rose-600">*</span>
            </label>
            <div ref={itemSearchRef} className="relative">
              <div className="relative">
                <input
                  type="text"
                  value={selectedItem ? getItemLabel(selectedItem) : itemSearch}
                  onChange={(e) => {
                    if (!selectedItem) {
                      setItemSearch(e.target.value);
                    }
                  }}
                  onFocus={() => {
                    if (!selectedItem && itemSearch.trim()) {
                      setShowItemResults(true);
                    }
                  }}
                  disabled={!!selectedItem}
                  className={`w-full px-3 py-2 pr-9 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm ${
                    selectedItem
                      ? 'bg-gray-100 text-gray-700 cursor-not-allowed'
                      : 'bg-white'
                  }`}
                  placeholder="품목명 또는 코드"
                />
                {selectedItem ? (
                  <button
                    type="button"
                    onClick={handleItemRemove}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    aria-label="품목 선택 해제"
                  >
                    X
                  </button>
                ) : (
                  isItemsLoading && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <div className="w-4 h-4 border-2 border-brand-300 border-t-brand-600 rounded-full animate-spin" />
                    </div>
                  )
                )}
              </div>

              {!selectedItem && showItemResults && items.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-brand-200 rounded-lg shadow-lg max-h-60 overflow-auto">
                  {items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="block w-full px-4 py-3 text-left cursor-pointer hover:bg-brand-50 transition-colors border-b border-brand-50 last:border-b-0"
                      onClick={() => handleItemSelect(item)}
                    >
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900">
                          {getItemLabel(item)}
                        </p>
                        <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                          {item.item_categories?.name ?? '미분류'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600">
                        {item.selling_price !== null
                          ? `${formatAmount(item.selling_price)}원`
                          : '금액 없음'}
                      </p>
                    </button>
                  ))}
                </div>
              )}

              {!selectedItem &&
                showItemResults &&
                items.length === 0 &&
                itemSearch.trim() &&
                !isItemsLoading && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-brand-200 rounded-lg shadow-lg p-4">
                    <p className="text-sm text-gray-500 text-center">
                      검색 결과가 없습니다.
                    </p>
                  </div>
                )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              수량
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={quantity}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '' || /^[0-9]+$/.test(v)) {
                    setQuantity(v === '' ? 1 : Math.max(1, Number(v)));
                  }
                }}
                className="w-16 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm text-center"
              />
              <button
                type="button"
                onClick={() => setQuantity((v) => Math.max(1, v - 1))}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition-colors text-lg leading-none"
              >
                −
              </button>
              <button
                type="button"
                onClick={() => setQuantity((v) => v + 1)}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700 transition-colors text-lg leading-none"
              >
                +
              </button>
            </div>
          </div>
        </div>

        <div>
          <span className="block text-sm font-medium text-gray-700 mb-2">
            특이사항
          </span>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {remarkOptions.map((option) => (
              <label
                key={option.value}
                className="inline-flex items-center gap-2 text-xs whitespace-nowrap"
              >
                <input
                  type="radio"
                  name="remarkType"
                  value={option.value}
                  checked={remarkType === option.value}
                  onChange={() => setRemarkType(option.value)}
                />
                {option.name}
              </label>
            ))}
          </div>
        </div>

        {remarkType === 'custom' && (
          <textarea
            value={customRemark}
            onChange={(e) => setCustomRemark(e.target.value)}
            className="w-full min-h-20 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm resize-y"
            placeholder="ex) 박스매장보관 여부, 다른 특이사항"
          />
        )}

        {remarkType === 'price_adjust' && (
          <div className="grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)]">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                조정 가격 <span className="text-rose-600">*</span>
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={priceAdjustAmount}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '' || /^[0-9]+$/.test(v)) {
                      setPriceAdjustAmount(v === '' ? 0 : Number(v));
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm text-right"
                  placeholder="금액"
                />
                <span className="text-sm text-gray-600">원</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                메모
              </label>
              <input
                type="text"
                value={priceAdjustMemo}
                onChange={(e) => setPriceAdjustMemo(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm"
                placeholder="미입력 시 가격 조정"
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-gray-500">
            {selectedItem
              ? `${selectedItem.item_name} / ${formatAmount(
                  remarkType === 'service'
                    ? 0
                    : remarkType === 'price_adjust'
                    ? priceAdjustAmount * quantity
                    : (selectedItem.selling_price ?? 0) * quantity,
                )}원`
              : '품목을 선택하면 메모와 금액이 생성됩니다.'}
          </p>
          <Button
            type="button"
            size="sm"
            onClick={handleAddLine}
            disabled={!selectedItem || quantity < 1}
          >
            추가
          </Button>
        </div>
      </div>

      <div>
        <span className="block text-sm font-medium text-gray-700 mb-2">
          품목 목록 <span className="text-rose-600">*</span>
        </span>
        <div className="min-h-24 rounded-lg bg-gray-50 p-3">
          {draftLines.length === 0 ? (
            <p className="text-sm text-gray-400">추가된 품목이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {draftLines.map((line, index) => (
                <div
                  ref={setLineRef(line.id)}
                  key={line.id}
                  className="relative flex items-center justify-between gap-2 rounded-md border border-gray-200 bg-white px-3 py-2"
                >
                  <div className="flex min-w-0 items-start gap-2">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-semibold text-white">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                          {line.itemCategoryName ?? '미분류'}
                        </span>
                        <p className="min-w-0 text-sm text-gray-900">
                          {line.lineText}
                        </p>
                      </div>
                      <p className="mt-0.5 text-xs text-gray-500">
                        개별단가 {formatAmount(line.unitPrice)}원
                        {typeof line.adjustedUnitPrice === 'number' &&
                          ` / 조정단가 ${formatAmount(line.adjustedUnitPrice)}원`}
                        {' / '}총금액 {formatAmount(line.amount)}원
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 self-center flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveLine(index, -1)}
                      disabled={index === 0}
                      className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-gray-200 bg-white text-xs font-semibold text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-35"
                      aria-label={`${line.lineText} 위로 이동`}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveLine(index, 1)}
                      disabled={index === draftLines.length - 1}
                      className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-gray-200 bg-white text-xs font-semibold text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-35"
                      aria-label={`${line.lineText} 아래로 이동`}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setDraftLines((prev) =>
                          prev.filter((item) => item.id !== line.id),
                        )
                      }
                      className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md px-2 py-1 text-xs font-semibold text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      aria-label={`${line.lineText} 삭제`}
                    >
                      X
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div>
        <span className="block text-sm font-medium text-gray-700 mb-2">할인</span>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {discountOptions.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={discountType === option.value ? 'primary' : 'gray'}
                onClick={() => setDiscountType(option.value)}
              >
                {option.name}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={discountAmount}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '' || /^[0-9]+$/.test(v)) {
                  setDiscountAmount(v === '' ? 0 : Number(v));
                }
              }}
              className="w-28 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm text-right"
              placeholder="금액"
            />
            <span className="text-sm text-gray-600">원</span>
          </div>
        </div>
      </div>

      <div>
        <span className="block text-sm font-medium text-gray-700 mb-2">금액</span>
        <div className="rounded-lg bg-gray-50 px-3 py-3">
          <p className="text-sm font-semibold text-gray-900">
            {finalAmountExpression || '0'} = {formatAmount(finalAmount)}
          </p>
        </div>
      </div>

    </div>
  );
}
