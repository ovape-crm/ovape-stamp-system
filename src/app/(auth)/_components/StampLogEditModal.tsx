"use client";

import { PaymentTypeEnumType, StoreTypeEnumType } from "@/app/_enums/enums";
import StampConfirmModal from "@/app/(auth)/customers/_components/StampConfirmModal";
import {
  getStampsByCustomer,
  type StampLogMeta,
} from "@/app/_domains/_stamp/_services/stampService";
import type { GenderType } from "@/app/_domains/_customer/_types/customer.types";
import { useQuery } from "@tanstack/react-query";

interface StampLogEditModalProps {
  customerId: string;
  target: {
    name: string;
    phone: string;
    gender?: GenderType | null;
    address?: string | null;
    note?: string | null;
    is_stamp_eligible?: boolean;
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

export default function StampLogEditModal({
  customerId,
  target,
  initialAction,
  initialPaymentType,
  initialStoreName,
  initialLogMeta,
  isStampAmountEditable = false,
  title = "출고 이력 수정",
  onSubmit,
  onCancel,
}: StampLogEditModalProps) {
  const stampsQuery = useQuery({
    queryKey: ["stamps", customerId],
    queryFn: () => getStampsByCustomer(customerId),
    refetchOnMount: "always",
  });
  if (stampsQuery.isPending || stampsQuery.isFetching) {
    return (
      <div className="flex min-h-48 items-center justify-center text-sm font-medium text-gray-600">
        현재 스탬프를 확인하는 중입니다.
      </div>
    );
  }
  if (stampsQuery.isError) {
    return (
      <div className="flex min-h-48 items-center justify-center px-6 text-center text-sm font-medium text-rose-600">
        현재 스탬프를 불러오지 못했습니다. 다시 시도해 주세요.
      </div>
    );
  }
  const currentStampCount = Math.max(0, Number(stampsQuery.data?.[0]?.count ?? 0));
  const originalStampAmount = initialAction.startsWith("add-")
    ? Number(initialAction.slice(4)) || 0
    : 0;
  const originalCouponDeduction =
    (initialLogMeta?.couponUse?.quantity ?? 0) * 10;
  const stampCountBeforeOutbound = Math.max(
    0,
    currentStampCount - originalStampAmount + originalCouponDeduction,
  );

  return (
    <StampConfirmModal
      target={target}
      mode="edit"
      initialAction={initialAction}
      initialPaymentType={initialPaymentType}
      initialStoreName={initialStoreName}
      initialLogMeta={initialLogMeta}
      stampCount={stampCountBeforeOutbound}
      isStampAmountEditable={isStampAmountEditable}
      editTitle={title}
      onEditSubmit={onSubmit}
      onConfirm={() => undefined}
      onCancel={onCancel}
    />
  );
}
