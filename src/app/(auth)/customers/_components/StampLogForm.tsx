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
import { useEffect, useMemo, useRef, useState } from 'react';

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
  { value: 'custom', name: '직접 입력' },
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

const formatAmount = (value: number) => value.toLocaleString('ko-KR');

export default function StampLogForm({
  onChange,
}: {
  onChange: (value: StampLogValue | null) => void;
}) {
  const [paymentType, setPaymentType] = useState<PaymentTypeEnumType['value'] | ''>('');
  const [amount, setAmount] = useState<number>(0);
  const [storeName, setStoreName] = useState<StoreTypeEnumType['value']>(
    StoreTypeEnum.OVAPE.value,
  );
  const [itemSearch, setItemSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<ItemType | null>(null);
  const [showItemResults, setShowItemResults] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [remarkType, setRemarkType] = useState<RemarkOptionValue>('');
  const [customRemark, setCustomRemark] = useState('');
  const [draftLines, setDraftLines] = useState<DraftStampLogLine[]>([]);
  const [discountType, setDiscountType] = useState<DiscountOptionValue | ''>('');
  const [discountAmount, setDiscountAmount] = useState(0);
  const itemSearchRef = useRef<HTMLDivElement>(null);

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
        quantity: line.quantity,
        unitPrice: line.unitPrice,
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

    const remark =
      remarkType === 'custom'
        ? customRemark.trim()
        : remarkType === ''
        ? ''
        : remarkOptions.find((option) => option.value === remarkType)?.name ?? '';
    const price = selectedItem.selling_price ?? 0;
    const lineAmount = remarkType === 'service' ? 0 : price * quantity;
    const lineText = `${selectedItem.item_name} ${quantity}개${
      remark ? ` (${remark})` : ''
    }`;

    setDraftLines((prev) => [
      ...prev,
      {
        id: `${selectedItem.id}-${Date.now()}`,
        itemId: selectedItem.id,
        itemName: selectedItem.item_name,
        quantity,
        unitPrice: price,
        amount: lineAmount,
        remark,
        lineText,
      },
    ]);
    resetLineInputs();
  };

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

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
        <div className="grid grid-cols-[minmax(0,1fr)_72px] gap-2">
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
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
                      <p className="text-sm font-medium text-gray-900">
                        {getItemLabel(item)}
                      </p>
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
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) =>
                setQuantity(Math.max(1, Number(e.target.value) || 1))
              }
              className="w-full px-2 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm text-center"
            />
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
            placeholder="ex) 쿠폰사용 병수 , 박스매장보관 여부 , 다른 특이사항"
          />
        )}

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-gray-500">
            {selectedItem
              ? `${selectedItem.item_name} / ${
                  selectedItem.selling_price !== null
                    ? `${formatAmount(selectedItem.selling_price * quantity)}원`
                    : '금액 없음'
                }`
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
                  key={line.id}
                  className="flex items-start justify-between gap-2 rounded-md border border-gray-200 bg-white px-3 py-2"
                >
                  <div className="flex min-w-0 items-start gap-2">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-semibold text-white">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-gray-900">{line.lineText}</p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        개별단가 {formatAmount(line.unitPrice)}원 / 총금액{' '}
                        {formatAmount(line.amount)}원
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setDraftLines((prev) =>
                        prev.filter((item) => item.id !== line.id),
                      )
                    }
                    className="shrink-0 cursor-pointer rounded-md px-2 py-1 text-xs font-semibold text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    aria-label={`${line.lineText} 삭제`}
                  >
                    X
                  </button>
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

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          스탬프 개수 <span className="text-rose-600">*</span>
        </label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={amount}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '' || /^[0-9]+$/.test(v)) {
                setAmount(v === '' ? 0 : Number(v));
              }
            }}
            className="w-16 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm text-center"
          />
          <button
            type="button"
            onClick={() => setAmount((v) => Math.max(0, v - 1))}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition-colors text-lg leading-none"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => setAmount((v) => v + 1)}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700 transition-colors text-lg leading-none"
          >
            +
          </button>
        </div>
        {amount === 0 && (
          <p className="mt-1.5 text-xs text-gray-400">
            0개 입력 시 <span className="font-medium text-gray-500">미적립</span>
            으로 기록됩니다.
          </p>
        )}
      </div>
    </div>
  );
}
