"use client";

import Button from "@/app/_components/Button";
import {
  BreathTypeEnum,
  BreathTypeEnumType,
  PaymentTypeEnum,
  PaymentTypeEnumType,
  StoreTypeEnum,
  StoreTypeEnumType,
} from "@/app/_enums/enums";
import {
  getCouponUsageNote,
  type StampLogMeta,
} from "@/app/_domains/_stamp/_services/stampService";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useModal } from "@/app/_contexts/ModalContext";
import StampLogForm, { StampLogValue } from "./StampLogForm";
import TargetCustomerCard from "./TargetCustomerCard";
import { getCustomerMode } from "@/app/_domains/_customer/_utils/specialCustomer";
import {
  ExistingCustomerMatch,
  findCustomersByNameAndPhoneLastDigits,
} from "@/app/_domains/_customer/_services/customerService";

const formatAmount = (value: number) => value.toLocaleString("ko-KR");

const getStampAmountFromAction = (action?: string) => {
  if (!action || action === "no-stamp") return 0;
  if (action.startsWith("add-")) {
    const amount = Number(action.replace("add-", ""));
    return Number.isFinite(amount) ? amount : 0;
  }
  return 0;
};

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

  const typedMemo = remark.match(
    /^(?:서비스|교환입고|교환출고)(?:,(.*)|\((.*)\))$/,
  );
  const displayMemo = typedMemo?.[1] ?? typedMemo?.[2];
  if (displayMemo) return displayMemo.trim();

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
  initialAction,
  initialPaymentType,
  initialStoreName,
  initialLogMeta,
  isStampAmountEditable = false,
  editTitle = "출고 이력 수정",
  onEditSubmit,
  onConfirm,
  onCancel,
}: {
  target: {
    name: string;
    phone: string;
    gender?: "male" | "female" | null;
    address?: string | null;
    note?: string | null;
    is_stamp_eligible?: boolean;
  };
  mode: "add" | "edit" | "adjust" | "use10";
  amount?: number;
  stampCount?: number;
  initialAction?: string;
  initialPaymentType?: PaymentTypeEnumType["value"];
  initialStoreName?: StoreTypeEnumType["value"];
  initialLogMeta?: StampLogMeta | null;
  isStampAmountEditable?: boolean;
  editTitle?: string;
  onEditSubmit?: (values: {
    note: string;
    paymentType?: PaymentTypeEnumType["value"];
    storeName: StoreTypeEnumType["value"];
    logMeta: StampLogMeta;
    amount: number;
  }) => Promise<void>;
  onConfirm: (
    note?: string,
    paymentType?: PaymentTypeEnumType["value"],
    amount?: number,
    logMeta?: StampLogMeta,
    adjustDirection?: "add" | "remove",
    isReservation?: boolean,
    targetCustomerId?: string,
    shouldAddStampForSelectedCustomer?: boolean,
  ) => Promise<void> | void;
  onCancel: () => void;
}) {
  const { setSize } = useModal();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const requestIdRef = useRef(crypto.randomUUID());
  const [showConfirm, setShowConfirm] = useState(false);

  const [note, setNote] = useState("");
  const [breathType, setBreathType] = useState<
    BreathTypeEnumType["value"] | ""
  >("");
  const [couponStoreName, setCouponStoreName] = useState<
    StoreTypeEnumType["value"]
  >(StoreTypeEnum.OVAPE.value);
  const [amount, setAmount] = useState<number>(
    amountProp ?? (mode === "adjust" || mode === "use10" ? 1 : 0),
  );
  const [adjustDirection, setAdjustDirection] = useState<"add" | "remove">(
    "remove",
  );
  const [stampLog, setStampLog] = useState<StampLogValue | null>(null);
  const initialReservationDate = initialLogMeta?.reservationDate?.trim() ?? "";
  const [shipmentTiming, setShipmentTiming] = useState<
    "immediate" | "reservation" | ""
  >(
    mode === "edit"
      ? initialReservationDate
        ? "reservation"
        : "immediate"
      : "",
  );
  const [reservationDate, setReservationDate] = useState(
    initialReservationDate,
  );
  const isReservation = shipmentTiming === "reservation";
  const hasSelectedShipmentTiming = shipmentTiming !== "";
  const [xCustomerName, setXCustomerName] = useState(
    initialLogMeta?.xCustomerName ?? "",
  );
  const [xPhoneLastDigits, setXPhoneLastDigits] = useState(
    initialLogMeta?.xPhoneLastDigits ?? "",
  );
  const isCustomerInfoDeclined =
    xCustomerName === "X" && xPhoneLastDigits === "X";
  const hasValidXPhoneLastDigits =
    xPhoneLastDigits === "X" || /^\d{4}$/.test(xPhoneLastDigits);
  const [customerMatches, setCustomerMatches] = useState<
    ExistingCustomerMatch[]
  >([]);
  const [selectedCustomer, setSelectedCustomer] =
    useState<ExistingCustomerMatch | null>(null);
  const [pendingCustomer, setPendingCustomer] =
    useState<ExistingCustomerMatch | null>(null);
  const [
    shouldAddStampForSelectedCustomer,
    setShouldAddStampForSelectedCustomer,
  ] = useState(false);
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
  const hasValidReservationDate =
    !isReservation || /^\d{1,2}\/\d{1,2}$/.test(reservationDate.trim());
  const hasValidSplitPaymentAmounts =
    !stampLog?.logMeta.payments?.length ||
    (stampLog.logMeta.payments.every((payment) => payment.amount >= 1) &&
      stampLog.logMeta.payments.reduce(
        (sum, payment) => sum + payment.amount,
        0,
      ) === stampLog.finalAmount);
  const customerMode = getCustomerMode(target.name, target.phone);
  const isAnonymousXCustomer =
    target.name.trim() === "X" && target.phone.trim() === "X";
  const requiresXCustomerInfo = isAnonymousXCustomer && !selectedCustomer;
  const usesStandardSalesFlow =
    customerMode === "normal" || customerMode === "x";
  const effectiveFormCustomerMode = selectedCustomer ? "normal" : customerMode;
  const canSelectedCustomerAccrueStamp =
    selectedCustomer?.is_stamp_eligible !== false;

  useEffect(() => {
    const hasSearchableName =
      xCustomerName.trim().length > 0 &&
      xCustomerName.trim().toUpperCase() !== "X";
    const hasSearchablePhone = /^\d{4}$/.test(xPhoneLastDigits);
    if (
      mode === "edit" ||
      !isAnonymousXCustomer ||
      (!hasSearchableName && !hasSearchablePhone)
    ) {
      setCustomerMatches([]);
      return;
    }

    let isActive = true;
    const timer = window.setTimeout(async () => {
      try {
        setIsSearchingCustomer(true);
        const matches = await findCustomersByNameAndPhoneLastDigits(
          xCustomerName,
          xPhoneLastDigits,
        );
        if (isActive) setCustomerMatches(matches);
      } catch {
        if (isActive) setCustomerMatches([]);
      } finally {
        if (isActive) setIsSearchingCustomer(false);
      }
    }, 300);

    return () => {
      isActive = false;
      window.clearTimeout(timer);
    };
  }, [mode, isAnonymousXCustomer, xCustomerName, xPhoneLastDigits]);

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
    if (mode !== "add" && mode !== "edit") return;
    setSize(
      addStep >= 2
        ? (customerMode === "adjustment" || customerMode === "demo") &&
          addStep === 3
          ? "max-w-4xl"
          : "max-w-6xl"
        : "max-w-2xl",
    );
  }, [mode, addStep, customerMode, setSize]);

  const title =
    mode === "add"
      ? customerMode === "adjustment"
        ? "재고조정 (입고 또는 출고)"
        : customerMode === "demo"
          ? "시연용 처리"
          : isReservation
            ? "출고 예약 추가"
            : "출고 이력 추가"
      : mode === "edit"
        ? customerMode === "adjustment"
          ? "재고조정 수정"
          : customerMode === "demo"
            ? "시연용 수정"
            : editTitle
        : mode === "adjust"
          ? "스탬프 조정"
          : "쿠폰 사용";

  const adjustActionLabel = adjustDirection === "add" ? "추가" : "차감";

  const labelTitle = "특이 사항";
  const labelText = " (조정 사유 입력)";

  const hasRequiredAdjustmentNote = mode !== "adjust" || note.trim().length > 0;
  const couponUsageNote =
    mode === "use10" && breathType
      ? `${
          breathType === BreathTypeEnum.MTL.value
            ? "입호흡"
            : breathType === BreathTypeEnum.DTL.value
              ? "폐호흡"
              : note.trim()
        } 쿠폰 ${amount}장 사용`.trim()
      : note;
  const isConfirmDisabled =
    (mode === "use10" &&
      (breathType === "" || amount < 1 || amount * 10 > stampCount)) ||
    !hasRequiredAdjustmentNote;

  const handleConfirm = async () => {
    if (submittingRef.current) return;
    if (!hasRequiredAdjustmentNote) {
      toast.error("특이사항을 입력해 주세요.");
      return;
    }

    try {
      submittingRef.current = true;
      setIsSubmitting(true);
      if (mode === "add" || mode === "edit") {
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
        const couponUseTag = stampLog.logMeta.couponUse
          ? getCouponUsageNote(stampLog.logMeta.couponUse)
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
        const itemNote =
          stampLog.logMeta.items
            ?.map((item) => item.lineText)
            .filter(Boolean)
            .join(", ") ?? stampLog.note;
        const transactionTags = [
          couponUseTag,
          discountTag,
          reservationTag,
          deliveryFeeTag,
          deliveryTypeTag,
        ].filter(Boolean);
        const nextNote =
          transactionTags.length > 0
            ? `(${transactionTags.join(",")})${itemNote ? ` ${itemNote}` : ""}`
            : itemNote;
        const nextLogMeta = {
          ...stampLog.logMeta,
          ...(mode === "add" ? { clientRequestId: requestIdRef.current } : {}),
          reservationDate: reservationTag ? reservationDate.trim() : undefined,
        };
        if (mode === "edit") {
          if (!onEditSubmit) return;
          await onEditSubmit({
            note: nextNote,
            paymentType: stampLog.paymentType,
            storeName: stampLog.storeName,
            logMeta: nextLogMeta,
            amount: stampLog.amount,
          });
        } else {
          await onConfirm(
            nextNote,
            stampLog.paymentType,
            stampLog.amount,
            nextLogMeta,
            undefined,
            isReservation,
            selectedCustomer?.id,
            selectedCustomer ? shouldAddStampForSelectedCustomer : undefined,
          );
        }
      } else if (mode === "adjust") {
        await onConfirm(note, undefined, amount, undefined, adjustDirection);
      } else {
        await onConfirm(
          couponUsageNote,
          PaymentTypeEnum.SHIPMENT_REMARK.value,
          amount,
          {
            storeName: couponStoreName,
          },
        );
      }
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const reservationToggle = (
    <div className="h-full">
      <div
        className={`grid items-center gap-[10px] ${
          isReservation ? "grid-cols-3" : "grid-cols-2"
        }`}
      >
        <Button
          type="button"
          size="sm"
          variant={shipmentTiming === "immediate" ? "primary" : "gray"}
          className="h-10 w-full rounded-lg py-0 sm:py-0"
          onClick={() => {
            setShipmentTiming("immediate");
            setReservationDate("");
          }}
        >
          즉시 출고
        </Button>
        <Button
          type="button"
          size="sm"
          variant={isReservation ? "primary" : "gray"}
          className="h-10 w-full rounded-lg py-0 sm:py-0"
          onClick={() => setShipmentTiming("reservation")}
        >
          예약 출고
        </Button>
        {isReservation && (
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
            className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm shadow-sm outline-none transition placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        )}
      </div>
    </div>
  );

  const xCustomerInfoFields = (
    <div className="h-full overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
      <div className="grid min-h-12 grid-cols-[72px_minmax(0,1fr)] items-stretch">
        <p className="flex items-center justify-center whitespace-nowrap border-r border-gray-200 px-2 text-center text-sm font-semibold text-gray-800">
          고객 정보
        </p>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_90px] items-center gap-1 p-1.5">
          <Button
            type="button"
            size="xs"
            variant={isCustomerInfoDeclined ? "primary" : "gray"}
            className="order-3 h-8 w-full whitespace-nowrap px-2"
            onClick={() => {
              setXCustomerName(isCustomerInfoDeclined ? "" : "X");
              setXPhoneLastDigits(isCustomerInfoDeclined ? "" : "X");
              setSelectedCustomer(null);
            }}
          >
            둘 다 제공 X
          </Button>
          <label className="order-1 min-w-0">
            <input
              type="text"
              aria-label="이름"
              value={xCustomerName}
              disabled={isCustomerInfoDeclined}
              onChange={(event) => {
                setXCustomerName(event.target.value);
                setSelectedCustomer(null);
              }}
              placeholder="이름 / 미제공 X"
              className="h-8 w-full rounded-lg border border-gray-300 bg-white px-2 text-xs font-medium text-gray-900 shadow-sm outline-none transition placeholder:font-normal placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
            />
          </label>
          <label className="order-2 min-w-0">
            <input
              type="text"
              aria-label="핸드폰 뒷번호"
              maxLength={4}
              value={xPhoneLastDigits}
              disabled={isCustomerInfoDeclined}
              onChange={(event) => {
                const value = event.target.value.toUpperCase();
                setXPhoneLastDigits(
                  value === "X" ? "X" : value.replace(/\D/g, "").slice(0, 4),
                );
                setSelectedCustomer(null);
              }}
              placeholder="뒷번호 / 미제공 X"
              className="h-8 w-full rounded-lg border border-gray-300 bg-white px-2 text-xs font-medium text-gray-900 shadow-sm outline-none transition placeholder:font-normal placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
            />
          </label>
        </div>
      </div>
      {isSearchingCustomer && (
        <p className="mx-2 mb-2 mt-1 text-xs text-gray-500">
          기존 고객을 확인하고 있습니다.
        </p>
      )}
      {!isSearchingCustomer && customerMatches.length > 0 && (
        <div className="mx-2 mb-2 mt-1 space-y-1.5 border-t border-gray-200 pt-2">
          <p className="text-xs font-semibold text-brand-700">
            일치하는 기존 고객이 있습니다.
          </p>
          {customerMatches.map((customer) => (
            <div
              key={customer.id}
              className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-2 text-xs"
            >
              <span className="min-w-0 truncate font-medium text-gray-700">
                {customer.name} · {customer.phone}
              </span>
              <Button
                type="button"
                size="xs"
                variant={
                  selectedCustomer?.id === customer.id ? "primary" : "gray"
                }
                onClick={() => setPendingCustomer(customer)}
              >
                {selectedCustomer?.id === customer.id
                  ? "변경됨"
                  : "이 고객으로 변경"}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ── 출고 이력 추가(mode === 'add') 전용 스텝 UI ──────────────────────────────
  const stepIndicator = (
    <div
      className={`flex shrink-0 items-start justify-center ${
        mode === "add" && customerMode === "normal" ? "mb-2.5" : "mb-5"
      }`}
    >
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
      {customerMode !== "demo" &&
        customerMode !== "adjustment" &&
        customerMode !== "x" &&
        ((mode !== "add" && mode !== "edit") || addStep === 1) && (
          <TargetCustomerCard
            name={selectedCustomer?.name ?? target.name}
            phone={selectedCustomer?.phone ?? target.phone}
            address={selectedCustomer?.address ?? target.address}
            note={selectedCustomer?.note ?? target.note}
            className="mr-1 mb-1 shrink-0"
            compact
          />
        )}

      {mode === "add" && customerMode === "x" && (
        <div className="mb-1 flex shrink-0 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50/70 px-4 py-2.5 text-sm font-semibold text-gray-700">
          <span className="h-2 w-2 shrink-0 rounded-full bg-brand-500" />
          <span>
            미적립 {target.gender === "female" ? "여자" : "남자"} 고객을 위한
            특수 계정입니다
          </span>
        </div>
      )}
      {mode === "add" &&
        (customerMode === "demo" || customerMode === "adjustment") && (
          <div className="mb-1 flex shrink-0 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50/70 px-4 py-2.5 text-sm font-semibold text-gray-700">
            <span className="h-2 w-2 shrink-0 rounded-full bg-brand-500" />
            <span>
              {customerMode === "demo"
                ? "시연용 처리를 위한 특수 계정입니다."
                : "재고조정을 위한 특수 계정입니다."}
            </span>
          </div>
        )}

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <StampLogForm
          initialValue={
            mode === "edit"
              ? {
                  paymentType: initialPaymentType,
                  storeName: initialStoreName ?? StoreTypeEnum.OVAPE.value,
                  amount: getStampAmountFromAction(initialAction),
                  logMeta: initialLogMeta,
                }
              : undefined
          }
          isEditMode={mode === "edit"}
          layout="split"
          step={addStep}
          onChange={setStampLog}
          onValidityChange={setFormValidity}
          reservationSlot={
            requiresXCustomerInfo ? xCustomerInfoFields : undefined
          }
          stepOneReservationSlot={
            customerMode === "x" ? undefined : reservationToggle
          }
          hasSelectedShipmentTiming={
            customerMode === "x" || hasSelectedShipmentTiming
          }
          xCustomerName={xCustomerName}
          xPhoneLastDigits={xPhoneLastDigits}
          customerMode={effectiveFormCustomerMode}
          isStampAmountEditable={
            effectiveFormCustomerMode !== "x" &&
            canSelectedCustomerAccrueStamp &&
            (mode !== "edit" || isStampAmountEditable)
          }
          currentStampCount={stampCount}
          customerAddress={target.address}
          compactStepOneSpacing={customerMode === "normal"}
          customerSummary={
            customerMode === "demo" ||
            customerMode === "adjustment" ||
            customerMode === "x"
              ? undefined
              : {
                  name: selectedCustomer?.name ?? target.name,
                  phone: selectedCustomer?.phone ?? target.phone,
                  address: selectedCustomer?.address ?? target.address,
                  note: selectedCustomer?.note ?? target.note,
                }
          }
        />

        {addStep === 3 && (
          <div className="mt-2.5 flex flex-col gap-2.5">
            {stampLog && usesStandardSalesFlow && (
              <>
                <div
                  className={`grid grid-cols-2 gap-2.5 ${
                    requiresXCustomerInfo
                      ? "md:grid-cols-[0.5fr_0.5fr_0.5fr_0.5fr_0.67fr_1.33fr]"
                      : stampLog.couponUse
                        ? "md:grid-cols-[3.75fr_3fr_3fr_3fr_3fr_4fr_11fr]"
                        : "md:grid-cols-[3.75fr_3fr_3fr_3fr_4fr_14fr]"
                  }`}
                >
                  {[
                    ...(requiresXCustomerInfo
                      ? [
                          { label: "이름", value: xCustomerName.trim() },
                          {
                            label: "핸드폰 뒷번호",
                            value: xPhoneLastDigits.trim(),
                          },
                        ]
                      : [
                          {
                            label: "출고 방식",
                            value: isReservation
                              ? `${reservationDate} 예약 출고`
                              : "즉시 출고",
                          },
                        ]),
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
                    ...(requiresXCustomerInfo
                      ? []
                      : [
                          {
                            label: "스탬프 적립",
                            value:
                              stampLog.amount === 0
                                ? "미적립"
                                : `${stampLog.amount}개`,
                          },
                          ...(stampLog.couponUse
                            ? [
                                {
                                  label: "쿠폰 사용",
                                  value: `${stampLog.couponUse.quantity}장`,
                                },
                              ]
                            : []),
                        ]),
                    {
                      label: "결제 정보",
                      value: stampLog.logMeta.payments?.length
                        ? stampLog.logMeta.payments
                            .map((payment) => payment.paymentTypeName)
                            .join(" · ")
                        : stampLog.paymentTypeName,
                    },
                    {
                      label: "출고 메모",
                      value: stampLog.logMeta.extraNote || "없음",
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

                {stampLog.logMeta.deliveryMethod !== "store_visit" && (
                  <div className="grid grid-cols-1 gap-2.5 md:grid-cols-4">
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
                    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 md:col-span-2">
                      <p className="text-xs font-medium text-gray-500">
                        배송 주소
                      </p>
                      <p className="mt-1 break-words text-sm text-gray-800">
                        {stampLog.logMeta.deliveryAddress}
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}

            {stampLog &&
              (customerMode === "adjustment" || customerMode === "demo") && (
                <div className="grid grid-cols-[25%_minmax(0,1fr)] overflow-hidden rounded-lg border border-gray-200 bg-white">
                  <p className="flex items-center border-r border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-800">
                    {customerMode === "adjustment"
                      ? "재고조정 전체 특이사항"
                      : "시연용 전체 특이사항"}
                  </p>
                  <p className="flex min-w-0 items-center whitespace-pre-wrap break-words px-3 py-2 text-sm text-gray-800 [overflow-wrap:anywhere]">
                    {stampLog.logMeta.extraNote?.trim() || "없음"}
                  </p>
                </div>
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
                <table
                  className={`w-full table-fixed text-sm ${
                    customerMode === "adjustment" || customerMode === "demo"
                      ? "min-w-[520px]"
                      : "min-w-[760px]"
                  }`}
                >
                  <thead className="bg-gray-50 text-xs font-semibold text-gray-600">
                    <tr className="border-b border-gray-200">
                      <th className="w-[6%] px-2 py-2 text-center">번호</th>
                      <th
                        className={`${customerMode === "adjustment" ? "w-[47%]" : "w-[33%]"} px-2 py-2 text-left`}
                      >
                        품목명
                      </th>
                      <th className="w-[13%] px-2 py-2 text-center">
                        품목종류
                      </th>
                      <th className="w-[13%] px-2 py-2 text-center">
                        출고 유형
                      </th>
                      <th className="w-[8%] px-2 py-2 text-center">수량</th>
                      {customerMode !== "adjustment" &&
                        customerMode !== "demo" && (
                          <>
                            <th className="w-[13%] px-2 py-2 text-right">
                              단가
                            </th>
                            <th className="w-[14%] px-3 py-2 text-right">
                              소계
                            </th>
                          </>
                        )}
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
                          {customerMode !== "adjustment" &&
                            customerMode !== "demo" && (
                              <>
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
                              </>
                            )}
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

      <div
        className={`${addStep === 2 ? "mt-2" : addStep === 3 ? "mt-2.5" : "mt-4"} flex shrink-0 flex-col gap-4 border-t border-gray-200 pt-4 lg:flex-row lg:items-center lg:justify-between`}
      >
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
                    ? !formValidity.hasCompletedBasicSequence ||
                      (usesStandardSalesFlow &&
                        customerMode !== "x" &&
                        !hasSelectedShipmentTiming)
                    : !formValidity.hasItems || !hasValidSplitPaymentAmounts
                }
                onClick={() => {
                  if (
                    addStep === 1 &&
                    usesStandardSalesFlow &&
                    customerMode !== "x" &&
                    !hasSelectedShipmentTiming
                  ) {
                    toast.error("즉시 출고 또는 예약 출고를 선택해 주세요.");
                    return;
                  }
                  if (addStep === 1 && !hasValidReservationDate) {
                    toast.error("예약 날짜를 7/19 형식으로 입력해 주세요.");
                    return;
                  }
                  if (addStep === 2 && !hasValidReservationDate) {
                    toast.error("예약 날짜를 7/19 형식으로 입력해 주세요.");
                    return;
                  }
                  if (
                    addStep === 2 &&
                    requiresXCustomerInfo &&
                    !isCustomerInfoDeclined &&
                    (!xCustomerName.trim() || !hasValidXPhoneLastDigits)
                  ) {
                    toast.error(
                      "이름과 뒷번호를 입력해 주세요.\n미제공 정보만 X를 입력하거나\n‘둘 다 제공 X’를 선택할 수 있습니다.",
                      { style: { whiteSpace: "pre-line" } },
                    );
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
              {isSubmitting
                ? mode === "edit"
                  ? "저장 중..."
                  : "처리 중..."
                : mode === "edit"
                  ? "수정"
                  : "확인"}
            </Button>
          )}
        </div>
      </div>
      {pendingCustomer && (
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-xl bg-gray-900/25 p-4">
          <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900">
              {pendingCustomer.is_stamp_eligible === false
                ? "미적립 대상 고객입니다."
                : "스탬프를 추가하시겠습니까?"}
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              {pendingCustomer.name} · {pendingCustomer.phone} 고객으로
              변경합니다.
            </p>
            <div
              className={`mt-5 grid gap-2 ${
                pendingCustomer.is_stamp_eligible === false
                  ? "grid-cols-2"
                  : "grid-cols-3"
              }`}
            >
              <Button
                type="button"
                variant="gray"
                onClick={() => setPendingCustomer(null)}
              >
                취소
              </Button>
              <Button
                type="button"
                variant="gray"
                onClick={() => {
                  setSelectedCustomer(pendingCustomer);
                  setShouldAddStampForSelectedCustomer(false);
                  setPendingCustomer(null);
                  setAddStep(2);
                }}
              >
                미적립
              </Button>
              {pendingCustomer.is_stamp_eligible !== false && (
                <Button
                  type="button"
                  onClick={() => {
                    setSelectedCustomer(pendingCustomer);
                    setShouldAddStampForSelectedCustomer(true);
                    setPendingCustomer(null);
                    setAddStep(1);
                  }}
                >
                  적립
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (mode === "add" || mode === "edit") {
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
              <p className="text-base font-semibold text-gray-900">
                {amount}장 · {(amount * 10).toLocaleString()}개 차감
              </p>
            </div>
          )}
          {(mode === "use10" ? couponUsageNote : note) && (
            <div>
              <span className="text-sm font-medium text-gray-600">메모:</span>
              <p className="text-sm text-gray-900 whitespace-pre-wrap">
                {mode === "use10" ? couponUsageNote : note}
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
            <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-3">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800">
                    쿠폰 사용 수량
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    aria-label="쿠폰 사용 수량 감소"
                    onClick={() => setAmount((value) => Math.max(1, value - 1))}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-lg leading-none text-gray-600 shadow-sm transition-colors hover:bg-gray-50 active:bg-gray-100"
                  >
                    −
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label="쿠폰 사용 수량"
                    value={amount}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value === "" || /^[0-9]+$/.test(value)) {
                        setAmount(
                          value === "" ? 1 : Math.max(1, Number(value)),
                        );
                      }
                    }}
                    className="h-9 w-14 rounded-lg border border-gray-300 bg-white px-2 text-center text-sm font-semibold text-gray-900 shadow-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  />
                  <button
                    type="button"
                    aria-label="쿠폰 사용 수량 증가"
                    onClick={() => setAmount((value) => value + 1)}
                    disabled={(amount + 1) * 10 > stampCount}
                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-lg leading-none text-white shadow-sm transition-colors hover:bg-brand-600 active:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center overflow-hidden rounded-lg border border-brand-100 bg-white px-3 py-2.5 text-center">
                <div>
                  <p className="text-[11px] font-medium text-gray-500">
                    현재 스탬프
                  </p>
                  <p className="mt-0.5 text-base font-bold text-gray-900">
                    {stampCount.toLocaleString()}개
                  </p>
                </div>
                <span className="px-2 text-base text-gray-300">−</span>
                <div>
                  <p className="text-[11px] font-medium text-gray-500">차감</p>
                  <p className="mt-0.5 text-base font-bold text-brand-600">
                    {(amount * 10).toLocaleString()}개
                  </p>
                </div>
                <span className="px-2 text-base text-gray-300">=</span>
                <div>
                  <p className="text-[11px] font-medium text-gray-500">
                    사용 후 잔여
                  </p>
                  <p className="mt-0.5 text-base font-bold text-gray-900">
                    {(stampCount - amount * 10).toLocaleString()}개
                  </p>
                </div>
              </div>
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
              <span className="mb-2 block text-sm font-medium text-gray-700">
                매장명
              </span>
              <div className="mb-5 grid grid-cols-2 gap-[10px]">
                {Object.values(StoreTypeEnum).map((store) => (
                  <Button
                    key={store.value}
                    type="button"
                    size="sm"
                    variant={
                      couponStoreName === store.value ? "primary" : "gray"
                    }
                    onClick={() => setCouponStoreName(store.value)}
                  >
                    {store.name}
                  </Button>
                ))}
              </div>
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
                    setNote("");
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
                    setNote("");
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
