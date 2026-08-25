"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import Button from "@/app/_components/Button";
import { useModal } from "@/app/_contexts/ModalContext";
import AfterServiceCreateModal from "./_components/AfterServiceCreateModal";
import AfterServiceList from "./_components/AfterServiceList";
import AfterServiceDetailDrawer from "./_components/AfterServiceDetailDrawer";
import {
  createAfterService,
  deleteAfterService,
} from "@/app/_domains/_afterService/_services/afterService";
import toast from "react-hot-toast";
import AfterServiceSearchBox from "./_components/AfterServiceSearchBox";
import AfterServiceProgressBox from "./_components/AfterServiceProgressBox";
import { afterServiceKeys } from "@/app/_domains/_afterService/_queryKeys/afterServiceKeys";
import { addStamp } from "@/app/_domains/_stamp/_services/stampService";
import { logKeys } from "@/app/_domains/_log/_queryKeys/logKeys";
import { searchItemOptions } from "@/app/_domains/_item/_services/itemService";
import {
  deleteLog,
  getAfterServiceStampLog,
} from "@/app/_domains/_log/_services/logService";

const getReceivedValue = (note: string | undefined, label: string) =>
  note
    ?.split("\n")
    .find((line) => line.startsWith(`${label} :`))
    ?.replace(`${label} :`, "")
    .trim() ?? "";

