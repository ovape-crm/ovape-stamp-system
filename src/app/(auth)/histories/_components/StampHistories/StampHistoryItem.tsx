"use client";

import Button from "@/app/_components/Button";
import { Dropdown } from "@/app/_components/Dropdown";
import { LogsResType } from "@/app/_domains/_log/_types/log.types";
import {
  ActionInfoLabel,
  CustomerInfo,
  LogActorInfo,
  PaymentTypeLabel,
  StoreLabel,
} from "@/app/(auth)/_components/HistoriesComponents";
import useCopy from "@/app/_domains/_log/_hooks/useCopy";
import { getCustomerMode } from "@/app/_domains/_customer/_utils/specialCustomer";
import { PaymentTypeEnum, StoreTypeEnum } from "@/app/_enums/enums";
import { formatHistoryNote } from "@/app/_domains/_log/_utils/formatHistoryNote";

interface StampHistoryItemProps {
  log: LogsResType;
  onEdit: () => void;
  onNavigate?: () => void;
  isAdmin: boolean;
  onDelete: () => void;
  onConfirm?: () => void;
  showCopy?: boolean;
  isMaster?: boolean;
  onManage?: () => void;
  onRefund?: () => void;
  onCancelRefund?: () => void;
  isLocked?: boolean;
  /** 고객 상세에서는 이미 대상 고객이 표시되므로 이름·번호를 생략한다. */
  showCustomerInfo?: boolean;
}

