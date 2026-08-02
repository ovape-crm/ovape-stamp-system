"use client";

import { useEffect, useMemo, useState } from "react";
import Button from "@/app/_components/Button";
import {
  PaymentTypeEnumType,
  StoreTypeEnum,
  StoreTypeEnumType,
} from "@/app/_enums/enums";
import StampLogForm, {
  StampLogValue,
} from "@/app/(auth)/customers/_components/StampLogForm";
import TargetCustomerCard from "@/app/(auth)/customers/_components/TargetCustomerCard";
import type { StampLogMeta } from "@/app/_domains/_stamp/_services/stampService";
import { useModal } from "@/app/_contexts/ModalContext";
import { getCustomerMode } from "@/app/_domains/_customer/_utils/specialCustomer";

const getStampAmountFromAction = (action: string) => {
  if (action === "no-stamp") return 0;
  if (action.startsWith("add-")) {
    const amount = Number(action.replace("add-", ""));
    return Number.isFinite(amount) ? amount : 0;
  }
  return 0;
};

const formatAmount = (value: number) => value.toLocaleString("ko-KR");

const getShipmentTypeLabel = (
  item: NonNullable<StampLogMeta["items"]>[number],
) => {
  if (item.inventoryAction === "adjustment_in") return "재고조정-입고";
  if (item.inventoryAction === "adjustment_out") return "재고조정-출고";
  if (item.inventoryAction === "exchange_in") return "교환입고";
  if (item.inventoryAction === "exchange_out") return "교환출고";
  if (item.remark?.startsWith("시연용")) return "시연용";
  if (typeof item.adjustedUnitPrice === "number") return "가격조정";
  if (item.remark?.startsWith("서비스")) return "서비스";
  return "일반판매";
};

const getShipmentTypeClassName = (
  item: NonNullable<StampLogMeta["items"]>[number],
) => {
  const type = getShipmentTypeLabel(item);
  if (type === "서비스") return "bg-sky-50 text-sky-700";
  if (type === "교환입고") return "bg-emerald-50 text-emerald-700";
  if (type === "교환출고") return "bg-amber-50 text-amber-700";
  if (type === "가격조정") return "bg-violet-50 text-violet-700";
  return "bg-gray-100 text-gray-600";
};

const getItemDisplayMemo = (
  item: NonNullable<StampLogMeta["items"]>[number],
) => {
  const remark = item.remark?.trim();
  if (!remark) return "";
  const wrappedMemo = remark.match(
    /^(?:서비스|교환입고|교환출고)\((.*)\)$/,
  )?.[1];
  if (wrappedMemo) return wrappedMemo.trim();
  if (
    remark === "서비스" ||
    remark === "교환입고" ||
    remark === "교환출고" ||
    remark === "가격 조정" ||
    remark === "가격조정"
  ) {
    return "";
  }
  return remark;
};

interface StampLogEditModalProps {
  target: {
    name: string;
    phone: string;
    address?: string | null;
    note?: string | null;
  };
  initialAction: string;
  initialPaymentType?: PaymentTypeEnumType["value"];
  initialStoreName?: StoreTypeEnumType["value"];
  initialLogMeta?: StampLogMeta | null;
  isStampAmountEditable?: boolean;
  title?: string;
  onSubmit: (values: {
    note: string;
    paymentType?: PaymentTypeEnumType["value"];
    storeName: StoreTypeEnumType["value"];
    logMeta: StampLogMeta;
    amount: number;
  }) => Promise<void>;
  onCancel: () => void;
}

