import Loading from "@/app/_components/Loading";
import { CustomersLogsResType, LogsResType } from "@/app/_domains/_log/_types/log.types";
import {
  updateLogNote,
  deleteLog,
} from "@/app/_domains/_log/_services/logService";
import { useCallback } from "react";
import {
  PaymentTypeEnum,
  PaymentTypeEnumType,
  StoreTypeEnumType,
} from "@/app/_enums/enums";
import { groupLogsByDate, formatDateKey } from "@/app/_utils/utils";
import { toast } from "react-hot-toast";
import { useModal } from "@/app/_contexts/ModalContext";
import DeleteConfirmModal from "@/app/(auth)/_components/DeleteConfirmModal";
import ConfirmModal from "@/app/(auth)/_components/ConfirmModal";
import StampLogEditModal from "@/app/(auth)/_components/StampLogEditModal";
import RemarkLogCreateModal from "../RemarkLogCreateModal";
import type { StampLogMeta } from "@/app/_domains/_stamp/_services/stampService";
import type { GenderType } from "@/app/_domains/_customer/_types/customer.types";
import MasterHistoryManagementModal from "../MasterHistoryManagementModal";
import { updateHistoryMasterMetadata } from "@/app/_domains/_log/_services/logService";
import { useQueryClient } from "@tanstack/react-query";
import { logKeys } from "@/app/_domains/_log/_queryKeys/logKeys";
import { customerKeys } from "@/app/_domains/_customer/_queryKeys/customerKeys";
import RefundModal from "@/app/(auth)/histories/_components/StampHistories/RefundModal";
import StampHistoryItem from "@/app/(auth)/histories/_components/StampHistories/StampHistoryItem";