const StampHistoryItem = ({
  log,
  onEdit,
  onNavigate,
  isAdmin,
  onDelete,
  onConfirm,
  showCopy = true,
  isMaster = false,
  onManage,
  onRefund,
  onCancelRefund,
  isLocked = false,
  showCustomerInfo = true,
}: StampHistoryItemProps) => {
  const { copyLogToClipboard } = useCopy();
  const isSplitPayment =
    Array.isArray(log.jsonb?.payments) && log.jsonb.payments.length >= 2;
  const hasTransactionTag = Boolean(
    log.jsonb?.discount ||
    (typeof log.jsonb?.deliveryFee === "number" && log.jsonb.deliveryFee > 0) ||
    log.jsonb?.deliveryType === "self" ||
    log.jsonb?.deliveryType === "customer_quick" ||
    (typeof log.jsonb?.reservationDate === "string" &&
      log.jsonb.reservationDate.trim()),
  );
  const hasPrimaryAction = Boolean(onConfirm || (showCopy && !isLocked));
  const hasActionMenu =
    !isLocked && ((isMaster && Boolean(onManage)) || isAdmin);
  const hasReservationAction = Boolean(onConfirm);
  const actionColumnClass = hasPrimaryAction ? "col-start-1" : "col-start-2";
  const actionButton = !isLocked
    ? isMaster && onCancelRefund
      ? { label: "환불 취소", onClick: onCancelRefund }
      : onRefund
        ? { label: "환불", onClick: onRefund }
        : undefined
    : undefined;
  const customerMode = log.customers?.name
    ? getCustomerMode(log.customers.name, log.customers.phone)
    : "normal";
  const specialCustomerLabel =
    customerMode === "x"
      ? log.customers?.gender === "special"
        ? "X 통합"
        : log.customers?.gender === "female"
          ? "X 여자"
          : "X 남자"
      : customerMode === "adjustment"
        ? "재고조정"
        : customerMode === "demo"
          ? "시연용"
          : undefined;
  const isCustomerRemark =
    log.jsonb?.paymentType === PaymentTypeEnum.REMARK.value;
  const isCouponUse = log.action.startsWith("coupon-");
  const historyLabelJsonb = {
    ...(log.jsonb ?? {}),
    ...(isCouponUse && !log.jsonb?.storeName
      ? { storeName: StoreTypeEnum.OVAPE.value }
      : {}),
    ...(isCouponUse && !log.jsonb?.paymentType
      ? { paymentType: PaymentTypeEnum.SHIPMENT_REMARK.value }
      : {}),
  };
  const isStampAdjustment =
    !isCustomerRemark &&
    !isCouponUse &&
    (log.action.startsWith("add-") || log.action.startsWith("remove-")) &&
    !Array.isArray(log.jsonb?.items) &&
    !log.jsonb?.paymentType;
  const xTransferExtraNote =
    typeof log.jsonb?.xTransfer === "object" && log.jsonb.xTransfer !== null
      ? (() => {
          const transfer = log.jsonb.xTransfer as Record<string, unknown>;
          const name = typeof transfer.name === "string" ? transfer.name : "X";
          const phoneLastDigits =
            typeof transfer.phoneLastDigits === "string"
              ? transfer.phoneLastDigits
              : "미입력";
          return `X 통합 계정 이전, 이름 : ${name}, 핸드폰 뒷번호 : ${phoneLastDigits}`;
        })()
      : "";
  const extraNote =
    typeof log.jsonb?.extraNote === "string" && log.jsonb.extraNote.trim()
      ? log.jsonb.extraNote.trim()
      : xTransferExtraNote;
  const customerBadge = isCustomerRemark ? (
    <span className="flex h-7 w-full items-center justify-center whitespace-nowrap rounded-full bg-gray-100 px-2 text-center text-xs font-semibold text-gray-700">
      고객 특이사항
    </span>
  ) : isCouponUse ? (
    <span className="flex h-7 w-full items-center justify-center whitespace-nowrap rounded-full bg-blue-100 px-2 text-center text-xs font-semibold text-blue-700">
      쿠폰 사용
    </span>
  ) : isStampAdjustment ? (
    <span className="flex h-7 w-full items-center justify-center whitespace-nowrap rounded-full bg-gray-100 px-2 text-center text-xs font-medium text-gray-600">
      스탬프 조정
    </span>
  ) : null;
  const transactionSummary = (
    <>
      {!isCouponUse && customerBadge}
      {(isCouponUse || (log.jsonb && "storeName" in log.jsonb)) && (
        <StoreLabel jsonb={historyLabelJsonb} />
      )}
      {!isCustomerRemark &&
        (isCouponUse || (log.jsonb && "paymentType" in log.jsonb)) && (
          <PaymentTypeLabel jsonb={historyLabelJsonb} />
        )}
      {isCouponUse && customerBadge}
      {typeof log.jsonb?.totalAmount === "number" &&
        log.jsonb.totalAmount !== 0 && (
          <span className="flex h-7 w-full items-center justify-center whitespace-nowrap rounded-full bg-emerald-100 px-2 text-xs font-semibold text-emerald-700">
            {log.jsonb.totalAmount.toLocaleString("ko-KR")}원
          </span>
        )}
    </>
  );
  const gridColumns = showCustomerInfo
    ? hasPrimaryAction
      ? "grid-cols-[125px_128px_minmax(260px,1fr)_115px_auto]"
      : "grid-cols-[125px_128px_minmax(260px,1fr)_auto]"
    : hasPrimaryAction
      ? "grid-cols-[128px_minmax(260px,1fr)_115px_auto]"
      : "grid-cols-[128px_minmax(260px,1fr)_auto]";

  return (
    <div
      id={`history-${log.id}`}
      className={`grid scroll-mt-6 ${gridColumns} items-center gap-2 whitespace-nowrap rounded-lg border border-brand-50 p-2.5 text-xs transition-colors hover:bg-brand-50/30 target:bg-brand-50 target:ring-2 target:ring-brand-300 sm:px-2 sm:py-4 sm:text-sm`}
    >
      <div className="flex min-w-0 self-center flex-col items-center text-center">
        {!isCustomerRemark && !isCouponUse && (
          <div className={showCustomerInfo ? undefined : "w-full"}>
            {specialCustomerLabel ? (
              <span className="inline-flex items-center justify-center whitespace-nowrap rounded-full bg-gray-100 px-3 py-1 text-center text-xs font-semibold text-gray-600">
                특수계정
              </span>
            ) : (
              <ActionInfoLabel
                action={log.action}
                matchStoreLabel={!showCustomerInfo}
              />
            )}
          </div>
        )}
        {showCustomerInfo && (
          <CustomerInfo
            name={log.customers?.name}
            phone={log.customers?.phone}
            onClick={onNavigate ?? (() => undefined)}
            singleLineLabel={specialCustomerLabel}
            disabled={isLocked || !onNavigate}
          />
        )}
        {!showCustomerInfo && transactionSummary}
      </div>

      {showCustomerInfo && (
        <div className="flex min-w-0 self-center flex-col items-center gap-1.5 text-center">
          {transactionSummary}
        </div>
      )}

      <div className="min-w-0 border-l border-brand-100 pl-3 sm:pl-4">
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="xs"
            onClick={onEdit}
            disabled={isLocked}
            title={isLocked ? "마스터만 수정할 수 있습니다." : undefined}
          >
            ✏️
          </Button>
          <div className="min-w-0 flex-1 break-words whitespace-normal text-xs text-gray-600 sm:text-sm">
            <p className="whitespace-pre-line">
              {log.note ? (
                `${
                  isSplitPayment
                    ? hasTransactionTag
                      ? "분할결제,"
                      : "분할결제) "
                    : ""
                }${formatHistoryNote(log.note, log.jsonb)}`
              ) : (
                <span className="text-gray-400"> - </span>
              )}
            </p>
            {extraNote && (
                <p className="mt-1 italic text-gray-400">
                  출고 특이사항: &quot;{extraNote}&quot;
                </p>
              )}
            {typeof log.jsonb?.xCustomerName === "string" &&
              log.jsonb.xCustomerName.trim() && (
                <p className="mt-1 italic text-gray-400">
                  이름: {log.jsonb.xCustomerName.trim()}
                </p>
              )}
            {typeof log.jsonb?.xPhoneLastDigits === "string" &&
              log.jsonb.xPhoneLastDigits.trim() && (
                <p className="mt-1 italic text-gray-400">
                  핸드폰 뒷번호: {log.jsonb.xPhoneLastDigits.trim()}
                </p>
              )}
            {(log.jsonb?.xCustomerGender === "male" ||
              log.jsonb?.xCustomerGender === "female") && (
              <p className="mt-1 italic text-gray-400">
                성별: {log.jsonb.xCustomerGender === "female" ? "여자" : "남자"}
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

      {hasPrimaryAction && (
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
      )}

      <div
        className={`ml-2 grid shrink-0 grid-rows-2 gap-1 ${
          hasReservationAction
            ? "grid-cols-[max-content]"
            : hasPrimaryAction
            ? hasActionMenu
              ? "grid-cols-[68px_68px]"
              : "grid-cols-[68px]"
            : "grid-cols-[115px_68px]"
        }`}
      >
        {!hasPrimaryAction && log.users && (
          <div className="col-start-1 row-span-2 flex w-[115px] items-center justify-end text-right">
            <LogActorInfo
              users={log.users}
              created_at={log.created_at}
              updated_at={log.updated_at}
              jsonb={log.jsonb}
            />
          </div>
        )}
        {onConfirm && (
          <Button variant="primary" size="sm" className={`${hasActionMenu ? "row-start-1" : "row-span-2 self-center"} w-full justify-self-center`} onClick={onConfirm}>
            출고 확정
          </Button>
        )}
        {showCopy && !isLocked && (
          <Button
            variant="secondary"
            size="sm"
            className={hasActionMenu ? "col-span-2 row-span-2" : "col-span-1 row-span-2"}
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
        {actionButton && (
          <Button
            variant="secondary"
            size="sm"
            className={`${actionColumnClass} ${
              hasActionMenu ? "row-start-1" : "row-span-2 self-center"
            } flex w-full items-center justify-center self-center`}
            onClick={actionButton.onClick}
          >
            {actionButton.label}
          </Button>
        )}
        {hasActionMenu && (
          <div className={`${actionColumnClass} ${
            hasReservationAction || actionButton
              ? "row-start-2"
              : "row-span-2 self-center"
          } min-w-[68px] [&>div]:w-full`}>
            <Dropdown controlledValue="history-actions">
              <Dropdown.Trigger className="relative h-[30px] justify-center !border-brand-200 !bg-brand-100 px-3 py-1.5 text-xs text-brand-700 hover:!border-brand-300 hover:!bg-brand-200 active:!border-brand-300 active:!bg-brand-200 focus:ring-0 focus:ring-offset-0 sm:h-[38px] sm:px-4 sm:py-2 sm:text-sm [&>span]:hidden [&>svg]:absolute [&>svg]:left-1/2 [&>svg]:-translate-x-1/2">{null}</Dropdown.Trigger>
              <Dropdown.Content neutral flush>
                {isMaster && onManage && <Dropdown.Item option={{ value: "manage", label: "관리" }} neutral showCheck={false} className="flex justify-center whitespace-nowrap !bg-white px-3 py-1.5 text-center text-xs hover:!bg-brand-100 focus:!ring-0 sm:px-4 sm:py-2 sm:text-sm" onSelect={onManage} />}
                {isAdmin && <Dropdown.Item option={{ value: "delete", label: "🗑️" }} neutral showCheck={false} className={`flex justify-center whitespace-nowrap !bg-white px-3 py-1.5 text-center text-xs text-rose-600 hover:!bg-brand-100 focus:!ring-0 sm:px-4 sm:py-2 sm:text-sm ${isMaster && onManage ? "border-t border-brand-200" : ""}`} onSelect={onDelete} />}
              </Dropdown.Content>
            </Dropdown>
          </div>
        )}
        {isLocked && (
          <Button
            variant="secondary"
            size="sm"
            disabled
            title="마스터만 상세 조회할 수 있습니다."
          >
            🔒 열람 제한
          </Button>
        )}
      </div>
    </div>
  );
};

export default StampHistoryItem;
