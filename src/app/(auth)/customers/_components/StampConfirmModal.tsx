"use client";

import Button from "@/app/_components/Button";
import {
  BreathTypeEnum,
  BreathTypeEnumType,
  PaymentTypeEnumType,
} from "@/app/_enums/enums";
import type { StampLogMeta } from "@/app/_domains/_stamp/_services/stampService";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useModal } from "@/app/_contexts/ModalContext";
import StampLogForm, { StampLogValue } from "./StampLogForm";
import TargetCustomerCard from "./TargetCustomerCard";
import { getCustomerMode } from "@/app/_domains/_customer/_utils/specialCustomer";

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

const addStepLabels = ["기본 정보", "품목 · 금액", "최종 확인"] as const;

export default function StampConfirmModal({
  target,
  mode,
  amount: amountProp,
  stampCount = 0,
  onConfirm,
  onCancel,
}: {
  target: {
    name: string;
    phone: string;
    address?: string | null;
    note?: string | null;
    is_stamp_eligible?: boolean;
  };
  mode: "add" | "adjust" | "use10";
  amount?: number;
  stampCount?: number;
  onConfirm: (
    note?: string,
    paymentType?: PaymentTypeEnumType["value"],
    amount?: number,
    logMeta?: StampLogMeta,
    adjustDirection?: "add" | "remove",
    isReservation?: boolean,
  ) => Promise<void> | void;
  onCancel: () => void;
}) {
  const { setSize } = useModal();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [note, setNote] = useState("");
  const [breathType, setBreathType] = useState<
    BreathTypeEnumType["value"] | ""
  >("");
  const [amount, setAmount] = useState<number>(
    amountProp ?? (mode === "adjust" ? 1 : 0),
  );
  const [adjustDirection, setAdjustDirection] = useState<"add" | "remove">(
    "remove",
  );
  const [stampLog, setStampLog] = useState<StampLogValue | null>(null);
  const [isReservation, setIsReservation] = useState(false);
  const [reservationDate, setReservationDate] = useState("");
  const hasValidReservationDate =
    !isReservation || /^\d{1,2}\/\d{1,2}$/.test(reservationDate.trim());
  const hasValidSplitPaymentAmounts =
    !stampLog?.logMeta.payments?.length ||
    (stampLog.logMeta.payments.every((payment) => payment.amount >= 1) &&
      stampLog.logMeta.payments.reduce(
        (sum, payment) => sum + payment.amount,
        0,
      ) === stampLog.finalAmount);
  const customerMode = getCustomerMode(
    target.name,
    target.phone,
    target.is_stamp_eligible ?? true,
  );
  const usesStandardSalesFlow =
    customerMode === "normal" || customerMode === "x";

  // 출고 이력 추가(mode === 'add') 전용 스텝 상태
  const [addStep, setAddStep] = useState<1 | 2 | 3>(
    usesStandardSalesFlow ? 1 : 2,
  );
  const [formValidity, setFormValidity] = useState({
    hasPaymentType: false,
    hasItems: false,
    hasDeliveryInfo: true,
    hasCompletedBasicSequence: false,
  });

  // 품목·금액과 최종 확인은 좌우 2단으로 보여줘야 해서 모달을 더 넓게
  useEffect(() => {
    if (mode !== "add") return;
    setSize(
      !usesStandardSalesFlow && addStep === 3
        ? "max-w-xl"
        : addStep >= 2
          ? "max-w-6xl"
          : "max-w-2xl",
    );
  }, [mode, addStep, usesStandardSalesFlow, setSize]);

  const title =
    mode === "add"
      ? customerMode === "adjustment"
        ? "재고조정 (입고 또는 출고)"
        : isReservation
          ? "출고 예약 추가"
          : "출고 이력 추가"
      : mode === "adjust"
        ? "스탬프 조정"
        : "쿠폰 사용";

  const adjustActionLabel = adjustDirection === "add" ? "추가" : "차감";

  const labelTitle = "특이 사항";
  const labelText = " (조정 사유 입력)";

  const hasRequiredAdjustmentNote = mode !== "adjust" || note.trim().length > 0;
  const isConfirmDisabled =
    (mode === "use10" && breathType === "") || !hasRequiredAdjustmentNote;

  const handleConfirm = async () => {
    if (!hasRequiredAdjustmentNote) {
      toast.error("특이사항을 입력해 주세요.");
      return;
    }

    try {
      setIsSubmitting(true);
      if (mode === "add") {
        if (!stampLog) return;
        if (!hasValidReservationDate) {
          toast.error("예약 날짜를 7/19 형식으로 입력해 주세요.");
          return;
        }
        const reservationTag =
          isReservation && reservationDate.trim()
            ? `${reservationDate.trim()} 예약주문`
            : "";
        const discountTag = stampLog.logMeta.discount
          ? `${stampLog.logMeta.discount.name}할인${stampLog.logMeta.discount.amount}`
          : "";
        const deliveryFeeTag =
          (stampLog.logMeta.deliveryFee ?? 0) > 0
            ? `${
                stampLog.logMeta.deliveryMethod === "parcel" &&
                stampLog.logMeta.parcelCarrier?.trim()
                  ? `${stampLog.logMeta.parcelCarrier.trim()}택배`
                  : stampLog.logMeta.deliveryMethod === "delivery"
                    ? "배달대행비"
                    : "택배비"
              }${stampLog.logMeta.deliveryFee}`
            : "";
        const deliveryTypeTag =
          stampLog.logMeta.deliveryMethod !== "delivery"
            ? ""
            : stampLog.logMeta.deliveryType === "self"
              ? "자체배달"
              : stampLog.logMeta.deliveryType === "customer_quick"
                ? "손님이 퀵부르심"
                : "";
        const hasSavedTransactionTags = Boolean(
          discountTag || deliveryFeeTag || deliveryTypeTag,
        );
        const transactionCloseIndex = hasSavedTransactionTags
          ? stampLog.note.indexOf(")")
          : -1;
        const itemNote =
          transactionCloseIndex >= 0
            ? stampLog.note.slice(transactionCloseIndex + 1).trimStart()
            : stampLog.note;
        const transactionTags = [
          discountTag,
          reservationTag,
          deliveryFeeTag,
          deliveryTypeTag,
        ].filter(Boolean);
        const nextNote =
          transactionTags.length > 0
            ? `${transactionTags.join(",")})${itemNote ? ` ${itemNote}` : ""}`
            : itemNote;
        await onConfirm(
          nextNote,
          stampLog.paymentType,
          stampLog.amount,
          {
            ...stampLog.logMeta,
            reservationDate: reservationTag
              ? reservationDate.trim()
              : undefined,
          },
          undefined,
          isReservation,
        );
      } else if (mode === "adjust") {
        await onConfirm(note, undefined, amount, undefined, adjustDirection);
      } else {
        await onConfirm(note);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const reservationToggle = (
    <div className="h-full rounded-lg border border-gray-200 bg-gray-50 p-3">
      <p className="mb-2 text-sm font-semibold text-gray-800">출고 방식</p>
      <div className="grid grid-cols-[minmax(0,1fr)_110px] items-center gap-2">
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            size="sm"
            variant={!isReservation ? "primary" : "gray"}
            className="rounded-lg"
            onClick={() => {
              setIsReservation(false);
              setReservationDate("");
            }}
          >
            즉시 출고
          </Button>
          <Button
            type="button"
            size="sm"
            variant={isReservation ? "primary" : "gray"}
            className="rounded-lg"
            onClick={() => setIsReservation(true)}
          >
            예약 출고
          </Button>
        </div>
        {isReservation ? (
          <input
            type="text"
            inputMode="numeric"
            value={reservationDate}
            onChange={(event) => {
              const value = event.target.value;
              if (/^[0-9/]*$/.test(value) && value.length <= 5) {
                setReservationDate(value);
              }
            }}
            placeholder="ex) 7/19"
            aria-label="예약 출고 날짜"
            className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none transition placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        ) : (
          <div aria-hidden="true" className="h-11" />
        )}
      </div>
    </div>
  );

  // ── 출고 이력 추가(mode === 'add') 전용 스텝 UI ──────────────────────────────
  const stepIndicator = (
    <div className="mb-5 flex items-start justify-center shrink-0">
      {(usesStandardSalesFlow
        ? addStepLabels.map((label, idx) => ({
            label,
            step: (idx + 1) as 1 | 2 | 3,
          }))
        : [
            { label: "품목 · 금액", step: 2 as const },
            { label: "최종 확인", step: 3 as const },
          ]
      ).map(({ label, step: stepNumber }, idx, visibleSteps) => {
        const isActive = addStep === stepNumber;
        const isDone = addStep > stepNumber;
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
                {isDone ? "✓" : usesStandardSalesFlow ? stepNumber : idx + 1}
              </div>
              <span
                className={`text-[11px] font-medium whitespace-nowrap ${
                  isActive || isDone ? "text-brand-700" : "text-gray-400"
                }`}
              >
                {label}
              </span>
            </div>
            {idx < visibleSteps.length - 1 && (
              <div
                className={`mt-4 h-0.5 w-8 rounded-full transition-colors sm:w-12 ${
                  isDone ? "bg-brand-500" : "bg-gray-200"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );

  const addModeContent = (
    <div className="relative w-full max-h-[calc(90vh-2rem)] min-h-0 flex flex-col">
      <button
        type="button"
        onClick={onCancel}
        disabled={isSubmitting}
        aria-label="닫기"
        className="absolute right-0 top-0 flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
      >
        ✕
      </button>

      <h2 className="text-xl font-semibold text-gray-900 mb-4 pr-8 shrink-0">
        {title}
      </h2>

      {stepIndicator}

      {/* 대상 고객: 모든 스텝에서 고정 노출 */}
      {!(!usesStandardSalesFlow && addStep === 3) && (
        <TargetCustomerCard
          name={target.name}
          phone={target.phone}
          address={target.address}
          note={target.note}
          className="mr-1 mb-4 shrink-0"
        />
      )}

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <StampLogForm
          layout="split"
          step={addStep}
          onChange={setStampLog}
          onValidityChange={setFormValidity}
          reservationSlot={reservationToggle}
          customerMode={customerMode}
          isStampAmountEditable={customerMode !== "x"}
          currentStampCount={stampCount}
          customerAddress={target.address}
        />

        {addStep === 3 && (
          <div className="space-y-4">
            {stampLog && usesStandardSalesFlow && (
              <>
                <div
                  className={`grid grid-cols-2 gap-2 ${
                    customerMode === "x" ? "md:grid-cols-4" : "md:grid-cols-5"
                  }`}
                >
                  {[
                    {
                      label: "출고 방식",
                      value: isReservation
                        ? `${reservationDate} 예약 출고`
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
                              : stampLog.logMeta.deliveryType ===
                                  "customer_quick"
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
                      <p className="text-xs font-medium text-gray-500">
                        배송 주소
                      </p>
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
                    <p className="text-xs font-medium text-gray-500">
                      출고 메모
                    </p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-800">
                      {stampLog.logMeta.extraNote || "없음"}
                    </p>
                  </div>
                </div>
              </>
            )}

            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <div className="flex items-center gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3">
                <h3 className="text-sm font-semibold text-gray-900">
                  품목 목록
                </h3>
                <span className="text-xs text-gray-500">
                  {
                    new Set(
                      stampLog?.logMeta.items?.map((item) => item.itemId) ?? [],
                    ).size
                  }
                  종 · 총{" "}
                  {stampLog?.logMeta.items?.reduce(
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
                    {stampLog?.logMeta.items?.map((item, index) => {
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
        {addStep === 2 && usesStandardSalesFlow && stampLog ? (
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
        ) : addStep === 3 && usesStandardSalesFlow && stampLog ? (
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

        <div className="flex shrink-0 items-center justify-end gap-3">
          {addStep > 1 && (
            <Button
              variant="gray"
              size="sm"
              onClick={() => {
                if (addStep === 3) setAddStep(2);
                else if (usesStandardSalesFlow) setAddStep(1);
                else onCancel();
              }}
              disabled={isSubmitting}
            >
              이전
            </Button>
          )}
          {addStep < 3 ? (
            addStep === 1 && !formValidity.hasCompletedBasicSequence ? null : (
              <Button
                size="sm"
                disabled={
                  addStep === 1
                    ? !formValidity.hasCompletedBasicSequence
                    : !formValidity.hasItems || !hasValidSplitPaymentAmounts
                }
                onClick={() => {
                  if (addStep === 2 && !hasValidReservationDate) {
                    toast.error("예약 날짜를 7/19 형식으로 입력해 주세요.");
                    return;
                  }
                  if (addStep === 2 && stampLog?.logMeta.payments?.length) {
                    if (
                      stampLog.logMeta.payments.some(
                        (payment) => payment.amount < 1,
                      )
                    ) {
                      toast.error(
                        "선택한 모든 결제방식에 1원 이상 입력해 주세요.",
                      );
                      return;
                    }
                    const splitTotal = stampLog.logMeta.payments.reduce(
                      (sum, payment) => sum + payment.amount,
                      0,
                    );
                    if (splitTotal !== stampLog.finalAmount) {
                      toast.error(
                        `분할결제 합계 ${formatAmount(splitTotal)}원과 결제금액 ${formatAmount(stampLog.finalAmount)}원이 일치해야 합니다.`,
                      );
                      return;
                    }
                  }
                  setAddStep((s) => (s === 1 ? 2 : 3));
                }}
              >
                다음
              </Button>
            )
          ) : (
            <Button
              size="sm"
              disabled={!stampLog || isSubmitting}
              onClick={handleConfirm}
            >
              {isSubmitting ? "처리 중..." : "확인"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  if (mode === "add") {
    return addModeContent;
  }

  const confirmContent = (
    <div className="w-full flex flex-col min-h-0 max-h-[calc(90vh-2rem)]">
      <h2 className="text-xl font-semibold text-gray-900 mb-4 shrink-0">
        {title} 확인
      </h2>

      {/* 대상 고객: 스크롤 영역 밖에 고정 */}
      <TargetCustomerCard
        name={target.name}
        phone={target.phone}
        address={target.address}
        note={target.note}
        className="shrink-0 mb-4"
      />

      <div className="overflow-y-auto min-h-0 flex-1 space-y-4">
        {/* 요약 정보 */}
        <div className="bg-brand-50 rounded-lg p-4 border border-brand-200 space-y-2">
          {mode === "adjust" && (
            <div>
              <span className="text-sm font-medium text-gray-600">
                {adjustActionLabel} 개수:
              </span>
              <p className="text-base font-semibold text-gray-900">
                {amount}개
              </p>
            </div>
          )}
          {mode === "use10" && (
            <div>
              <span className="text-sm font-medium text-gray-600">
                쿠폰 사용:
              </span>
              <p className="text-base font-semibold text-gray-900">10개 차감</p>
            </div>
          )}
          {note && (
            <div>
              <span className="text-sm font-medium text-gray-600">메모:</span>
              <p className="text-sm text-gray-900 whitespace-pre-wrap">
                {note}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 mt-4 shrink-0">
        <Button
          variant="gray"
          size="sm"
          onClick={() => setShowConfirm(false)}
          disabled={isSubmitting}
        >
          수정
        </Button>
        <Button size="sm" onClick={handleConfirm} disabled={isSubmitting}>
          {isSubmitting ? "처리 중..." : "확인"}
        </Button>
      </div>
    </div>
  );

  // ── 입력 화면 (조정 / 쿠폰 사용) ────────────────────────────────────────────
  return (
    <>
      <div
        className={`w-full max-h-[calc(90vh-2rem)] min-h-0 flex-col ${
          showConfirm ? "hidden" : "flex"
        }`}
      >
        <div className="shrink-0 mb-4">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">{title}</h2>

          <TargetCustomerCard
            name={target.name}
            phone={target.phone}
            address={target.address}
            note={target.note}
            className="mb-4"
          />

          {mode === "use10" && (
            <div className="text-center py-4">
              <p className="text-gray-700 text-base leading-relaxed">
                쿠폰을 사용 처리 하시겠습니까? (10개 차감)
              </p>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {mode === "adjust" && (
            <div className="mb-4">
              <span className="block text-sm font-medium text-gray-700 mb-2">
                조정 유형 <span className="text-rose-600">*</span>
              </span>
              <div className="grid grid-cols-2 gap-2 mb-4">
                <Button
                  type="button"
                  size="sm"
                  variant={adjustDirection === "remove" ? "primary" : "gray"}
                  onClick={() => setAdjustDirection("remove")}
                >
                  차감
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={adjustDirection === "add" ? "primary" : "gray"}
                  onClick={() => setAdjustDirection("add")}
                >
                  추가
                </Button>
              </div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {adjustActionLabel} 개수{" "}
                <span className="text-rose-600">*</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "" || /^[0-9]+$/.test(v)) {
                      setAmount(v === "" ? 1 : Math.max(1, Number(v)));
                    }
                  }}
                  className="w-16 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm text-center"
                />
                <button
                  type="button"
                  onClick={() => setAmount((v) => Math.max(1, v - 1))}
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
            </div>
          )}

          {mode === "use10" && (
            <div className="mb-6">
              <span className="block text-sm font-medium text-gray-700 mb-3">
                쿠폰 사용 유형
              </span>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  size="sm"
                  variant={
                    breathType === BreathTypeEnum.MTL.value
                      ? "primary"
                      : "tertiary"
                  }
                  className="flex-1 text-center"
                  onClick={() => {
                    setBreathType(BreathTypeEnum.MTL.value);
                    setNote("입호흡 쿠폰 사용");
                  }}
                >
                  입호흡
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={
                    breathType === BreathTypeEnum.DTL.value
                      ? "primary"
                      : "tertiary"
                  }
                  className="flex-1 text-center"
                  onClick={() => {
                    setBreathType(BreathTypeEnum.DTL.value);
                    setNote("폐호흡 쿠폰 사용");
                  }}
                >
                  폐호흡
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={
                    breathType === BreathTypeEnum.CUSTOM.value
                      ? "primary"
                      : "tertiary"
                  }
                  className="flex-1 text-center"
                  onClick={() => {
                    setBreathType(BreathTypeEnum.CUSTOM.value);
                    setNote("");
                  }}
                >
                  직접 입력
                </Button>
              </div>

              {breathType !== BreathTypeEnum.CUSTOM.value && (
                <p className="mt-2 text-xs text-gray-500">
                  사용 유형을 선택하면 메모가 자동으로 입력됩니다.
                </p>
              )}
              {breathType === BreathTypeEnum.CUSTOM.value && (
                <div className="mt-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    메모 직접 입력
                  </label>
                  <span className="text-xs text-gray-500 whitespace-pre-line">
                    (예: [액상 이름] [30/60]ml [숫자] 병, 쿠폰 사용)
                  </span>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-colors text-xs"
                    placeholder="위에 해당되는 내용을 입력해주세요."
                  />
                </div>
              )}
            </div>
          )}

          {mode === "adjust" && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {labelTitle}
                <span className="ml-1 text-rose-600">*</span>
                <span className="text-xs text-gray-500 whitespace-pre-line">
                  {labelText}
                </span>
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-colors text-xs"
                placeholder="위에 해당되는 내용을 입력해주세요."
              />
            </div>
          )}
        </div>

        <div className="shrink-0 flex justify-end items-center gap-3 pt-4 mt-4 border-t border-gray-200">
          <Button variant="gray" size="sm" onClick={onCancel}>
            취소
          </Button>
          <Button
            disabled={isConfirmDisabled}
            onClick={() => setShowConfirm(true)}
            size="sm"
          >
            확인
          </Button>
        </div>
      </div>
      {showConfirm && confirmContent}
    </>
  );
}
