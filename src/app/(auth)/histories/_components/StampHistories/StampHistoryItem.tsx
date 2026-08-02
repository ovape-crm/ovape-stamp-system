"use client";

import Button from "@/app/_components/Button";
import { LogsResType } from "@/app/_domains/_log/_types/log.types";
import {
  ActionInfoLabel,
  CustomerInfo,
  LogActorInfo,
  PaymentTypeLabel,
  StoreLabel,
} from "@/app/(auth)/_components/HistoriesComponents";
import useCopy from "@/app/_domains/_log/_hooks/useCopy";
import { isSpecialCustomer } from "@/app/_domains/_customer/_utils/specialCustomer";
import { PaymentTypeEnum } from "@/app/_enums/enums";

interface StampHistoryItemProps {
  log: LogsResType;
  onEdit: () => void;
  onNavigate: () => void;
  isAdmin: boolean;
  onDelete: () => void;
  onConfirm?: () => void;
  showCopy?: boolean;
}

const StampHistoryItem = ({
  log,
  onEdit,
  onNavigate,
  isAdmin,
  onDelete,
  onConfirm,
  showCopy = true,
}: StampHistoryItemProps) => {
  const { copyLogToClipboard } = useCopy();
  const isSplitPayment =
    Array.isArray(log.jsonb?.payments) && log.jsonb.payments.length >= 2;
  const hasSpecialCustomer =
    Boolean(log.customers?.name) &&
    isSpecialCustomer(log.customers.name, log.customers.phone);
  const isCustomerRemark =
    log.jsonb?.paymentType === PaymentTypeEnum.REMARK.value;
  const isCouponUse = log.action === "coupon-10";
  const isStampAdjustment =
    !isCustomerRemark &&
    !isCouponUse &&
    (log.action.startsWith("add-") || log.action.startsWith("remove-")) &&
    !Array.isArray(log.jsonb?.items) &&
    !log.jsonb?.paymentType;
  const customerBadge = isCustomerRemark ? (
    <span className="inline-flex whitespace-nowrap rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-500">
      고객 특이사항
    </span>
  ) : isCouponUse ? (
    <span className="inline-flex whitespace-nowrap rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-700">
      쿠폰 사용
    </span>
  ) : isStampAdjustment ? (
    <span className="inline-flex whitespace-nowrap rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
      스탬프 조정
    </span>
  ) : null;

  return (
    <div className="grid grid-cols-[125px_88px_minmax(260px,1fr)_115px_auto] items-center gap-2 whitespace-nowrap rounded-lg border border-brand-50 p-2.5 text-xs transition-colors hover:bg-brand-50/30 sm:px-2 sm:py-4 sm:text-sm">
      <div className="flex min-w-0 self-center flex-col items-center text-center">
        {!isCustomerRemark && !isCouponUse && (
          <div>
            {hasSpecialCustomer ? (
              <span className="inline-flex whitespace-nowrap rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
                특수계정
              </span>
            ) : (
              <ActionInfoLabel action={log.action} />
            )}
          </div>
        )}
        <CustomerInfo
          name={log.customers?.name}
          phone={log.customers?.phone}
          onClick={onNavigate}
        />
      </div>

      <div className="ml-2 flex min-w-0 self-center flex-col items-start gap-1">
        {customerBadge}
        {log.jsonb && "storeName" in log.jsonb && (
          <StoreLabel jsonb={log.jsonb} />
        )}
        {!isCustomerRemark && log.jsonb && "paymentType" in log.jsonb && (
          <PaymentTypeLabel jsonb={log.jsonb} />
        )}
        {typeof log.jsonb?.totalAmount === "number" &&
          log.jsonb.totalAmount > 0 && (
            <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold px-2 py-1">
              {log.jsonb.totalAmount.toLocaleString("ko-KR")}원
            </span>
          )}
      </div>

      <div className="min-w-0 border-l border-brand-100 pl-3 sm:pl-4">
        <div className="flex items-start gap-2">
          <Button variant="secondary" size="xs" onClick={onEdit}>
            ✏️
          </Button>
          <div className="min-w-0 flex-1 break-words whitespace-normal text-xs text-gray-600 sm:text-sm">
            <p className="whitespace-pre-line">
              {log.note ? (
                `${isSplitPayment ? "분할결제) " : ""}${log.note}`
              ) : (
                <span className="text-gray-400"> - </span>
              )}
            </p>
            {typeof log.jsonb?.extraNote === "string" &&
              log.jsonb.extraNote.trim() && (
                <p className="mt-1 italic text-gray-400">
                  출고 특이사항: &quot;{log.jsonb.extraNote.trim()}&quot;
                </p>
              )}
            {(log.jsonb?.deliveryMethod === "parcel" ||
              log.jsonb?.deliveryMethod === "delivery") &&
              typeof log.jsonb?.deliveryAddress === "string" &&
              log.jsonb.deliveryAddress.trim() && (
                <p className="mt-1 break-words italic text-gray-400">
                  주소: {log.jsonb.deliveryAddress.trim()}
                </p>
              )}
          </div>
        </div>
      </div>

      <div className="text-right">
        {log.users && (
          <LogActorInfo
            users={log.users}
            created_at={log.created_at}
            updated_at={log.updated_at}
            jsonb={log.jsonb}
          />
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {onConfirm && (
          <Button variant="primary" size="sm" onClick={onConfirm}>
            출고 확정
          </Button>
        )}
        {showCopy && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              copyLogToClipboard(log, {
                name: log.customers?.name,
                phone: log.customers?.phone,
                gender: log.customers?.gender,
              })
            }
          >
            복사
          </Button>
        )}
        {isAdmin && (
          <Button
            variant="danger"
            size="sm"
            onClick={onDelete}
            aria-label="삭제"
          >
            🗑️
          </Button>
        )}
      </div>
    </div>
  );
};

export default StampHistoryItem;