const normalizeIntakeDate = (value: string) => {
  if (value === "X") return "X";
  const parts = value.match(/(\d{2,4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!parts) return "";
  const year = parts[1].length === 2 ? `20${parts[1]}` : parts[1];
  return `${year}-${parts[2].padStart(2, "0")}-${parts[3].padStart(2, "0")}`;
};
import {
  AfterServiceStatusEnum,
  PaymentTypeEnum,
  StoreTypeEnum,
} from "@/app/_enums/enums";

const AfterServicesPage = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { open, close } = useModal();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusValue, setStatusValue] = useState("all");
  const [filters, setFilters] = useState<{
    status?: string;
    groupStatus?: "received" | "inProgress" | "completed";
    searchTarget?: string;
    searchKeyword?: string;
  }>(() =>
    searchParams.get("group") === "inProgress"
      ? { groupStatus: "inProgress" }
      : {},
  );

  useEffect(() => {
    if (searchParams.get("group") === "inProgress") {
      setFilters((current) => ({
        ...current,
        groupStatus: "inProgress",
        status: undefined,
      }));
      setStatusValue("all");
    }
  }, [searchParams]);

  // 쿼리 파라미터에서 id 가져오기
  const selectedAfterServiceId = searchParams.get("id");
  const isDrawerOpen = !!selectedAfterServiceId;

  // ========================================================================
  // AS 생성 핸들러
  // ========================================================================
  const handleAfterServiceSubmit = async (values: {
    caseType: "customer_as" | "vendor_exchange" | "store_product_as";
    supplierId: string;
    costAllocations: Array<{
      sourceReceiptLineId: string | null;
      unitPrice: number;
      quantity: number;
    }>;
    customerId: string;
    itemType: string;
    itemName: string;
    quantity: number;
    symptom: string;
    hasAfterServiceCost: boolean;
    afterServicePaymentMethod?: "card" | "transfer" | "cash";
    afterServiceCostAmount: number;
    afterServiceCostMemo?: string;
    shopNote?: string;
    customerNote?: string;
    isLoanerDeviceIssued: boolean;
    receivedNote?: string;
    isRentalIssued: boolean;
    rentalDate?: string;
    rentalNote?: string;
    isExchangeIssued: boolean;
    exchangeDate?: string;
    exchangeItemId?: string;
    exchangeItemName?: string;
    exchangeItemCategoryName?: string;
    exchangeQuantity: number;
    exchangeNote?: string;
  }) => {
    let createdAfterServiceId: number | null = null;
    try {
      setIsSubmitting(true);

      if (
        values.isExchangeIssued &&
        (!values.customerId ||
          !values.exchangeItemId ||
          !values.exchangeItemName)
      ) {
        throw new Error("A/S 교환출고에 필요한 고객과 품목 정보를 확인해 주세요.");
      }
      if (
        values.hasAfterServiceCost &&
        (!values.customerId || !values.afterServicePaymentMethod)
      ) {
        throw new Error(
          "A/S 비용 매출 처리에 필요한 고객과 결제방식을 확인해 주세요.",
        );
      }
      const afterServiceCostItem = values.hasAfterServiceCost
        ? (await searchItemOptions("A/S 비용")).find(
            (item) => item.item_name.normalize("NFC").trim() === "A/S 비용",
          )
        : undefined;
      if (values.hasAfterServiceCost && !afterServiceCostItem) {
        throw new Error('품목 관리에서 "A/S 비용" 품목을 찾을 수 없습니다.');
      }

      const createdAfterService = await createAfterService({
        customerId:
          values.customerId.length > 0 ? String(values.customerId) : null,
        itemType: values.itemType,
        itemName: values.itemName,
        quantity: values.quantity,
        symptom: values.symptom,
        shopNote: values.shopNote,
        customerNote: values.customerNote,
        isLoanerDeviceIssued: values.isLoanerDeviceIssued,
        caseType: values.caseType,
        supplierId: values.caseType === "customer_as" ? undefined : values.supplierId,
        status: values.isExchangeIssued
          ? AfterServiceStatusEnum.EXCHANGE.value
          : values.isRentalIssued
            ? AfterServiceStatusEnum.RENTAL.value
            : AfterServiceStatusEnum.RECEIVED.value,
        receivedNote: values.receivedNote?.trim(),
        statusNote: values.isRentalIssued
          ? `대여일 : ${values.rentalDate?.replaceAll("-", "/") ?? ""}\n대여메모 : ${values.rentalNote?.trim() ?? ""}`
          : values.isExchangeIssued
            ? `교환일 : ${values.exchangeDate?.replaceAll("-", "/") ?? ""}\n교환품목 : ${values.exchangeItemName ?? ""}\n수량 : ${values.exchangeQuantity}개\n교환메모 : ${values.exchangeNote?.trim() ?? ""}`
            : "",
        intake: {
          customerPurchaseDate: normalizeIntakeDate(
            getReceivedValue(values.receivedNote, "고객구매일"),
          ),
          customerReceivedDate: normalizeIntakeDate(
            getReceivedValue(values.receivedNote, "고객접수일"),
          ),
          supplierName: getReceivedValue(values.receivedNote, "도매처"),
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
      createdAfterServiceId = Number(createdAfterService.id);

      if (values.isExchangeIssued) {
        const exchangeRemark = values.exchangeNote?.trim()
          ? `A/S 교환출고,${values.exchangeNote.trim()}`
          : "A/S 교환출고";
        const exchangeLineText = `${values.exchangeItemName} ${values.exchangeQuantity}개 (${exchangeRemark})`;
        const exchangeDate = values.exchangeDate?.replaceAll("-", "/") ?? "";

        await addStamp(
          values.customerId,
          0,
          `(교환일 ${exchangeDate}) ${exchangeLineText}`,
          PaymentTypeEnum.SHIPMENT_REMARK.value,
          {
            afterServiceId: createdAfterServiceId,
            afterServiceOperation: "exchange",
            storeName: StoreTypeEnum.OVAPE.value,
            totalAmount: 0,
            extraNote: `A/S 교환 · ${exchangeDate}`,
            items: [
              {
                itemId: values.exchangeItemId!,
                itemName: values.exchangeItemName!,
                itemCategoryName: values.exchangeItemCategoryName ?? null,
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

      if (values.hasAfterServiceCost) {
        const paymentType = {
          card: PaymentTypeEnum.CARD,
          transfer: PaymentTypeEnum.TRANSFER,
          cash: PaymentTypeEnum.CASH,
        }[values.afterServicePaymentMethod!];
        const costMemo = values.afterServiceCostMemo?.trim();
        const costItem = afterServiceCostItem!;
        const costRemark = costMemo ? `가격조정,${costMemo}` : "";
        const costLineText = `A/S 비용 1개${costRemark ? ` (${costRemark})` : ""}`;
        const purchaseDate =
          values.receivedNote
            ?.split("\n")
            .find((line) => line.startsWith("고객구매일 :"))
            ?.replace("고객구매일 :", "")
            .trim() || "X";
        const costOutboundNote = `고객 구매일 ${purchaseDate},${values.itemName} ${values.quantity}개 A/S 비용`;

        await addStamp(
          values.customerId,
          0,
          costOutboundNote,
          paymentType.value,
          {
            afterServiceId: createdAfterServiceId,
            afterServiceOperation: "cost",
            storeName: StoreTypeEnum.OVAPE.value,
            totalAmount: values.afterServiceCostAmount,
            extraNote: costOutboundNote,
            items: [
              {
                itemId: String(costItem.id),
                itemName: costItem.item_name,
                itemCategoryName: costItem.item_categories?.name ?? null,
                quantity: 1,
                unitPrice: values.afterServiceCostAmount,
                amount: values.afterServiceCostAmount,
                remark: costRemark,
                lineText: costLineText,
                inventoryAction: "out",
              },
            ],
          },
        );
      }

      toast.success("AS가 등록되었습니다.");
      close();
      queryClient.invalidateQueries({ queryKey: afterServiceKeys.lists() });
      queryClient.invalidateQueries({ queryKey: afterServiceKeys.stats() });
      queryClient.invalidateQueries({ queryKey: logKeys.lists() });
    } catch (err) {
      if (createdAfterServiceId) {
        try {
          for (const operation of ["exchange", "cost"] as const) {
            const linkedLog = await getAfterServiceStampLog(
              createdAfterServiceId,
              operation,
            );
            if (linkedLog) await deleteLog(String(linkedLog.id));
          }
          await deleteAfterService(String(createdAfterServiceId));
        } catch (rollbackError) {
          console.error("A/S 등록 롤백 실패:", rollbackError);
        }
      }
      console.error("AS 등록 실패:", err);
      toast.error(
        err instanceof Error && err.message.includes("INSUFFICIENT_INVENTORY")
          ? "현재 재고보다 많이 출고할 수 없습니다."
          : err instanceof Error
            ? err.message
            : "AS 등록에 실패했습니다.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusChange = (status: string) => {
    setStatusValue(status);
    if (filters.groupStatus) {
      return;
    }
    setFilters((prev) => ({
      ...prev,
      status,
    }));
  };

  const handleSearch = (target: string, keyword: string) => {
    setFilters((prev) => ({
      ...prev,
      searchTarget: target,
      searchKeyword: keyword,
    }));
  };

  const handleGroupClick = (
    group: "all" | "received" | "inProgress" | "completed",
  ) => {
    if (group === "all") {
      setFilters((prev) => {
        const nextFilters = { ...prev };
        delete nextFilters.groupStatus;
        return nextFilters;
      });
    } else {
      setFilters((prev) => ({
        ...prev,
        groupStatus: group,
        status: undefined,
      }));
      setStatusValue("all");
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-10 space-y-4">
      <AfterServiceSearchBox
        statusValue={statusValue}
        onStatusChange={handleStatusChange}
        onSearch={handleSearch}
        disabled={!!filters.groupStatus}
      />
      <div className="flex flex-col gap-2 justify-between">
        <AfterServiceProgressBox
          onGroupClick={handleGroupClick}
          selectedGroup={filters.groupStatus}
          onClearGroup={() => {
            setFilters((prev) => {
              const nextFilters = { ...prev };
              delete nextFilters.groupStatus;
              return nextFilters;
            });
          }}
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            className="min-w-20 sm:min-w-24"
            onClick={() => {
              setIsSubmitting(false);
              open({
                content: (
                  <AfterServiceCreateModal
                    onCancel={close}
                    isSubmitting={isSubmitting}
                    onSubmit={handleAfterServiceSubmit}
                  />
                ),
                options: { dismissOnBackdrop: false, dismissOnEsc: true },
              });
            }}
          >
            AS 생성
          </Button>
        </div>
      </div>

      {/* AS 상세 Drawer */}
      <AfterServiceDetailDrawer
        isOpen={isDrawerOpen}
        onClose={() => {
          const params = new URLSearchParams(searchParams.toString());
          params.delete("id");
          const newSearch = params.toString();
          router.push(newSearch ? `${pathname}?${newSearch}` : pathname);
        }}
        afterServiceId={selectedAfterServiceId}
        onDelete={() => {
          const params = new URLSearchParams(searchParams.toString());
          params.delete("id");
          const newSearch = params.toString();
          router.push(newSearch ? `${pathname}?${newSearch}` : pathname);
        }}
      />

      {/* AS 목록 */}
      <AfterServiceList
        filters={filters}
        onRowClick={(id) => {
          // 쿼리 파라미터에 id 추가
          const params = new URLSearchParams(searchParams.toString());
          params.set("id", id);
          router.push(`${pathname}?${params.toString()}`);
        }}
      />
    </div>
  );
};

export default AfterServicesPage;
