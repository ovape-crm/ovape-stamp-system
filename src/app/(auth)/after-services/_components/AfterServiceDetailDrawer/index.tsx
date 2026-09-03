"use client";

import Drawer from "@/app/_components/Drawer";
import {
  updateAfterServiceStatus,
  processAfterServiceRepairIntake,
  processAfterServiceRepairReceipt,
  processInventoryServiceInbound,
  getInventoryServiceProgress,
  getAfterServiceOutboundCostAllocations,
  setAfterServiceManualCost,
  confirmInventoryServiceOutbound,
  editAfterServiceStatusProcessing,
  getAfterServiceIntakeExpense,
  updateAfterService,
  deleteAfterService,
} from "@/app/_domains/_afterService/_services/afterService";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useModal } from "@/app/_contexts/ModalContext";
import { useUser } from "@/app/_contexts/UserContext";
import Loading from "@/app/_components/Loading";
import toast from "react-hot-toast";
import AfterServiceLogList from "./AfterServiceLogList";
import CustomerInfoCard from "./CustomerInfoCard";
import ASInfoCard from "./ASInfoCard";
import StatusBox from "./StatusBox";
import SymptomCard from "./SymptomCard";
import NoteCard from "./NoteCard";
import UpdatedDate from "./UpdatedDate";
import StatusUpdateModal, { StatusUpdateFormValues } from "./StatusUpdateModal";
import AfterServiceCreateModal from "../AfterServiceCreateModal";
import {
  AfterServiceStatusEnum,
  PaymentTypeEnum,
  StoreTypeEnum,
} from "@/app/_enums/enums";
import Button from "@/app/_components/Button";
import { useAfterService } from "@/app/_domains/_afterService/_hooks/useAfterService";
import { afterServiceKeys } from "@/app/_domains/_afterService/_queryKeys/afterServiceKeys";
import { logKeys } from "@/app/_domains/_log/_queryKeys/logKeys";
import {
  deleteLog,
  getAfterServiceStampLog,
  getLogsByAfterServiceId,
  updateStampLogHistoryOnly,
  updateLogNote,
} from "@/app/_domains/_log/_services/logService";
import { addStamp } from "@/app/_domains/_stamp/_services/stampService";
import { searchItemOptions } from "@/app/_domains/_item/_services/itemService";
import { AfterServiceLogType } from "@/app/_domains/_log/_types/log.types";

const getLogValue = (note: string, ...labels: string[]) => {
  for (const label of labels) {
    const value = note
      .split("\n")
      .find((line) => line.trim().startsWith(`${label} :`))
      ?.split(" :")
      .slice(1)
      .join(" :")
      .trim();
    if (value) return value;
  }
  return "";
};

