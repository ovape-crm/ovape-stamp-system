"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import toast from "react-hot-toast";
import StampCards from "./StampCards";
import {
  addStamp,
  addReservationStamp,
  getCouponUsageNote,
  removeStamp,
  StampLogMeta,
} from "@/app/_domains/_stamp/_services/stampService";
import {
  PaymentTypeEnum,
  PaymentTypeEnumType,
  StoreTypeEnum,
  StoreTypeEnumType,
} from "@/app/_enums/enums";
import { useModal } from "@/app/_contexts/ModalContext";
import { useQueryClient } from "@tanstack/react-query";
import { logKeys } from "@/app/_domains/_log/_queryKeys/logKeys";
import StampConfirmModal from "../../_components/StampConfirmModal";
import Button from "@/app/_components/Button";
import { getCustomerMode } from "@/app/_domains/_customer/_utils/specialCustomer";

interface StampSectionProps {
  stampCount: number;
  target: {
    id: string;
    name: string;
    phone: string;
    address?: string | null;
    gender?: "male" | "female" | null;
    is_stamp_eligible?: boolean;
    note?: string | null;
  };
  onUpdate: () => void;
  onAddRemark: () => void;
  autoOpenOutbound?: boolean;
  onAutoOpenHandled?: () => void;
}

const getRequestErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const value = error as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
    };
    const parts = [value.message, value.details, value.hint].filter(
      (part): part is string => typeof part === "string" && part.length > 0,
    );
    if (parts.length > 0) return parts.join(" / ");
    if (typeof value.code === "string") return `오류 코드: ${value.code}`;
  }
  return "출고 처리에 실패했습니다.";
};

