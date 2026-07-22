"use client";

import Button from "@/app/_components/Button";
import {
  BreathTypeEnum,
  BreathTypeEnumType,
  PaymentTypeEnumType,
} from "@/app/_enums/enums";
import type { StampLogMeta } from "@/app/_domains/_stamp/_services/stampService";
import { useEffect, useState } from "react";
import { useModal } from "@/app/_contexts/ModalContext";
import StampLogForm, { StampLogValue } from "./StampLogForm";
import TargetCustomerCard from "./TargetCustomerCard";

const formatAmount = (value: number) => value.toLocaleString("ko-KR");

const addStepLabels = ["기본 정보", "품목 · 금액", "최종 확인"] as const;

export default function StampConfirmModal({
  target,
  mode,
  amount: amountProp,
  onConfirm,
  onCancel,
}: {
  target: { name: string; phone: string; note?: string | null };
  mode: "add" | "adjust" | "use10";
  amount?: number;
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
  const customerMode =
    target.name.trim() === "시연용"
      ? "demo"
      : target.name.trim() === "재고조정"
        ? "adjustment"
        : "normal";

  // 출고 이력 추가(mode === 'add') 전용 스텝 상태
  const [addStep, setAddStep] = useState<1 | 2 | 3>(
    customerMode === "normal" ? 1 : 2,
  );
  const [formValidity, setFormValidity] = useState({
    hasPaymentType: false,
    hasItems: false,
  });

  // 품목·금액과 최종 확인은 좌우 2단으로 보여줘야 해서 모달을 더 넓게
  useEffect(() => {
    if (mode !== "add") return;
    setSize(
      customerMode !== "normal" && addStep === 3
        ? "max-w-xl"
        : addStep >= 2
          ? "max-w-5xl"
          : "max-w-xl",
    );
  }, [mode, addStep, customerMode, setSize]);

  const title =
    mode === "add"
      ? customerMode === "adjustment"
        ? "재고조정 (입고 또는 출고처리)"
        : isReservation
          ? "출고 예약 추가"
          : "출고 이력 추가"
      : mode === "adjust"
        ? "스탬프 조정"
        : "쿠폰 사용";

  const adjustActionLabel = adjustDirection === "add" ? "추가" : "차감";

  const labelTitle = "특이 사항";
  const labelText = " (조정 사유 입력)";

  const isConfirmDisabled = mode === "use10" && breathType === "";

  const handleConfirm = async () => {
    try {
      setIsSubmitting(true);
      if (mode === "add") {
        if (!stampLog) return;
        await onConfirm(
          stampLog.note,
          stampLog.paymentType,
          stampLog.amount,
          stampLog.logMeta,
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
    <div className="flex h-full items-center justify-between gap-3 rounded-lg border border-brand-200 bg-brand-50/60 px-4 py-3">
      <div>
        <p className="text-sm font-medium text-gray-800">출고 예약</p>
        <p className="mt-0.5 text-xs text-gray-500">
          예약으로 저장하면 스탬프는 적립되지 않고, 예약 이력에서 확정 시 출고
          이력으로 반영됩니다.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={isReservation}
        onClick={() => setIsReservation((v) => !v)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          isReservation ? "bg-brand-500" : "bg-gray-300"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
            isReservation ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );

  // ── 출고 이력 추가(mode === 'add') 전용 스텝 UI ──────────────────────────────
  const stepIndicator = (
    <div className="mb-5 flex items-start justify-center shrink-0">
      {(customerMode === "normal"
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
                {isDone
                  ? "✓"
                  : customerMode === "normal"
                    ? stepNumber
                    : idx + 1}
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
      {!(customerMode !== "normal" && addStep === 3) && (
        <TargetCustomerCard
          name={target.name}
          phone={target.phone}
          note={target.note}
          className="shrink-0 mb-4"
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
        />

        {addStep === 3 && (
          <div className="space-y-3">
            {isReservation && (
              <div className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                예약 이력으로 저장됩니다
              </div>
            )}
            <div
              className={`grid grid-cols-1 gap-4 ${customerMode === "normal" ? "lg:grid-cols-2 lg:items-start" : ""}`}
            >
              {customerMode === "normal" && (
                <div className="bg-brand-50 rounded-lg p-4 border border-brand-200 space-y-2">
                  {stampLog && (
                    <>
                      <div>
                        <span className="text-sm font-medium text-gray-600">
                          매장:
                        </span>
                        <p className="text-base font-semibold text-gray-900">
                          {stampLog.storeLabel}
                        </p>
                      </div>
                      {customerMode === "normal" && (
                        <div>
                          <span className="text-sm font-medium text-gray-600">
                            스탬프 개수:
                          </span>
                          <p className="text-base font-semibold text-gray-900">
                            {stampLog.amount === 0
                              ? "미적립"
                              : `${stampLog.amount}개`}
                          </p>
                        </div>
                      )}
                      <div>
                        <span className="text-sm font-medium text-gray-600">
                          결제 유형:
                        </span>
                        <p className="text-base font-semibold text-gray-900">
                          {stampLog.paymentTypeName}
                        </p>
                      </div>
                      {customerMode === "normal" && (
                        <div>
                          <span className="text-sm font-medium text-gray-600">
                            금액:
                          </span>
                          <p className="text-base font-semibold text-gray-900">
                            {stampLog.finalAmountExpression || "0"} ={" "}
                            {formatAmount(stampLog.finalAmount)}
                          </p>
                        </div>
                      )}
                      {stampLog.logMeta.discount && (
                        <div>
                          <span className="text-sm font-medium text-gray-600">
                            할인:
                          </span>
                          <p className="text-base font-semibold text-gray-900">
                            {stampLog.logMeta.discount.name}{" "}
                            {formatAmount(stampLog.logMeta.discount.amount)}원
                          </p>
                        </div>
                      )}
                      {stampLog.logMeta.extraNote && (
                        <div>
                          <span className="text-sm font-medium text-gray-600">
                            출고 특이사항:
                          </span>
                          <p className="text-sm text-gray-900 whitespace-pre-wrap">
                            {stampLog.logMeta.extraNote}
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
              <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
                  <h3 className="text-sm font-semibold text-gray-900">
                    품목 목록{" "}
                    <span className="font-normal text-gray-500">
                      {stampLog?.logMeta.items?.length ?? 0}개
                    </span>
                  </h3>
                </div>
                <div className="max-h-[360px] space-y-2 overflow-y-auto p-3">
                  {stampLog?.logMeta.items?.map((item, index) => (
                    <div
                      key={`${item.itemId}-${index}`}
                      className="flex items-start gap-2 rounded-lg border border-gray-200 px-3 py-2.5"
                    >
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-semibold text-white">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-start gap-2">
                          <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                            {item.itemCategoryName ?? "미분류"}
                          </span>
                          <p className="min-w-0 break-words text-sm font-medium text-gray-900">
                            {item.lineText}
                          </p>
                        </div>
                        {customerMode === "normal" && (
                          <p className="mt-1 text-xs text-gray-500">
                            개별단가 {formatAmount(item.unitPrice)}원 / 총금액{" "}
                            {formatAmount(item.amount)}원
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 flex items-center justify-end gap-3 pt-4 mt-4 border-t border-gray-200">
        {addStep > 1 && (
          <Button
            variant="gray"
            size="sm"
            onClick={() => {
              if (addStep === 3) setAddStep(2);
              else if (customerMode === "normal") setAddStep(1);
              else onCancel();
            }}
            disabled={isSubmitting}
          >
            이전
          </Button>
        )}
        {addStep < 3 ? (
          <Button
            size="sm"
            disabled={
              addStep === 1
                ? !formValidity.hasPaymentType
                : !formValidity.hasItems
            }
            onClick={() => setAddStep((s) => (s === 1 ? 2 : 3))}
          >
            다음
          </Button>
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