const StampLogEditModal = ({
  target,
  initialAction,
  initialPaymentType,
  initialStoreName,
  initialLogMeta,
  isStampAmountEditable = false,
  title = "출고 이력 수정",
  onSubmit,
  onCancel,
}: StampLogEditModalProps) => {
  const { setSize } = useModal();
  const customerMode = getCustomerMode(target.name, target.phone);
  const [stampLog, setStampLog] = useState<StampLogValue | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(2);
  const [formValidity, setFormValidity] = useState({
    hasPaymentType: false,
    hasItems: false,
    hasDeliveryInfo: true,
    hasCompletedBasicSequence: false,
  });

  const initialValue = useMemo(
    () => ({
      paymentType: initialPaymentType,
      storeName: initialStoreName ?? StoreTypeEnum.OVAPE.value,
      amount: getStampAmountFromAction(initialAction),
      logMeta: initialLogMeta,
    }),
    [initialAction, initialLogMeta, initialPaymentType, initialStoreName],
  );
  const hasValidSplitPaymentAmounts =
    !stampLog?.logMeta.payments?.length ||
    (stampLog.logMeta.payments.every((payment) => payment.amount >= 1) &&
      stampLog.logMeta.payments.reduce(
        (sum, payment) => sum + payment.amount,
        0,
      ) === stampLog.finalAmount);

  useEffect(() => {
    setSize(step >= 2 ? "max-w-6xl" : "max-w-2xl");
  }, [setSize, step]);

  const handleSubmit = async () => {
    if (!stampLog) return;

    try {
      setIsSubmitting(true);
      await onSubmit({
        note: stampLog.note,
        paymentType: stampLog.paymentType,
        storeName: stampLog.storeName,
        logMeta: stampLog.logMeta,
        amount: stampLog.amount,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative flex max-h-[calc(90vh-2rem)] min-h-0 w-full flex-col">
      <button
        type="button"
        onClick={onCancel}
        disabled={isSubmitting}
        aria-label="닫기"
        className="absolute right-0 top-0 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        ×
      </button>

      <h2 className="mb-4 shrink-0 pr-8 text-xl font-semibold text-gray-900">
        {title}
      </h2>

      <div className="mb-5 flex shrink-0 items-start justify-center">
        {(["기본 정보", "품목 · 금액", "최종 확인"] as const).map(
          (label, index) => {
            const stepNumber = (index + 1) as 1 | 2 | 3;
            const isActive = step === stepNumber;
            const isDone = step > stepNumber;

            return (
              <div key={label} className="flex items-start">
                <div className="flex w-16 flex-col items-center gap-1.5">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                      isDone
                        ? "bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-sm"
                        : isActive
                          ? "bg-brand-100 text-brand-600 ring-2 ring-brand-400"
                          : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {isDone ? "✓" : stepNumber}
                  </div>
                  <span
                    className={`whitespace-nowrap text-[11px] font-medium ${
                      isActive || isDone ? "text-brand-700" : "text-gray-400"
                    }`}
                  >
                    {label}
                  </span>
                </div>
                {index < 2 && (
                  <div
                    className={`mt-4 h-0.5 w-8 rounded-full transition-colors sm:w-12 ${
                      isDone ? "bg-brand-500" : "bg-gray-200"
                    }`}
                  />
                )}
              </div>
            );
          },
        )}
      </div>

      <TargetCustomerCard
        name={target.name}
        phone={target.phone}
        address={target.address}
        note={target.note}
        className="mb-4 shrink-0"
      />

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <StampLogForm
          initialValue={initialValue}
          isStampAmountEditable={customerMode !== "x" && isStampAmountEditable}
          layout="split"
          step={step}
          customerMode={customerMode}
          customerAddress={target.address}
          onChange={setStampLog}
          onValidityChange={setFormValidity}
        />

        {step === 3 && stampLog && (
          <div className="space-y-4">
            <div
              className={`grid grid-cols-2 gap-2 ${
                customerMode === "x" ? "md:grid-cols-4" : "md:grid-cols-5"
              }`}
            >
              {[
                {
                  label: "출고 방식",
                  value: stampLog.logMeta.reservationDate
                    ? `${stampLog.logMeta.reservationDate} 예약 출고`
                    : "즉시 출고",
                },
                { label: "출고 매장", value: stampLog.storeLabel },
                {
                  label: "수령 방식",
                  value:
                    stampLog.logMeta.deliveryMethod === "parcel"
                      ? "택배"
                      : stampLog.logMeta.deliveryMethod === "delivery"
                        ? stampLog.logMeta.deliveryType === "self"
                          ? "자체배달"
                          : stampLog.logMeta.deliveryType === "customer_quick"
                            ? "손님퀵"
                            : "배달대행"
                        : "매장방문",
                },
                ...(customerMode === "x"
                  ? []
                  : [
                      {
                        label: "스탬프 적립",
                        value:
                          stampLog.amount === 0
                            ? "미적립"
                            : `${stampLog.amount}개`,
                      },
                    ]),
                {
                  label: "결제 정보",
                  value: stampLog.logMeta.payments?.length
                    ? stampLog.logMeta.payments
                        .map((payment) => payment.paymentTypeName)
                        .join(" · ")
                    : stampLog.paymentTypeName,
                },
              ].map((summary) => (
                <div
                  key={summary.label}
                  className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5"
                >
                  <p className="text-xs font-medium text-gray-500">
                    {summary.label}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">
                    {summary.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
              {(stampLog.logMeta.deliveryMethod === "parcel" ||
                (stampLog.logMeta.deliveryMethod === "delivery" &&
                  stampLog.logMeta.deliveryType === "agency")) && (
                <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5">
                  <p className="text-xs font-medium text-gray-500">
                    {stampLog.logMeta.deliveryMethod === "delivery"
                      ? "배달대행비"
                      : "택배비"}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">
                    {formatAmount(stampLog.logMeta.deliveryFee ?? 0)}원
                  </p>
                </div>
              )}
              {stampLog.logMeta.deliveryMethod !== "store_visit" && (
                <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 md:col-span-2">
                  <p className="text-xs font-medium text-gray-500">배송 주소</p>
                  <p className="mt-1 break-words text-sm text-gray-800">
                    {stampLog.logMeta.deliveryAddress}
                  </p>
                </div>
              )}
              <div
                className={`rounded-lg border border-gray-200 bg-white px-3 py-2.5 ${
                  stampLog.logMeta.deliveryMethod === "store_visit"
                    ? "md:col-span-4"
                    : ""
                }`}
              >
                <p className="text-xs font-medium text-gray-500">출고 메모</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-800">
                  {stampLog.logMeta.extraNote || "없음"}
                </p>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <div className="flex items-center gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3">
                <h3 className="text-sm font-semibold text-gray-900">
                  품목 목록
                </h3>
                <span className="text-xs text-gray-500">
                  {
                    new Set(
                      stampLog.logMeta.items?.map((item) => item.itemId) ?? [],
                    ).size
                  }
                  종 · 총{" "}
                  {stampLog.logMeta.items?.reduce(
                    (sum, item) => sum + item.quantity,
                    0,
                  ) ?? 0}
                  개
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] table-fixed text-sm">
                  <thead className="bg-gray-50 text-xs font-semibold text-gray-600">
                    <tr className="border-b border-gray-200">
                      <th className="w-[6%] px-2 py-2 text-center">번호</th>
                      <th className="w-[33%] px-2 py-2 text-left">품목명</th>
                      <th className="w-[13%] px-2 py-2 text-center">
                        품목종류
                      </th>
                      <th className="w-[13%] px-2 py-2 text-center">
                        출고 유형
                      </th>
                      <th className="w-[8%] px-2 py-2 text-center">수량</th>
                      <th className="w-[13%] px-2 py-2 text-right">단가</th>
                      <th className="w-[14%] px-3 py-2 text-right">소계</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stampLog.logMeta.items?.map((item, index) => {
                      const memo = getItemDisplayMemo(item);
                      return (
                        <tr
                          key={`${item.itemId}-${index}`}
                          className="border-b border-gray-200 last:border-b-0"
                        >
                          <td className="px-2 py-2">
                            <span className="mx-auto flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-xs font-semibold leading-none text-white">
                              {index + 1}
                            </span>
                          </td>
                          <td className="px-2 py-2 font-medium text-gray-900">
                            <div className="flex flex-wrap items-center gap-x-1.5">
                              <span className="break-words">
                                {item.itemName}
                              </span>
                              {memo && (
                                <span className="break-words text-xs font-normal text-gray-500">
                                  ({memo})
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-2 py-2 text-center text-xs font-medium text-gray-600">
                            {item.itemCategoryName ?? "미분류"}
                          </td>
                          <td className="px-2 py-2 text-center">
                            <span
                              className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${getShipmentTypeClassName(item)}`}
                            >
                              {getShipmentTypeLabel(item)}
                            </span>
                          </td>
                          <td className="px-2 py-2 text-center font-medium text-gray-800">
                            {item.quantity}개
                          </td>
                          <td className="px-2 py-2 text-right text-gray-700">
                            {formatAmount(
                              typeof item.adjustedUnitPrice === "number"
                                ? item.adjustedUnitPrice
                                : item.unitPrice,
                            )}
                            원
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-gray-900">
                            {formatAmount(item.amount)}원
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex shrink-0 flex-col gap-4 border-t border-gray-200 pt-4 lg:flex-row lg:items-center lg:justify-between">
        {(step === 2 || step === 3) && stampLog ? (
          <div className="grid flex-1 grid-cols-2 items-center gap-x-5 gap-y-3 lg:grid-cols-[1fr_1.2fr_1fr_0.8fr_1.2fr]">
            <div>
              <p className="text-xs text-gray-500">품목 수량</p>
              <p className="mt-0.5 text-sm font-semibold text-gray-900">
                총{" "}
                {
                  new Set(
                    stampLog.logMeta.items?.map((item) => item.itemId) ?? [],
                  ).size
                }
                종 ·{" "}
                {stampLog.logMeta.items?.reduce(
                  (sum, item) => sum + item.quantity,
                  0,
                ) ?? 0}
                개
              </p>
            </div>
            <div className="border-l border-gray-200 pl-5">
              <p className="text-xs text-gray-500">결제방식</p>
              <p className="mt-0.5 text-sm font-semibold text-gray-900">
                {stampLog.logMeta.payments?.length
                  ? stampLog.logMeta.payments
                      .map((payment) => payment.paymentTypeName)
                      .join(" · ")
                  : stampLog.paymentTypeName}
              </p>
              {stampLog.logMeta.payments?.length ? (
                <p className="mt-0.5 break-words text-xs text-gray-500">
                  {stampLog.logMeta.payments
                    .map(
                      (payment) =>
                        `${payment.paymentTypeName} ${formatAmount(payment.amount)}원`,
                    )
                    .join(" · ")}
                </p>
              ) : null}
            </div>
            <div className="border-l border-gray-200 pl-5">
              <p className="text-xs text-gray-500">상품 합계</p>
              <p className="mt-0.5 text-base font-semibold text-gray-900">
                {formatAmount(
                  stampLog.logMeta.items?.reduce(
                    (sum, item) => sum + item.amount,
                    0,
                  ) ?? 0,
                )}
                원
              </p>
            </div>
            <div className="border-l border-gray-200 pl-5">
              <p className="text-xs text-gray-500">할인</p>
              <p className="mt-0.5 text-base font-semibold text-gray-900">
                {stampLog.logMeta.discount
                  ? `${stampLog.logMeta.discount.name} ${formatAmount(stampLog.logMeta.discount.amount)}원`
                  : "0원"}
              </p>
            </div>
            <div className="border-l border-gray-200 pl-5">
              <p className="text-xs font-semibold text-brand-600">
                최종 결제금액
              </p>
              <p className="mt-0.5 text-lg font-bold text-brand-600">
                {formatAmount(stampLog.finalAmount)}원
              </p>
            </div>
          </div>
        ) : (
          <div />
        )}

        <div className="flex shrink-0 justify-end gap-3">
          <Button
            variant="gray"
            size="sm"
            onClick={() => {
              if (step === 1) onCancel();
              else setStep((current) => (current === 3 ? 2 : 1));
            }}
            disabled={isSubmitting}
          >
            {step === 1 ? "취소" : "이전"}
          </Button>
          {step < 3 ? (
            step === 1 && !formValidity.hasCompletedBasicSequence ? null : (
              <Button
                size="sm"
                onClick={() => setStep((current) => (current === 1 ? 2 : 3))}
                disabled={
                  step === 1
                    ? !formValidity.hasCompletedBasicSequence
                    : !formValidity.hasItems || !hasValidSplitPaymentAmounts
                }
              >
                다음
              </Button>
            )
          ) : (
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={isSubmitting || !stampLog}
            >
              {isSubmitting ? "저장 중..." : "수정"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default StampLogEditModal;