const StampSection = ({
  stampCount,
  target,
  onUpdate,
  onAddRemark,
  autoOpenOutbound = false,
  onAutoOpenHandled,
}: StampSectionProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const hasAutoOpenedOutboundRef = useRef(false);
  const openOutboundModalRef = useRef<() => void>(() => undefined);
  const { open, close } = useModal();
  const queryClient = useQueryClient();
  const customerMode = getCustomerMode(
    target.name,
    target.phone,
    target.is_stamp_eligible ?? true,
  );
  const isSpecialCustomer = customerMode !== "normal";
  const isRegularNonAccrualCustomer =
    customerMode === "x" &&
    target.is_stamp_eligible === false &&
    !(target.name.trim() === "X" && target.phone.trim() === "X");
  const specialAccountLabel =
    customerMode === "demo"
      ? "시연용 처리"
      : customerMode === "adjustment"
        ? "재고조정"
        : `미적립 ${target.gender === "female" ? "여자" : "남자"} 고객`;

  const openOutboundModal = () =>
    open({
      content: (
        <StampConfirmModal
          target={{
            name: target.name,
            phone: target.phone,
            gender: target.gender,
            address: target.address,
            note: target.note,
            is_stamp_eligible: target.is_stamp_eligible,
          }}
          stampCount={stampCount}
          mode="add"
          onCancel={close}
          onConfirm={async (
            modalNote?: string,
            paymentType?: PaymentTypeEnumType["value"],
            amount?: number,
            logMeta?: StampLogMeta,
            _adjustDirection?: "add" | "remove",
            isReservation?: boolean,
            targetCustomerId?: string,
            shouldAddStampForSelectedCustomer?: boolean,
          ) => {
            let didSave = false;
            if (isReservation) {
              didSave = await handleReserve(
                modalNote,
                paymentType,
                amount,
                logMeta,
                targetCustomerId,
                shouldAddStampForSelectedCustomer,
              );
            } else {
              didSave = await handleAdd(
                modalNote,
                paymentType,
                amount,
                logMeta,
                targetCustomerId,
                shouldAddStampForSelectedCustomer,
              );
            }
            if (didSave) close();
          }}
        />
      ),
      options: { dismissOnBackdrop: false, size: "max-w-xl" },
    });

  // 출고/예약 이력 목록 캐시를 무효화 (이력 페이지 + 고객 상세의 출고/예약 탭 모두 반영)
  const invalidateLogLists = () => {
    queryClient.invalidateQueries({ queryKey: logKeys.lists() });
    queryClient.invalidateQueries({
      queryKey: logKeys.byCustomerAll(target.id),
    });
  };

  const handleAdd = async (
    memo?: string,
    paymentType?: PaymentTypeEnumType["value"],
    amount: number = 0,
    logMeta?: StampLogMeta,
    targetCustomerId?: string,
    shouldAddStampForSelectedCustomer?: boolean,
  ) => {
    try {
      setIsLoading(true);
      const effectiveAmount = targetCustomerId
        ? shouldAddStampForSelectedCustomer
          ? amount
          : 0
        : customerMode === "x"
          ? 0
          : amount;
      await addStamp(
        targetCustomerId ?? target.id,
        effectiveAmount,
        memo ?? "",
        paymentType,
        logMeta,
      );
      if (logMeta?.couponUse) {
        await removeStamp(
          "coupon",
          targetCustomerId ?? target.id,
          logMeta.couponUse.quantity * 10,
          getCouponUsageNote(logMeta.couponUse),
          PaymentTypeEnum.SHIPMENT_REMARK.value,
          logMeta.storeName ?? StoreTypeEnum.OVAPE.value,
        );
      }
      onUpdate();
      invalidateLogLists();
      const successMessage = targetCustomerId
        ? effectiveAmount === 0
          ? "미적립으로 기록되었습니다."
          : `스탬프 ${effectiveAmount}개 적립 완료!`
        : customerMode === "x"
          ? "특수계정 출고가 완료되었습니다."
          : customerMode === "demo"
            ? "시연용 처리가 완료되었습니다."
            : customerMode === "adjustment"
              ? "재고조정이 완료되었습니다."
              : effectiveAmount === 0
                ? "미적립으로 기록되었습니다."
                : `스탬프 ${effectiveAmount}개 적립 완료!`;
      toast.success(successMessage);
      return true;
    } catch (error) {
      const errorMessage = getRequestErrorMessage(error);
      console.warn("출고 처리 실패:", errorMessage);
      if (errorMessage !== "출고 처리를 취소했습니다.") {
        toast.error(errorMessage);
      }
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const handleReserve = async (
    memo?: string,
    paymentType?: PaymentTypeEnumType["value"],
    amount: number = 0,
    logMeta?: StampLogMeta,
    targetCustomerId?: string,
    shouldAddStampForSelectedCustomer?: boolean,
  ) => {
    try {
      setIsLoading(true);
      const effectiveAmount = targetCustomerId
        ? shouldAddStampForSelectedCustomer
          ? amount
          : 0
        : customerMode === "x"
          ? 0
          : amount;
      await addReservationStamp(
        targetCustomerId ?? target.id,
        effectiveAmount,
        memo ?? "",
        paymentType,
        logMeta,
      );
      invalidateLogLists();
      toast.success("출고 예약으로 저장되었습니다.");
      return true;
    } catch (error) {
      console.error("출고 예약 실패:", error);
      toast.error("출고 예약에 실패했습니다.");
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemove = async (memo?: string, amount: number = 1) => {
    try {
      setIsLoading(true);
      await removeStamp("remove", target.id, amount, memo ?? "");
      onUpdate();
      toast.success(`스탬프 ${amount}개 차감 완료!`);
    } catch (error) {
      console.error("스탬프 차감 실패:", error);
      toast.error(
        error instanceof Error ? error.message : "스탬프 차감에 실패했습니다.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleUse10 = async (
    memo?: string,
    couponQuantity: number = 1,
    paymentType: PaymentTypeEnumType["value"] = PaymentTypeEnum.SHIPMENT_REMARK
      .value,
    storeName: StoreTypeEnumType["value"] = StoreTypeEnum.OVAPE.value,
  ) => {
    const stampAmount = couponQuantity * 10;
    if (stampCount < stampAmount) {
      toast.error("보유 스탬프가 쿠폰 사용 수량보다 부족합니다.");
      return;
    }

    try {
      setIsLoading(true);
      await removeStamp(
        "coupon",
        target.id,
        stampAmount,
        memo ?? "",
        paymentType,
        storeName,
      );
      onUpdate();
      toast.success("쿠폰 사용 완료! 🎉");
    } catch (error) {
      console.error("쿠폰 사용 실패:", error);
      toast.error("쿠폰 사용에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  openOutboundModalRef.current = openOutboundModal;

  useEffect(() => {
    if (!autoOpenOutbound || hasAutoOpenedOutboundRef.current) return;

    hasAutoOpenedOutboundRef.current = true;
    openOutboundModalRef.current();
    onAutoOpenHandled?.();
  }, [autoOpenOutbound, onAutoOpenHandled]);

  return (
    <section className="flex-1 h-full bg-gradient-to-br from-brand-50 to-brand-100 rounded-lg shadow-sm border border-brand-200 p-6">
      {isSpecialCustomer ? (
        <div className="flex h-full min-h-[280px] flex-col items-center">
          <div className="flex min-h-0 flex-1 items-center justify-center py-2">
            <Image
              src="/images/special-customer-logo.png"
              alt="OVAPE 로고"
              width={400}
              height={400}
              className="h-80 w-auto object-contain opacity-50"
              priority
            />
          </div>

          <div className="w-full border-t border-brand-200 pt-5">
            <p className="mb-5 text-center text-base leading-7 text-gray-600 sm:text-lg">
              {isRegularNonAccrualCustomer ? (
                <strong className="font-semibold text-brand-700">
                  {specialAccountLabel}입니다.
                </strong>
              ) : (
                <>
                  <strong className="font-semibold text-brand-700">
                    {specialAccountLabel}
                  </strong>
                  을 위한 특수 계정입니다.
                </>
              )}
            </p>
          </div>

          <div className="w-full border-t border-brand-200 pt-5">
            <Button
              size="sm"
              className="min-h-12 w-full text-base"
              onClick={openOutboundModal}
              disabled={isLoading}
            >
              출고 이력
            </Button>
          </div>
        </div>
      ) : (
        <>
          <h2 className="text-xl font-semibold text-brand-700 mb-6 pb-3 border-b border-brand-200">
            스탬프 현황
          </h2>

          <StampCards count={stampCount} />

          <div className="mt-6 pt-6 border-t border-brand-200">
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1"
                onClick={openOutboundModal}
                disabled={isLoading}
              >
                출고 이력
              </Button>
              <Button
                size="sm"
                variant="tertiary"
                className="flex-1"
                onClick={() =>
                  open({
                    content: (
                      <StampConfirmModal
                        target={{
                          name: target.name,
                          phone: target.phone,
                          gender: target.gender,
                          address: target.address,
                          note: target.note,
                          is_stamp_eligible: target.is_stamp_eligible,
                        }}
                        mode="use10"
                        stampCount={stampCount}
                        onCancel={close}
                        onConfirm={async (
                          modalNote?: string,
                          paymentType?: PaymentTypeEnumType["value"],
                          couponQuantity?: number,
                          logMeta?: StampLogMeta,
                        ) => {
                          await handleUse10(
                            modalNote,
                            couponQuantity ?? 1,
                            paymentType,
                            logMeta?.storeName,
                          );
                          close();
                        }}
                      />
                    ),
                    options: { dismissOnBackdrop: false },
                  })
                }
                disabled={isLoading || stampCount < 10}
              >
                쿠폰사용
              </Button>
              <Button
                size="sm"
                variant="tertiary"
                className="flex-1"
                onClick={() =>
                  open({
                    content: (
                      <StampConfirmModal
                        target={{
                          name: target.name,
                          phone: target.phone,
                          gender: target.gender,
                          address: target.address,
                          note: target.note,
                          is_stamp_eligible: target.is_stamp_eligible,
                        }}
                        mode="adjust"
                        onCancel={close}
                        onConfirm={async (
                          modalNote?: string,
                          _paymentType?: PaymentTypeEnumType["value"],
                          amount?: number,
                          _logMeta?: StampLogMeta,
                          adjustDirection?: "add" | "remove",
                        ) => {
                          if (adjustDirection === "add") {
                            await handleAdd(modalNote, undefined, amount);
                          } else {
                            await handleRemove(modalNote, amount);
                          }
                          close();
                        }}
                      />
                    ),
                    options: { dismissOnBackdrop: false },
                  })
                }
                disabled={isLoading}
              >
                스탬프 조정
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="flex-1"
                onClick={onAddRemark}
                disabled={isLoading}
              >
                고객 특이사항
              </Button>
            </div>
          </div>
        </>
      )}
    </section>
  );
};

export default StampSection;