const CustomersDetailStampsHistories = ({
  targetUser,
  logs,
  isLoading,
  error,
  isAdmin,
  isMaster = false,
  onDeleteLog,
  onUpdateLog,
  isReservation = false,
  showCopyButton = true,
  onConfirmReservation,
}: {
  targetUser: {
    id: string;
    phone: string;
    name: string;
    gender?: GenderType | null;
    address?: string | null;
    note?: string | null;
    is_stamp_eligible?: boolean;
  };
  isLoading: boolean;
  error: string;
  logs: CustomersLogsResType;
  isAdmin: boolean;
  isMaster?: boolean;
  onDeleteLog: (id: string) => void;
  onUpdateLog: (
    id: string,
    updater: (
      item: CustomersLogsResType[number],
    ) => CustomersLogsResType[number],
  ) => void;
  isReservation?: boolean;
  /** 통합 이력은 이후 마스터 전용 기능을 넣을 자리를 남긴다. */
  showCopyButton?: boolean;
  onConfirmReservation?: (logId: string) => Promise<void>;
}) => {
  const { open, close } = useModal();
  const queryClient = useQueryClient();

  const handleMasterManage = useCallback(
    (log: CustomersLogsResType[number]) => {
      const currentWorkerName =
        typeof log.jsonb?.createdWorkerName === "string"
          ? log.jsonb.createdWorkerName
          : log.users?.name ?? "";
      const handleSubmit = async (values: {
        customer: { id: string; name: string; phone: string };
        createdAt: string;
        workerName: string;
      }) => {
        try {
          const updated = await updateHistoryMasterMetadata({
            logId: log.id,
            customerId: values.customer.id,
            createdAt: values.createdAt,
            workerName: values.workerName,
          });
          if (updated.customer_id !== targetUser.id) {
            onDeleteLog(log.id);
          } else {
            onUpdateLog(log.id, (item) => ({ ...item, ...updated }));
          }
          void Promise.all([
            queryClient.invalidateQueries({ queryKey: logKeys.all() }),
            queryClient.invalidateQueries({ queryKey: customerKeys.all() }),
          ]);
          close();
          toast.success("이력 관리 내용을 저장했습니다.");
        } catch (error) {
          console.error(error);
          toast.error("이력 관리 내용을 저장하지 못했습니다.");
        }
      };
      open({
        content: (
          <MasterHistoryManagementModal
            initialCustomer={{
              id: targetUser.id,
              name: targetUser.name,
              phone: targetUser.phone,
            }}
            initialCreatedAt={log.created_at}
            initialWorkerName={currentWorkerName}
            onSubmit={handleSubmit}
            onCancel={close}
          />
        ),
        options: {
          dismissOnBackdrop: false,
          dismissOnEsc: true,
          size: "max-w-xl",
        },
      });
    },
    [close, onDeleteLog, onUpdateLog, open, queryClient, targetUser.id, targetUser.name, targetUser.phone],
  );

  const openRefundModal = useCallback(
    (log: CustomersLogsResType[number]) => {
      open({
        content: <RefundModal log={{ ...log, customers: targetUser }} onCancel={close} onComplete={() => Promise.all([
          queryClient.invalidateQueries({ queryKey: logKeys.all() }),
          queryClient.invalidateQueries({ queryKey: customerKeys.all() }),
        ]).then(() => undefined)} />,
        options: { dismissOnBackdrop: false, dismissOnEsc: true, size: "max-w-xl" },
      });
    },
    [close, open, queryClient, targetUser],
  );

  const handleConfirm = useCallback(
    (log: CustomersLogsResType[number]) => {
      if (!onConfirmReservation) return;
      const handleConfirmAction = async () => {
        try {
          await onConfirmReservation(log.id);
          onDeleteLog(log.id);
          close();
          toast.success("출고 이력으로 확정되었습니다.");
        } catch (e) {
          console.error(e);
          toast.error("출고 확정에 실패했습니다. 다시 시도해 주세요.");
          close();
        }
      };
      open({
        content: (
          <ConfirmModal
            title="출고 확정"
            description={
              "이 예약을 출고 이력으로 확정하시겠습니까?\n확정 시 스탬프가 적립되고 출고 이력으로 이동합니다."
            }
            confirmLabel="출고 확정"
            confirmingLabel="확정 중..."
            onConfirm={handleConfirmAction}
            onCancel={close}
          />
        ),
        options: { dismissOnBackdrop: false },
      });
    },
    [onConfirmReservation, onDeleteLog, open, close],
  );

  const handleDelete = useCallback(
    (log: CustomersLogsResType[number]) => {
      const handleConfirm = async () => {
        try {
          const deletedLogIds = await deleteLog(log.id);
          deletedLogIds.forEach(onDeleteLog);
          close();
          toast.success("로그를 삭제했습니다.");
        } catch (e) {
          console.error(e);
          toast.error("로그 삭제에 실패했습니다. 다시 시도해 주세요.");
          close();
        }
      };
      open({
        content: (
          <DeleteConfirmModal onConfirm={handleConfirm} onCancel={close} />
        ),
        options: { dismissOnBackdrop: false },
      });
    },
    [onDeleteLog, open, close],
  );

  const handleEdit = useCallback(
    (log: CustomersLogsResType[number]) => {
      const isRemarkLog =
        log.jsonb?.paymentType === PaymentTypeEnum.REMARK.value;
      const isFollowUpRemarkLog =
        isRemarkLog && (log.note ?? '').startsWith('[처리 필요 등록]');
      const hasStampLogItems =
        Array.isArray(log.jsonb?.items) && log.jsonb.items.length > 0;
      const shouldEditMemoOnly = isRemarkLog || !hasStampLogItems;

      if (shouldEditMemoOnly) {
        const handleRemarkSubmit = async (note: string) => {
          try {
            const updated = await updateLogNote(log.id, note);
            onUpdateLog(log.id, (item) => ({
              ...item,
              note: updated.note,
              jsonb: updated.jsonb,
              updated_at: updated.updated_at,
            }));
            close();
            toast.success(
              isRemarkLog ? "특이사항을 저장했습니다." : "메모를 저장했습니다.",
            );
          } catch (e) {
            console.error(e);
            toast.error("저장에 실패했습니다. 다시 시도해 주세요.");
          }
        };

        open({
          content: (
            <RemarkLogCreateModal
              initialNote={log.note ?? ""}
              mode="edit"
              title={isRemarkLog ? undefined : "메모 수정"}
              label={isRemarkLog ? undefined : "메모"}
              placeholder={isRemarkLog ? undefined : "메모를 입력하세요"}
              initialRemarkType={isFollowUpRemarkLog ? "follow_up" : "general"}
              showRemarkTypeTabs={isRemarkLog}
              onSubmit={handleRemarkSubmit}
              onCancel={close}
            />
          ),
          options: { dismissOnBackdrop: false, dismissOnEsc: true },
        });
        return;
      }

      const handleSubmit = async (values: {
        note: string;
        paymentType?: PaymentTypeEnumType["value"];
        storeName: StoreTypeEnumType["value"];
        logMeta: StampLogMeta;
        amount: number;
      }) => {
        try {
          // 예약 이력은 아직 스탬프가 적립되지 않았으므로 개수 수정 허용
          const nextAction = isReservation
            ? values.amount === 0
              ? "no-stamp"
              : `add-${values.amount}`
            : undefined;
          const updated = await updateLogNote(
            log.id,
            values.note,
            values.paymentType,
            values.storeName,
            values.logMeta,
            nextAction,
          );
          onUpdateLog(log.id, (item) => ({
            ...item,
            action: updated.action,
            note: updated.note,
            jsonb: updated.jsonb,
            updated_at: updated.updated_at,
          }));
          close();
          toast.success("이력을 저장했습니다.");
        } catch (e) {
          console.error(e);
          toast.error("저장에 실패했습니다. 다시 시도해 주세요.");
        }
      };

      open({
        content: (
          <StampLogEditModal
            target={{
              name: targetUser.name,
              phone: targetUser.phone,
              gender: targetUser.gender,
              address: targetUser.address,
              note: targetUser.note,
              is_stamp_eligible: targetUser.is_stamp_eligible,
            }}
            initialAction={log.action}
            initialPaymentType={
              log.jsonb?.paymentType as PaymentTypeEnumType["value"] | undefined
            }
            initialStoreName={
              log.jsonb?.storeName as StoreTypeEnumType["value"] | undefined
            }
            initialLogMeta={log.jsonb as StampLogMeta}
            isStampAmountEditable={isReservation}
            title={isReservation ? "출고 예약 수정" : "출고 이력 수정"}
            onSubmit={handleSubmit}
            onCancel={close}
          />
        ),
        options: { dismissOnBackdrop: false, dismissOnEsc: true },
      });
    },
    [
      open,
      close,
      onUpdateLog,
      isReservation,
      targetUser.name,
      targetUser.gender,
      targetUser.address,
      targetUser.note,
      targetUser.phone,
      targetUser.is_stamp_eligible,
    ],
  );

  if (error) {
    return (
      <div className="text-center py-8 text-rose-600 text-sm">{error}</div>
    );
  }

  if (isLoading) {
    return <Loading size="lg" text="스탬프 내역 불러오는 중..." />;
  }

  if (logs.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">데이터가 없습니다.</div>
    );
  }

  const { itemsByDate: logsByDate, sortedDates } = groupLogsByDate(logs);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[1100px] space-y-3 text-xs sm:text-sm">
        {sortedDates.map((dateKey) => {
          const logsOfDate = logsByDate[dateKey];
          const prettyDate = formatDateKey(dateKey);

          return (
            <div key={dateKey} className="space-y-3">
              {/* 날짜 헤더 (히스토리와 동일 스타일) */}
              <div className="w-full py-1">
                <div className="w-full px-4 py-2 rounded-lg bg-brand-50/80 border border-brand-100 shadow-xs flex items-center justify-center">
                  <span className="text-xs sm:text-sm font-semibold text-brand-800 tracking-wide whitespace-nowrap">
                    {prettyDate}
                  </span>
                </div>
              </div>

              {/* 해당 날짜의 로그들 */}
              {logsOfDate.map((log) => (
                <StampHistoryItem
                  key={log.id}
                  log={{ ...log, customers: targetUser } as LogsResType}
                  onEdit={() => handleEdit(log)}
                  isAdmin={isAdmin}
                  onDelete={() => handleDelete(log)}
                  onConfirm={isReservation ? () => handleConfirm(log) : undefined}
                  showCopy={showCopyButton && !isReservation}
                  isMaster={isMaster}
                  onManage={() => handleMasterManage(log)}
                  onRefund={!isReservation && Array.isArray(log.jsonb?.items) && log.jsonb.items.length > 0 && Number(log.jsonb?.totalAmount ?? 0) > 0 ? () => openRefundModal(log) : undefined}
                  showCustomerInfo={false}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CustomersDetailStampsHistories;
