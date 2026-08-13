"use client";

import { PaymentTypeEnumType, StoreTypeEnumType } from "@/app/_enums/enums";
import StampConfirmModal from "@/app/(auth)/customers/_components/StampConfirmModal";
import type { StampLogMeta } from "@/app/_domains/_stamp/_services/stampService";

interface StampLogEditModalProps {
  target: {
    name: string;
    phone: string;
    gender?: "male" | "female" | null;
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
  return (
    <StampConfirmModal
      target={target}
      mode="edit"
      initialAction={initialAction}
      initialPaymentType={initialPaymentType}
      initialStoreName={initialStoreName}
      initialLogMeta={initialLogMeta}
      isStampAmountEditable={isStampAmountEditable}
      editTitle={title}
      onEditSubmit={onSubmit}
      onConfirm={() => undefined}
      onCancel={onCancel}
    />
  );
}