const toInputDate = (value: string) => {
  if (value === "X") return "X";
  const parts = value.match(/(\d{2,4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!parts) return "";
  const year = parts[1].length === 2 ? `20${parts[1]}` : parts[1];
  return `${year}-${parts[2].padStart(2, "0")}-${parts[3].padStart(2, "0")}`;
};

const isGeneratedExchangeCompletionNote = (line: string) => {
  const value = line.trim();
  return (
    value === "교환완료" ||
    value === "동일제품,수량 교환완료" ||
    /^.+\s+\d+개(?:\s+\(.+\))?\s+교환완료$/.test(value)
  );
};

const AfterServiceDetailDrawer = ({
  isOpen,
  onClose,
  afterServiceId,
  onDelete,
}: {
  isOpen: boolean;
  onClose: () => void;
  afterServiceId: string | null;
  onDelete?: () => void;
}) => {
  const queryClient = useQueryClient();
  const { open, close } = useModal();
  const { user } = useUser();
  const isMaster = user?.oss_role === "master";
  const {
    afterService: afterServiceDetail,
    isLoading,
    error,
  } = useAfterService(isOpen ? afterServiceId : null);
  const numericAfterServiceId = Number(afterServiceId) || 0;
  const { data: logs = [], isPending: areLogsLoading } = useQuery({
    queryKey: [
      ...logKeys.byAfterService(numericAfterServiceId),
      "edit-initial-data",
    ],
    queryFn: () => getLogsByAfterServiceId(numericAfterServiceId, 100, 0),
    enabled: numericAfterServiceId > 0,
  });
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isConfirmingOutbound, setIsConfirmingOutbound] = useState(false);
  const [manualCost, setManualCost] = useState("");
  const [isSavingManualCost, setIsSavingManualCost] = useState(false);
  const isInventoryServiceCase =
    afterServiceDetail?.service_case_type === "vendor_exchange" ||
    afterServiceDetail?.service_case_type === "store_product_as";
  const inventoryServiceProgressQuery = useQuery({
    queryKey: ["after-service-inventory-progress", numericAfterServiceId],
    queryFn: () => getInventoryServiceProgress(numericAfterServiceId),
    enabled: numericAfterServiceId > 0 && isInventoryServiceCase,
  });
  const outboundCostAllocationsQuery = useQuery({
    queryKey: ["after-service-outbound-cost-allocations", numericAfterServiceId],
    queryFn: () => getAfterServiceOutboundCostAllocations(numericAfterServiceId),
    enabled:
      isMaster &&
      numericAfterServiceId > 0 &&
      Boolean(afterServiceDetail),
  });
  const intakeExpenseQuery = useQuery({
    queryKey: ["after-service-intake-expense", numericAfterServiceId],
    queryFn: () => getAfterServiceIntakeExpense(String(numericAfterServiceId)),
    enabled: numericAfterServiceId > 0,
  });
  const canSetManualCost =
    isMaster &&
    afterServiceDetail?.service_case_type === "customer_as" &&
    afterServiceDetail.status === AfterServiceStatusEnum.SENT_FOR_REPAIR.value &&
    Boolean(afterServiceDetail.is_loaner_device_issued) &&
    !(outboundCostAllocationsQuery.data?.length);
  const handleSaveManualCost = async () => {
    if (!afterServiceDetail) return;
    const unitPrice = Number(manualCost.replaceAll(",", ""));
    if (!Number.isInteger(unitPrice) || unitPrice <= 0) {
      toast.error("실제 단가를 1원 이상 입력해 주세요.");
      return;
    }
    try {
      setIsSavingManualCost(true);
      await setAfterServiceManualCost({
        afterServiceId: Number(afterServiceDetail.id),
        unitPrice,
      });
      setManualCost("");
      invalidateAfterServiceQueries();
      toast.success("실제 A/S 원가를 등록했습니다.");
    } catch (err) {
      // Supabase 오류는 Error 인스턴스가 아닌 객체로 전달될 수 있어, 실제 DB 메시지를 잃지 않는다.
      const message = err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null && "message" in err
          ? String((err as { message?: unknown }).message ?? "")
          : "";
      toast.error(message || "A/S 원가 등록에 실패했습니다.");
    } finally {
      setIsSavingManualCost(false);
    }
  };
  const handleConfirmInventoryOutbound = async () => {
    if (!afterServiceDetail || !isMaster) return;
    try {
      setIsConfirmingOutbound(true);
      await confirmInventoryServiceOutbound(Number(afterServiceDetail.id));
      invalidateAfterServiceQueries();
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      toast.success("A/S 출고가 확정되었습니다.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message.includes("PURCHASE_COST_HISTORY_INSUFFICIENT")) {
        toast.error("자동 배분할 기존 매입 이력 수량이 부족합니다.");
      } else if (message.includes("INSUFFICIENT_INVENTORY")) {
        toast.error("현재 재고보다 많이 출고할 수 없습니다.");
      } else {
        toast.error(message || "A/S 출고 확정에 실패했습니다.");
      }
    } finally {
      setIsConfirmingOutbound(false);
    }
  };

  const invalidateAfterServiceQueries = () => {
    queryClient.invalidateQueries({ queryKey: afterServiceKeys.lists() });
    queryClient.invalidateQueries({ queryKey: afterServiceKeys.stats() });
    queryClient.invalidateQueries({
      queryKey: afterServiceKeys.detail(afterServiceId),
    });
    if (afterServiceId) {
      queryClient.invalidateQueries({
        queryKey: logKeys.byAfterService(Number(afterServiceId)),
      });
      queryClient.invalidateQueries({
        queryKey: ["after-service-inventory-progress", Number(afterServiceId)],
      });
      queryClient.invalidateQueries({
        queryKey: ["after-service-outbound-cost-allocations", Number(afterServiceId)],
      });
    }
  };

  const handleStatusUpdate = async (values: StatusUpdateFormValues) => {
    if (!afterServiceId || !afterServiceDetail) return;

    try {
      setIsUpdatingStatus(true);
      if (
        values.status === AfterServiceStatusEnum.REPAIR_RETURNED_COMPLETED.value
      ) {
        if (!values.repairReceipt) {
          throw new Error("A/S 교환입고 정보를 확인해 주세요.");
        }
        if (isInventoryServiceCase) {
          await processInventoryServiceInbound({
            afterServiceId,
            arrivedOn: values.repairReceipt.arrivedOn,
            itemName: values.repairReceipt.itemName,
            quantity: values.repairReceipt.quantity,
            memo: values.repairReceipt.memo,
          });
        } else {
          await processAfterServiceRepairReceipt({
            afterServiceId,
            ...values.repairReceipt,
          });
        }
      } else if (
        values.status === AfterServiceStatusEnum.SENT_FOR_REPAIR.value
      ) {
        if (!values.repairIntakeExpense) {
          throw new Error("A/S 수리 접수 정보를 확인해 주세요.");
        }
        await processAfterServiceRepairIntake({
          afterServiceId,
          ...values.repairIntakeExpense,
        });
      } else {
        await updateAfterServiceStatus(
          afterServiceId,
          values.status,
          values.note,
        );
      }

      invalidateAfterServiceQueries();
      if (values.repairIntakeExpense?.hasStoreCost) {
        queryClient.invalidateQueries({ queryKey: ["settlement-expenses"] });
        queryClient.invalidateQueries({
          queryKey: ["settlement-expense-total"],
        });
      }
      close();
      toast.success("상태가 업데이트되었습니다.");
    } catch (err) {
      console.error("Failed to update status:", err);
      // PostgREST/Supabase 오류는 Error 인스턴스가 아닐 수 있다.
      const message = err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null && "message" in err
          ? String((err as { message?: unknown }).message ?? "")
          : "";
      if (message.includes("SUPPLIER_REQUIRED")) {
        toast.error("거래처가 선택되어 있지 않습니다.");
      } else if (message.includes("SUPPLIER_NOT_FOUND")) {
        toast.error("등록된 거래처 정보를 찾을 수 없습니다.");
      } else if (message.includes("AFTER_SERVICE_RECEIPT_ALREADY_EXISTS")) {
        toast.error("이미 A/S 교환입고 처리된 건입니다.");
      } else if (message.includes("ITEM_NOT_FOUND")) {
        toast.error("품목 관리에 등록된 정확한 품목명을 선택해 주세요.");
      } else if (message.includes("AFTER_SERVICE_RECEIVED_DATE_REQUIRED")) {
        toast.error("수리 접수일을 확인해 주세요.");
      } else if (message.includes("STORE_REPAIR_COST_REQUIRED")) {
        toast.error("매장 접수비용 금액을 확인해 주세요.");
      } else if (message.includes("SERVICE_INBOUND_QUANTITY_EXCEEDED")) {
        toast.error("남은 출고 수량보다 많이 입고할 수 없습니다.");
      } else if (message.includes("SERVICE_INBOUND_ITEM_MISMATCH")) {
        toast.error("출고한 품목과 같은 품목만 입고할 수 있습니다.");
      } else if (message.includes("AUTH_REQUIRED")) {
        toast.error("직원 계정 권한을 확인해 주세요. 다시 로그인한 뒤 시도해 주세요.");
      } else {
        toast.error(
          message || "상태 업데이트에 실패했습니다. 다시 시도해 주세요.",
        );
      }
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleStatusAdvance = () => {
    if (!afterServiceDetail) return;
    if (isInventoryServiceCase && !afterServiceDetail.outbound_processed_at) {
      toast.error("마스터의 출고 확정 후 상태를 변경할 수 있습니다.");
      return;
    }

    const rentalLog = logs.find((log) => log.action === "after-service-rental");
    const rentalItemSummary =
      afterServiceDetail.rental_note ??
      getLogValue(rentalLog?.note ?? "", "대여메모");

    open({
      content: (
        <StatusUpdateModal
          currentStatus={afterServiceDetail.status}
          isInventoryProcessed={
            afterServiceDetail.is_loaner_device_issued ?? false
          }
          supplierName={afterServiceDetail.supplier_name}
          customerName={afterServiceDetail.customers?.name}
          customerPhone={afterServiceDetail.customers?.phone}
          originalItemName={afterServiceDetail.item_name}
          originalQuantity={afterServiceDetail.quantity}
          serviceCaseType={afterServiceDetail.service_case_type}
          serviceProgress={inventoryServiceProgressQuery.data}
          rentalItemSummary={rentalItemSummary || undefined}
          onSubmit={handleStatusUpdate}
          onCancel={close}
          isSubmitting={isUpdatingStatus}
        />
      ),
      options: { dismissOnBackdrop: false, dismissOnEsc: true },
    });
  };

  const handleCurrentStatusEdit = (targetLog?: AfterServiceLogType) => {
    if (!afterServiceDetail) return;
    const targetStatus = targetLog?.action.startsWith("after-service-")
      ? targetLog.action.slice("after-service-".length)
      : afterServiceDetail.status;
    if (
      new Set<string>([
        AfterServiceStatusEnum.RECEIVED.value,
        AfterServiceStatusEnum.EXCHANGE.value,
        AfterServiceStatusEnum.RENTAL.value,
      ]).has(targetStatus)
    ) {
      handleEdit(
        targetStatus === AfterServiceStatusEnum.RECEIVED.value ? 2 : 3,
      );
      return;
    }
    if (
      targetStatus ===
        AfterServiceStatusEnum.SENT_FOR_REPAIR.value &&
      intakeExpenseQuery.isPending
    ) {
      toast.error("접수비 정보를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    const statusLog =
      targetLog ??
      logs.find((log) => log.action === `after-service-${targetStatus}`);
    const logLines = (statusLog?.note ?? "").split("\n");
    const logDate = toInputDate(logLines[0] ?? "");
    const initialDate =
      targetStatus ===
      AfterServiceStatusEnum.REPAIR_RETURNED_COMPLETED.value
        ? afterServiceDetail.repair_receipt_arrived_on || logDate
        : targetStatus ===
            AfterServiceStatusEnum.SENT_FOR_REPAIR.value
          ? intakeExpenseQuery.data?.expense_date || logDate
          : logDate;
    const initialMemo = logLines.slice(1).join("\n").trim();

    open({
      content: (
        <StatusUpdateModal
          editMode
          currentStatus={targetStatus}
          initialDate={initialDate || undefined}
          initialMemo={
            targetStatus ===
            AfterServiceStatusEnum.REPAIR_RETURNED_COMPLETED.value
              ? afterServiceDetail.repair_receipt_note || initialMemo
              : initialMemo
          }
          initialHasStoreCost={Boolean(intakeExpenseQuery.data)}
          initialStoreCostAmount={
            intakeExpenseQuery.data?.store_cost_amount ?? null
          }
          initialReceiptItemName={
            afterServiceDetail.repair_receipt_item_name || undefined
          }
          initialReceiptQuantity={
            afterServiceDetail.repair_receipt_quantity || undefined
          }
          initialReceiptMatchType={
            afterServiceDetail.repair_receipt_match_type || undefined
          }
          isInventoryProcessed={
            afterServiceDetail.is_loaner_device_issued ?? false
          }
          supplierName={afterServiceDetail.supplier_name}
          customerName={afterServiceDetail.customers?.name}
          customerPhone={afterServiceDetail.customers?.phone}
          originalItemName={afterServiceDetail.item_name}
          originalQuantity={afterServiceDetail.quantity}
          serviceCaseType={afterServiceDetail.service_case_type}
          serviceProgress={inventoryServiceProgressQuery.data}
          rentalItemSummary={afterServiceDetail.rental_note || undefined}
          onSubmit={async (values) => {
            const statusDate =
              values.repairReceipt?.arrivedOn ||
              values.repairIntakeExpense?.receivedOn ||
              toInputDate(values.note.split("\n")[0] ?? "");
            if (!statusDate) {
              toast.error("처리일을 확인해 주세요.");
              return;
            }
            try {
              setIsUpdatingStatus(true);
              await editAfterServiceStatusProcessing({
                afterServiceId: String(afterServiceDetail.id),
                logId: statusLog?.id,
                status: values.status,
                statusDate,
                memo:
                  values.repairReceipt?.memo ||
                  values.repairIntakeExpense?.memo ||
                  values.note.split("\n").slice(1).join("\n"),
                hasStoreCost:
                  values.repairIntakeExpense?.hasStoreCost ?? false,
                storeCostAmount:
                  values.repairIntakeExpense?.storeCostAmount ?? null,
              });
              invalidateAfterServiceQueries();
              queryClient.invalidateQueries({
                queryKey: ["after-service-intake-expense", numericAfterServiceId],
              });
              queryClient.invalidateQueries({ queryKey: ["settlement-expenses"] });
              queryClient.invalidateQueries({
                queryKey: ["settlement-expense-total"],
              });
              queryClient.invalidateQueries({ queryKey: ["inventory"] });
              close();
              toast.success("진행상황 내용이 수정되었습니다.");
            } catch (err) {
              const message = err instanceof Error ? err.message : "";
              toast.error(message || "진행상황 수정에 실패했습니다.");
            } finally {
              setIsUpdatingStatus(false);
            }
          }}
          onCancel={close}
          isSubmitting={isUpdatingStatus}
        />
      ),
      options: { dismissOnBackdrop: false, dismissOnEsc: true },
    });
  };

  const handleDelete = async () => {
    if (!afterServiceId) return;

    try {
      setIsDeleting(true);
      await deleteAfterService(afterServiceId);
      toast.success("AS가 삭제되었습니다.");
      close();
      queryClient.invalidateQueries({ queryKey: afterServiceKeys.lists() });
      queryClient.invalidateQueries({ queryKey: afterServiceKeys.stats() });
      if (onDelete) {
        onDelete();
      }
    } catch (err) {
      console.error("Failed to delete AS:", err);
      const message = err instanceof Error ? err.message : "";
      if (
        message.includes("ADMIN_REQUIRED") ||
        message.includes("MASTER_REQUIRED")
      ) {
        toast.error("마스터만 A/S를 삭제할 수 있습니다.");
      } else if (message.includes("AFTER_SERVICE_NOT_FOUND")) {
        toast.error("이미 삭제되었거나 존재하지 않는 A/S입니다.");
      } else {
        toast.error(message || "AS 삭제에 실패했습니다. 다시 시도해 주세요.");
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEdit = (initialStep: 1 | 2 | 3 = 1) => {
    if (!afterServiceDetail || areLogsLoading) return;

    const receivedLog = logs.find(
      (log) => log.action === "after-service-received",
    );
    const rentalLog = logs.find((log) => log.action === "after-service-rental");
    const exchangeLog = logs.find(
      (log) => log.action === "after-service-exchange",
    );
    const receivedNote = receivedLog?.note ?? "";
    const rentalNote = rentalLog?.note ?? "";
    const exchangeNote = exchangeLog?.note ?? "";
    const costText = getLogValue(receivedNote, "A/S 비용");
    const paymentText = getLogValue(receivedNote, "결제방식");
    const parsedCost = Number(costText.replaceAll(",", "").replace("원", ""));
    const isRental =
      Boolean(rentalLog) ||
      afterServiceDetail.status === AfterServiceStatusEnum.RENTAL.value;
    const isExchange =
      Boolean(exchangeLog) ||
      afterServiceDetail.status === AfterServiceStatusEnum.EXCHANGE.value;
    const editableShopNote = (afterServiceDetail.shop_note ?? "")
      .split("\n")
      .filter((line) => !line.startsWith("대여 :") && line !== "교환완료")
      .join("\n");
    const editableCustomerNote = (afterServiceDetail.customer_note ?? "")
      .split("\n")
      .filter((line) => !isGeneratedExchangeCompletionNote(line))
      .join("\n");

    open({
      content: (
        <AfterServiceCreateModal
          mode="edit"
          initialStep={initialStep}
          initialData={{
            customerId: afterServiceDetail.customer_id
              ? String(afterServiceDetail.customer_id)
              : null,
            customerName: afterServiceDetail.customers?.name || null,
            customerPhone: afterServiceDetail.customers?.phone || null,
            itemType: afterServiceDetail.item_type,
            itemName: afterServiceDetail.item_name,
            quantity: afterServiceDetail.quantity,
            symptom: afterServiceDetail.symptom,
            shopNote: editableShopNote || undefined,
            customerNote: editableCustomerNote || undefined,
            isLoanerDeviceIssued:
              afterServiceDetail.is_loaner_device_issued ?? false,
            purchaseDate: toInputDate(
              afterServiceDetail.customer_purchase_date ??
                getLogValue(receivedNote, "고객구매일", "고객 구매일"),
            ),
            receivedDate: toInputDate(
              afterServiceDetail.customer_received_date ??
                getLogValue(receivedNote, "고객접수일", "고객 접수일"),
            ),
            supplierName:
              afterServiceDetail.supplier_name ??
              getLogValue(receivedNote, "도매처"),
            hasAfterServiceCost:
              afterServiceDetail.has_after_service_cost ??
              (costText !== "" && costText !== "X"),
            afterServicePaymentMethod:
              afterServiceDetail.after_service_payment_method ??
              (paymentText === "카드"
                ? "card"
                : paymentText === "이체"
                  ? "transfer"
                  : paymentText === "현금"
                    ? "cash"
                    : undefined),
            afterServiceCostAmount:
              afterServiceDetail.after_service_cost_amount ??
              (Number.isFinite(parsedCost)
                ? parsedCost
                : paymentText === "카드"
                  ? 6600
                  : 6000),
            afterServiceCostMemo:
              afterServiceDetail.after_service_cost_memo ??
              getLogValue(receivedNote, "가격조정 메모"),
            isRentalIssued: afterServiceDetail.is_rental_issued ?? isRental,
            rentalDate: toInputDate(
              afterServiceDetail.rental_date ??
                getLogValue(rentalNote, "대여일"),
            ),
            rentalNote:
              afterServiceDetail.rental_note ??
              getLogValue(rentalNote, "대여메모"),
            isExchangeIssued:
              afterServiceDetail.is_exchange_issued ?? isExchange,
            exchangeDate: toInputDate(
              afterServiceDetail.exchange_date ??
                getLogValue(exchangeNote, "교환일"),
            ),
            exchangeItemId: afterServiceDetail.exchange_item_id ?? undefined,
            exchangeItemName:
              afterServiceDetail.exchange_item_name ??
              getLogValue(exchangeNote, "교환품목"),
            exchangeItemCategoryName:
              afterServiceDetail.exchange_item_category_name ?? undefined,
            exchangeQuantity:
              afterServiceDetail.exchange_quantity ??
              (Number(getLogValue(exchangeNote, "수량").replace("개", "")) ||
                1),
            exchangeNote:
              afterServiceDetail.exchange_note ??
              getLogValue(exchangeNote, "교환메모"),
          }}
          onSubmit={async (values) => {
            if (!afterServiceId) return;
            try {
              setIsUpdating(true);
              await updateAfterService(afterServiceId, {
                customerId: values.customerId || null,
                itemType: values.itemType,
                itemName: values.itemName,
                quantity: values.quantity,
                symptom: values.symptom,
                shopNote: values.shopNote,
                customerNote: values.customerNote,
                isLoanerDeviceIssued: values.isLoanerDeviceIssued,
                intake: {
                  customerPurchaseDate: getLogValue(
                    values.receivedNote ?? "",
                    "고객구매일",
                  ),
                  customerReceivedDate: getLogValue(
                    values.receivedNote ?? "",
                    "고객접수일",
                  ),
                  supplierName: getLogValue(
                    values.receivedNote ?? "",
                    "도매처",
                  ),
                  hasAfterServiceCost: values.hasAfterServiceCost,
                  afterServicePaymentMethod: values.afterServicePaymentMethod,
                  afterServiceCostAmount: values.afterServiceCostAmount,
                  afterServiceCostMemo: values.afterServiceCostMemo,
                  isRentalIssued: values.isRentalIssued,
                  rentalDate: values.rentalDate,
                  rentalNote: values.rentalNote,
                  isExchangeIssued: values.isExchangeIssued,
                  exchangeDate: values.exchangeDate,
                  exchangeItemId: values.exchangeItemId,
                  exchangeItemName: values.exchangeItemName,
                  exchangeItemCategoryName: values.exchangeItemCategoryName,
                  exchangeQuantity: values.exchangeQuantity,
                  exchangeNote: values.exchangeNote,
                },
              });

              if (
                values.isExchangeIssued &&
                !afterServiceDetail.is_exchange_issued
              ) {
                await updateAfterServiceStatus(
                  afterServiceId,
                  AfterServiceStatusEnum.EXCHANGE.value,
                  `교환일 : ${values.exchangeDate?.replaceAll("-", "/") ?? ""}\n교환품목 : ${values.exchangeItemName ?? ""}\n수량 : ${values.exchangeQuantity}개\n교환메모 : ${values.exchangeNote?.trim() ?? ""}`,
                );
              } else if (
                values.isRentalIssued &&
                !afterServiceDetail.is_rental_issued
              ) {
                await updateAfterServiceStatus(
                  afterServiceId,
                  AfterServiceStatusEnum.RENTAL.value,
                  `대여일 : ${values.rentalDate?.replaceAll("-", "/") ?? ""}\n대여메모 : ${values.rentalNote?.trim() ?? ""}`,
                );
              } else if (
                afterServiceDetail.status ===
                  AfterServiceStatusEnum.EXCHANGE.value &&
                !values.isExchangeIssued
              ) {
                await updateAfterServiceStatus(
                  afterServiceId,
                  AfterServiceStatusEnum.RECEIVED.value,
                  "교환 처리 해제",
                );
              } else if (
                afterServiceDetail.status ===
                  AfterServiceStatusEnum.RENTAL.value &&
                !values.isRentalIssued
              ) {
                await updateAfterServiceStatus(
                  afterServiceId,
                  AfterServiceStatusEnum.RECEIVED.value,
                  "대여 처리 해제",
                );
              }

              if (receivedLog) {
                await updateLogNote(
                  receivedLog.id,
                  values.receivedNote?.trim() ?? "",
                );
              }
              if (rentalLog && values.isRentalIssued) {
                await updateLogNote(
                  rentalLog.id,
                  `대여일 : ${values.rentalDate?.replaceAll("-", "/") ?? ""}\n대여메모 : ${values.rentalNote?.trim() ?? ""}`,
                );
              }
              if (
                afterServiceDetail.is_exchange_issued &&
                !values.isExchangeIssued
              ) {
                const linkedExchangeLog = await getAfterServiceStampLog(
                  numericAfterServiceId,
                  "exchange",
                );
                if (linkedExchangeLog) {
                  await deleteLog(String(linkedExchangeLog.id));
                }
              }
              if (values.isExchangeIssued) {
                if (exchangeLog) {
                  await updateLogNote(
                    exchangeLog.id,
                    `교환일 : ${values.exchangeDate?.replaceAll("-", "/") ?? ""}\n교환품목 : ${values.exchangeItemName ?? ""}\n수량 : ${values.exchangeQuantity}개\n교환메모 : ${values.exchangeNote?.trim() ?? ""}`,
                  );
                }

                if (values.customerId) {
                  const linkedExchangeLog = await getAfterServiceStampLog(
                    numericAfterServiceId,
                    "exchange",
                  );
                  const exchangeOutboundLog = linkedExchangeLog;

                  const exchangeDateValue =
                    values.exchangeDate?.replaceAll("-", "/") ?? "";
                  const exchangeRemark = values.exchangeNote?.trim()
                    ? `A/S 교환출고,${values.exchangeNote.trim()}`
                    : "A/S 교환출고";
                  const exchangeLineText = `${values.exchangeItemName} ${values.exchangeQuantity}개 (${exchangeRemark})`;

                  if (exchangeOutboundLog) {
                    const existingItem = (
                      exchangeOutboundLog.jsonb.items as Array<{
                        itemId: string;
                        itemName: string;
                        itemCategoryName?: string | null;
                        inventoryAction?: "exchange_out" | "as_exchange_out";
                      }>
                    ).find(
                      (item) =>
                        item.inventoryAction === "exchange_out" ||
                        item.inventoryAction === "as_exchange_out",
                    )!;
                    await updateStampLogHistoryOnly(
                      String(exchangeOutboundLog.id),
                      `(교환일 ${exchangeDateValue}) ${exchangeLineText}`,
                      PaymentTypeEnum.SHIPMENT_REMARK.value,
                      {
                        afterServiceId: numericAfterServiceId,
                        afterServiceOperation: "exchange",
                        storeName: StoreTypeEnum.OVAPE.value,
                        totalAmount: 0,
                        extraNote: `A/S 교환 · ${exchangeDateValue}`,
                        items: [
                          {
                            itemId:
                              values.exchangeItemId === "existing"
                                ? existingItem.itemId
                                : (values.exchangeItemId ??
                                  existingItem.itemId),
                            itemName:
                              values.exchangeItemName ?? existingItem.itemName,
                            itemCategoryName:
                              values.exchangeItemCategoryName ??
                              existingItem.itemCategoryName ??
                              null,
                            quantity: values.exchangeQuantity,
                            unitPrice: 0,
                            amount: 0,
                            remark: exchangeRemark,
                            lineText: exchangeLineText,
                            inventoryAction: "as_exchange_out",
                          },
                        ],
                      },
                    );
                  } else if (!afterServiceDetail.is_exchange_issued) {
                    await addStamp(
                      values.customerId,
                      0,
                      `(교환일 ${exchangeDateValue}) ${exchangeLineText}`,
                      PaymentTypeEnum.SHIPMENT_REMARK.value,
                      {
                        afterServiceId: numericAfterServiceId,
                        afterServiceOperation: "exchange",
                        storeName: StoreTypeEnum.OVAPE.value,
                        totalAmount: 0,
                        extraNote: `A/S 교환 · ${exchangeDateValue}`,
                        items: [
                          {
                            itemId: values.exchangeItemId ?? "",
                            itemName: values.exchangeItemName ?? "",
                            itemCategoryName:
                              values.exchangeItemCategoryName ?? null,
                            quantity: values.exchangeQuantity,
                            unitPrice: 0,
                            amount: 0,
                            remark: exchangeRemark,
                            lineText: exchangeLineText,
                            inventoryAction: "as_exchange_out",
                          },
                        ],
                      },
                    );
                  }
                }
              }

              if (
                afterServiceDetail.has_after_service_cost &&
                !values.hasAfterServiceCost
              ) {
                const linkedCostLog = await getAfterServiceStampLog(
                  numericAfterServiceId,
                  "cost",
                );
                if (linkedCostLog) {
                  await deleteLog(String(linkedCostLog.id));
                }
              }

              if (
                values.hasAfterServiceCost &&
                values.customerId &&
                values.afterServicePaymentMethod
              ) {
                const linkedCostLog = await getAfterServiceStampLog(
                  numericAfterServiceId,
                  "cost",
                );
                const costLog = linkedCostLog;

                const paymentType = {
                  card: PaymentTypeEnum.CARD,
                  transfer: PaymentTypeEnum.TRANSFER,
                  cash: PaymentTypeEnum.CASH,
                }[values.afterServicePaymentMethod];
                const adjustmentMemo = values.afterServiceCostMemo?.trim();
                const remark = adjustmentMemo
                  ? `가격조정,${adjustmentMemo}`
                  : "";
                const lineText = `A/S 비용 1개${remark ? ` (${remark})` : ""}`;
                const purchaseDate =
                  values.receivedNote
                    ?.split("\n")
                    .find((line) => line.startsWith("고객구매일 :"))
                    ?.replace("고객구매일 :", "")
                    .trim() || "X";
                const outboundNote = `고객 구매일 ${purchaseDate},${values.itemName} ${values.quantity}개 A/S 비용`;

                if (costLog) {
                  const existingCostItem = (
                    costLog.jsonb.items as Array<{
                      itemId: string;
                      itemName: string;
                      itemCategoryName?: string | null;
                    }>
                  ).find((item) => item.itemName === "A/S 비용")!;
                  await updateStampLogHistoryOnly(
                    String(costLog.id),
                    outboundNote,
                    paymentType.value,
                    {
                      afterServiceId: numericAfterServiceId,
                      afterServiceOperation: "cost",
                      storeName: StoreTypeEnum.OVAPE.value,
                      totalAmount: values.afterServiceCostAmount,
                      extraNote: outboundNote,
                      items: [
                        {
                          ...existingCostItem,
                          quantity: 1,
                          unitPrice: values.afterServiceCostAmount,
                          amount: values.afterServiceCostAmount,
                          remark,
                          lineText,
                          inventoryAction: "out",
                        },
                      ],
                    },
                  );
                } else if (!afterServiceDetail.has_after_service_cost) {
                  const costItems = await searchItemOptions("A/S 비용");
                  const costItem = costItems.find(
                    (item) =>
                      item.item_name.normalize("NFC").trim() === "A/S 비용",
                  );
                  if (!costItem) {
                    throw new Error(
                      '품목 관리에서 "A/S 비용" 품목을 찾을 수 없습니다.',
                    );
                  }
                  await addStamp(
                    values.customerId,
                    0,
                    outboundNote,
                    paymentType.value,
                    {
                      afterServiceId: numericAfterServiceId,
                      afterServiceOperation: "cost",
                      storeName: StoreTypeEnum.OVAPE.value,
                      totalAmount: values.afterServiceCostAmount,
                      extraNote: outboundNote,
                      items: [
                        {
                          itemId: String(costItem.id),
                          itemName: costItem.item_name,
                          itemCategoryName:
                            costItem.item_categories?.name ?? null,
                          quantity: 1,
                          unitPrice: values.afterServiceCostAmount,
                          amount: values.afterServiceCostAmount,
                          remark,
                          lineText,
                          inventoryAction: "out",
                        },
                      ],
                    },
                  );
                }
              }
              toast.success("AS 정보가 수정되었습니다.");
              close();
              invalidateAfterServiceQueries();
            } catch (err) {
              console.error("Failed to update AS:", err);
              toast.error("AS 수정에 실패했습니다. 다시 시도해 주세요.");
            } finally {
              setIsUpdating(false);
            }
          }}
          onDelete={handleDelete}
          onCancel={close}
          isSubmitting={isUpdating || isDeleting}
          isAdmin={isMaster}
        />
      ),
      options: { dismissOnBackdrop: false, dismissOnEsc: true },
    });
  };

  return (
    <Drawer isOpen={isOpen} onClose={onClose} width="w-full sm:w-[800px]">
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-brand-100">
          <h2 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-brand-600 to-brand-700 bg-clip-text text-transparent">
            AS 상세
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg
              className="w-5 h-5 sm:w-6 sm:h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {isLoading ? (
            <div className="flex justify-center items-center py-20">
              <Loading size="lg" text="불러오는 중..." />
            </div>
          ) : error ? (
            <div className="flex justify-center items-center py-20">
              <p className="text-red-500">{error}</p>
            </div>
          ) : afterServiceDetail ? (
            <div className="space-y-4 sm:space-y-5 text-xs sm:text-sm">
              {/* 통합 정보 섹션 */}

              <div className="bg-white border border-brand-100 rounded-lg p-4 sm:p-6 shadow-sm">
                {/* 고객 정보 & AS 정보 */}
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                  <h3 className="text-base sm:text-lg font-bold bg-gradient-to-r from-brand-600 to-brand-700 bg-clip-text text-transparent">
                    주요 정보
                  </h3>
                  <Button
                    onClick={() => handleEdit()}
                    disabled={areLogsLoading}
                    variant="secondary"
                    size="sm"
                    aria-label="AS 정보 수정"
                  >
                    ✏️
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] sm:grid-rows-2 gap-3 sm:gap-4 mb-4 sm:mb-6">
                  {/* AS 정보 카드 */}
                  <ASInfoCard
                    itemType={afterServiceDetail.item_type}
                    itemName={afterServiceDetail.item_name}
                    quantity={afterServiceDetail.quantity}
                    createdAt={afterServiceDetail.created_at}
                    isLoanerDeviceIssued={
                      afterServiceDetail.is_loaner_device_issued
                    }
                    user={afterServiceDetail.users}
                  />

                  {/* Status 박스 */}
                  <StatusBox
                    status={afterServiceDetail.status}
                    onEdit={() => handleCurrentStatusEdit()}
                    onAdvance={handleStatusAdvance}
                  />

                  {/* 고객 정보 섹션 */}
                  <CustomerInfoCard
                    customerId={afterServiceDetail.customer_id}
                    customerName={afterServiceDetail.customers?.name}
                    customerPhone={afterServiceDetail.customers?.phone}
                  />
                </div>

                {isInventoryServiceCase && !afterServiceDetail.outbound_processed_at && (
                  <div className="mb-4 flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-bold text-amber-800">출고 승인 대기</p>
                      <p className="mt-0.5 text-xs text-amber-700">마스터가 확정하면 기존 매입 이력에서 원가를 자동 배분하고 재고를 차감합니다.</p>
                    </div>
                    {isMaster && (
                      <Button size="sm" onClick={handleConfirmInventoryOutbound} disabled={isConfirmingOutbound}>
                        {isConfirmingOutbound ? "확정 중..." : "출고 확정"}
                      </Button>
                    )}
                  </div>
                )}

                {isMaster &&
                  (afterServiceDetail.is_loaner_device_issued ||
                    isInventoryServiceCase ||
                    outboundCostAllocationsQuery.isError ||
                    (outboundCostAllocationsQuery.data?.length ?? 0) > 0) && (
                    <section className="mb-4 rounded-xl border border-violet-200 bg-violet-50/70 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-bold text-violet-900">A/S 출고 원가</h4>
                          <p className="mt-0.5 text-xs text-violet-700">
                            실제 출고에 연결된 원가입니다. FIFO 연결 기록과 기존·수동 기록을 구분하며, 미확정 원가는 0원으로 계산하지 않습니다.
                          </p>
                        </div>
                        <span className="rounded-md bg-white px-2 py-1 text-[11px] font-semibold text-violet-700 shadow-sm">
                          마스터 전용
                        </span>
                      </div>
                      {outboundCostAllocationsQuery.isPending ? (
                        <div className="py-4"><Loading size="sm" /></div>
                      ) : outboundCostAllocationsQuery.isError ? (
                        <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                          출고 원가를 불러오지 못했습니다.
                        </p>
                      ) : outboundCostAllocationsQuery.data?.length ? (
                        <>
                          <div className="mt-3 overflow-x-auto rounded-lg border border-violet-100 bg-white">
                            <table className="w-full min-w-[440px] text-xs">
                              <thead className="bg-violet-50 text-violet-800">
                                <tr>
                                  <th className="px-3 py-2 text-left font-semibold">원가 출처</th>
                                  <th className="px-3 py-2 text-right font-semibold">출고 단가</th>
                                  <th className="px-3 py-2 text-right font-semibold">출고 수량</th>
                                  <th className="px-3 py-2 text-right font-semibold">입고 완료</th>
                                  <th className="px-3 py-2 text-right font-semibold">미입고</th>
                                  <th className="px-3 py-2 text-right font-semibold">출고 원가</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-violet-100">
                                {outboundCostAllocationsQuery.data.map((allocation) => (
                                  <tr key={allocation.id} className="text-gray-700">
                                    <td className="px-3 py-2">{allocation.cost_source}</td>
                                    <td className="px-3 py-2 text-right">{allocation.unit_price === null ? "미확정" : `${allocation.unit_price.toLocaleString("ko-KR")}원`}</td>
                                    <td className="px-3 py-2 text-right">{allocation.outbound_quantity.toLocaleString("ko-KR")}개</td>
                                    <td className="px-3 py-2 text-right">{allocation.received_quantity.toLocaleString("ko-KR")}개</td>
                                    <td className="px-3 py-2 text-right">{(allocation.outbound_quantity - allocation.received_quantity).toLocaleString("ko-KR")}개</td>
                                    <td className="px-3 py-2 text-right font-semibold text-violet-900">{allocation.unit_price === null ? "미확정" : `${(allocation.unit_price * allocation.outbound_quantity).toLocaleString("ko-KR")}원`}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <p className="mt-3 text-right text-sm font-bold text-violet-900">
                            출고 원가 합계 {outboundCostAllocationsQuery.data.some(allocation => allocation.unit_price === null)
                              ? "미확정 포함"
                              : `${outboundCostAllocationsQuery.data.reduce((total, allocation) => total + (allocation.unit_price ?? 0) * allocation.outbound_quantity, 0).toLocaleString("ko-KR")}원`}
                          </p>
                        </>
                      ) : (
                        <div className="mt-3 rounded-lg border border-dashed border-violet-200 bg-white p-3">
                          <p className="text-xs text-violet-700">현재 출고 원가 배정 이력이 없습니다.</p>
                          {canSetManualCost && (
                            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                              <label className="flex-1 text-xs font-semibold text-gray-700">
                                실제 단가
                                <input
                                  value={manualCost}
                                  onChange={(event) => setManualCost(event.target.value.replace(/[^0-9]/g, ""))}
                                  inputMode="numeric"
                                  placeholder="예: 25000"
                                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 shadow-sm outline-none transition placeholder:font-normal placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                                />
                              </label>
                              <Button size="sm" onClick={handleSaveManualCost} disabled={isSavingManualCost}>
                                {isSavingManualCost ? "등록 중..." : "원가 등록"}
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </section>
                  )}

                {/* 증상 카드 */}
                <SymptomCard symptom={afterServiceDetail.symptom} />

                {/* 고객 특이사항 */}
                {afterServiceDetail.customer_note && (
                  <NoteCard
                    note={afterServiceDetail.customer_note}
                    title="고객 특이사항"
                  />
                )}

                {/* 매장 특이사항 */}
                {afterServiceDetail.shop_note && (
                  <NoteCard
                    note={afterServiceDetail.shop_note}
                    title="매장 특이사항"
                  />
                )}

                {/* 수정일 (있는 경우) */}
                {afterServiceDetail.updated_at && (
                  <UpdatedDate updatedAt={afterServiceDetail.updated_at} />
                )}
              </div>

              {/* AS 이력 */}
              <AfterServiceLogList
                afterServiceId={Number(afterServiceDetail.id)}
                onEditProcessing={handleCurrentStatusEdit}
              />
            </div>
          ) : null}
        </div>
      </div>
    </Drawer>
  );
};

export default AfterServiceDetailDrawer;
