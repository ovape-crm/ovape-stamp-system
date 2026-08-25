"use client";

import { useDeferredValue, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Controller, Resolver, useForm } from "react-hook-form";
import { z } from "zod";
import Button from "@/app/_components/Button";
import KoreanDatePicker from "@/app/_components/KoreanDatePicker";
import {
  AfterServiceStatusEnum,
  AfterServiceStatusEnumType,
} from "@/app/_enums/enums";
import { Dropdown, DropdownOption } from "@/app/_components/Dropdown";
import { searchItemOptions } from "@/app/_domains/_item/_services/itemService";
import { InventoryServiceProgress } from "@/app/_domains/_afterService/_services/afterService";

export type StatusUpdateFormValues = {
  status: AfterServiceStatusEnumType["value"];
  note: string;
  repairReceipt?: {
    arrivedOn: string;
    itemName: string;
    quantity: number;
    matchType: "match" | "mismatch";
    memo: string;
  };
  repairIntakeExpense?: {
    receivedOn: string;
    memo: string;
    hasStoreCost: boolean;
    storeCostAmount: number | null;
  };
};

const getTodayDateValue = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
};

const schema = z.object({
  status: z.enum(
    Object.values(AfterServiceStatusEnum).map((opt) => opt.value) as [
      AfterServiceStatusEnumType["value"],
      ...AfterServiceStatusEnumType["value"][],
    ],
    { message: "상태를 선택하세요." },
  ),
  note: z
    .string()
    .trim()
    .max(500, { message: "메모는 500자 이하로 입력하세요." }),
});

const safeResolver = (schema: z.ZodTypeAny) => async (data: unknown) => {
  try {
    const parsed = await schema.safeParseAsync(data);
    if (parsed.success) return { values: parsed.data, errors: {} };

    const formattedErrors = parsed.error.format();
    const errors: Record<string, { type: string; message: string }> = {};

    Object.keys(formattedErrors).forEach((key) => {
      if (key !== "_errors" && formattedErrors[key]?._errors?.length > 0) {
        errors[key] = {
          type: "validation",
          message: formattedErrors[key]._errors[0],
        };
      }
    });

    return { values: {}, errors };
  } catch (err) {
    console.error("[safeResolver Error]", err);
    return { values: {}, errors: {} };
  }
};

interface StatusUpdateModalProps {
  currentStatus: string;
  isInventoryProcessed: boolean;
  supplierName?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  originalItemName: string;
  originalQuantity: number;
  serviceCaseType?: "customer_as" | "vendor_exchange" | "store_product_as";
  serviceProgress?: InventoryServiceProgress;
  rentalItemSummary?: string;
  onSubmit: (values: StatusUpdateFormValues) => Promise<void> | void;
  onCancel: () => void;
  isSubmitting: boolean;
}

const StatusUpdateModal = ({
  currentStatus,
  isInventoryProcessed,
  supplierName,
  customerName,
  customerPhone,
  originalItemName,
  originalQuantity,
  serviceCaseType = "customer_as",
  serviceProgress,
  rentalItemSummary,
  onSubmit,
  onCancel,
  isSubmitting,
}: StatusUpdateModalProps) => {
  const [statusDate, setStatusDate] = useState(getTodayDateValue);
  const [statusMemo, setStatusMemo] = useState("");
  const [hasStoreRepairCost, setHasStoreRepairCost] = useState(false);
  const [storeRepairCostAmount, setStoreRepairCostAmount] = useState("");
  const [isInventoryReceiptConfirmed, setIsInventoryReceiptConfirmed] =
    useState(false);
  const [isCustomerContactConfirmed, setIsCustomerContactConfirmed] =
    useState(false);
  const [isRentalReturnConfirmed, setIsRentalReturnConfirmed] = useState(false);
  const [receiptItemName, setReceiptItemName] = useState(originalItemName);
  const [showReceiptItemSuggestions, setShowReceiptItemSuggestions] =
    useState(false);
  const [receiptQuantity, setReceiptQuantity] = useState(
    String(serviceProgress?.remaining_quantity ?? originalQuantity),
  );
  const [receiptMatchType, setReceiptMatchType] = useState<
    "" | "match" | "mismatch"
  >("");
  const deferredReceiptItemName = useDeferredValue(receiptItemName.trim());
  const receiptItemsQuery = useQuery({
    queryKey: ["as-repair-receipt-items", deferredReceiptItemName],
    queryFn: () => searchItemOptions(deferredReceiptItemName, 12),
    enabled: deferredReceiptItemName.length > 0,
  });
  const {
    register,
    handleSubmit,
    formState: { errors },
    control,
    watch,
  } = useForm<StatusUpdateFormValues>({
    mode: "onChange",
    resolver: safeResolver(schema) as Resolver<StatusUpdateFormValues, unknown>,
    defaultValues: {
      status: undefined,
      note: "",
    },
  });

  const statusOptions: DropdownOption[] = Object.values(AfterServiceStatusEnum)
    .filter((opt) => {
      if (opt.value === currentStatus) {
        return false;
      }
      if (
        opt.value === AfterServiceStatusEnum.RECEIVED.value ||
        opt.value === AfterServiceStatusEnum.EXCHANGE.value ||
        opt.value === AfterServiceStatusEnum.RENTAL.value
      ) {
        return false;
      }
      if (opt.value === AfterServiceStatusEnum.REPAIR_RETURNED.value) {
        return !isInventoryProcessed;
      }
      if (
        opt.value === AfterServiceStatusEnum.REPAIR_RETURNED_COMPLETED.value
      ) {
        return true;
      }
      if (opt.value === AfterServiceStatusEnum.CUSTOMER_RECEIVED.value) {
        return !isInventoryProcessed;
      }
      return true;
    })
    .map((opt) => ({
      label: opt.name,
      value: opt.value,
    }));

  const selectedStatus = watch("status");
  const currentStatusInfo = Object.values(AfterServiceStatusEnum).find(
    (opt) => opt.value === currentStatus,
  );

  // 상태별 메모 가이드 텍스트
  const getStatusMemoGuide = (status: string): string => {
    switch (status) {
      case AfterServiceStatusEnum.RECEIVED.value:
        return "고객구매일 : 00/00/00\n고객접수일 : 00/00/00\n도매처 : @";
      case AfterServiceStatusEnum.EXCHANGE.value:
        return "교환일 : 00/00/00\n교환 제품명,색깔 : @";
      case AfterServiceStatusEnum.RENTAL.value:
        return "대여일 : 00/00/00\n대여 제품명,색깔 : @";
      case AfterServiceStatusEnum.SENT_FOR_REPAIR.value:
        return "접수일 : 00/00/00";
      case AfterServiceStatusEnum.REPAIR_RETURNED.value:
      case AfterServiceStatusEnum.REPAIR_RETURNED_COMPLETED.value:
        return "입고일 : 00/00/00";
      case AfterServiceStatusEnum.REPAIR_REJECTED.value:
      case AfterServiceStatusEnum.OTHER_COMPLETED.value:
      case AfterServiceStatusEnum.OTHER_RECEIVED.value:
        return "특이사항을 입력하세요.";
      case AfterServiceStatusEnum.CUSTOMER_RECEIVED.value:
        return "수령일 : 00/00/00";
      case AfterServiceStatusEnum.RETURNED.value:
        return "반품일 : 00/00/00";
      default:
        return "특이사항을 입력하세요.";
    }
  };

  const selectedStatusMemoGuide = getStatusMemoGuide(selectedStatus || "");
  const requiresInventoryReceiptConfirmation =
    selectedStatus === AfterServiceStatusEnum.REPAIR_RETURNED_COMPLETED.value;
  const requiresRepairIntakeExpense =
    selectedStatus === AfterServiceStatusEnum.SENT_FOR_REPAIR.value;
  const parsedStoreRepairCostAmount = Number(storeRepairCostAmount);
  const isStoreRepairCostValid =
    !hasStoreRepairCost ||
    (Number.isInteger(parsedStoreRepairCostAmount) &&
      parsedStoreRepairCostAmount > 0);
  const normalizedSupplierName = supplierName?.trim() ?? "";
  const hasRegisteredSupplier =
    normalizedSupplierName.length > 0 &&
    !["나중에 선택", "나중에선택", "나중에 수정", "나중에수정"].includes(
      normalizedSupplierName,
    );
  const parsedReceiptQuantity = Number(receiptQuantity);
  const isInventoryServiceCase =
    serviceCaseType === "vendor_exchange" ||
    serviceCaseType === "store_product_as";
  const maximumReceiptQuantity = isInventoryServiceCase
    ? (serviceProgress?.remaining_quantity ?? originalQuantity)
    : null;
  const receiptValuesDiffer =
    receiptItemName.trim() !== originalItemName.trim() ||
    parsedReceiptQuantity !== originalQuantity;
  const isRepairReceiptValid =
    !requiresInventoryReceiptConfirmation ||
    (hasRegisteredSupplier &&
      receiptItemName.trim().length > 0 &&
      Number.isInteger(parsedReceiptQuantity) &&
      parsedReceiptQuantity > 0 &&
      (!isInventoryServiceCase ||
        (receiptItemName.trim() === originalItemName.trim() &&
          parsedReceiptQuantity <= maximumReceiptQuantity!)) &&
      (isInventoryServiceCase ||
        (receiptValuesDiffer && receiptMatchType === "mismatch") ||
        (!receiptValuesDiffer && receiptMatchType === "match")));
  const requiresCustomerContactConfirmation =
    selectedStatus === AfterServiceStatusEnum.REPAIR_RETURNED.value;
  const requiresRentalReturnConfirmation =
    selectedStatus === AfterServiceStatusEnum.CUSTOMER_RECEIVED.value &&
    Boolean(rentalItemSummary);
  const structuredStatusConfig = (() => {
    switch (selectedStatus) {
      case AfterServiceStatusEnum.SENT_FOR_REPAIR.value:
        return {
          dateLabel: "접수일",
          memoPlaceholder: "메모를 입력하세요. (선택)",
          memoRequired: false,
        };
      case AfterServiceStatusEnum.REPAIR_RETURNED_COMPLETED.value:
        return {
          dateLabel: "입고일",
          memoPlaceholder: "메모를 입력하세요. (선택)",
          memoRequired: false,
        };
      case AfterServiceStatusEnum.REPAIR_RETURNED.value:
        return {
          dateLabel: "입고일",
          memoPlaceholder: "메모를 입력하세요. (선택)",
          memoRequired: false,
        };
      case AfterServiceStatusEnum.CUSTOMER_RECEIVED.value:
        return {
          dateLabel: "수령일",
          memoPlaceholder: "메모를 입력하세요. (선택)",
          memoRequired: false,
        };
      case AfterServiceStatusEnum.REPAIR_REJECTED.value:
        return {
          dateLabel: "A/S 불가 처리일",
          memoPlaceholder: "A/S 불가 사유를 입력해주세요.",
          memoRequired: true,
        };
      case AfterServiceStatusEnum.RETURNED.value:
        return {
          dateLabel: "반품일",
          memoPlaceholder: "반품처리 사유를 입력하세요.",
          memoRequired: true,
        };
      case AfterServiceStatusEnum.OTHER_COMPLETED.value:
        return {
          dateLabel: "완료일",
          memoPlaceholder: "기타 사유를 입력하세요.",
          memoRequired: true,
        };
      case AfterServiceStatusEnum.OTHER_RECEIVED.value:
        return {
          dateLabel: "작성일",
          memoPlaceholder: "기타 사유를 입력하세요.",
          memoRequired: true,
        };
      default:
        return null;
    }
  })();
  const handleStatusSubmit = (values: StatusUpdateFormValues) => {
    if (structuredStatusConfig) {
      if (
        !statusDate ||
        (structuredStatusConfig.memoRequired && !statusMemo.trim()) ||
        (requiresInventoryReceiptConfirmation &&
          (!isInventoryReceiptConfirmed || !isRepairReceiptValid)) ||
        (requiresCustomerContactConfirmation && !isCustomerContactConfirmed) ||
        (requiresRentalReturnConfirmation && !isRentalReturnConfirmed) ||
        (requiresRepairIntakeExpense && !isStoreRepairCostValid)
      ) {
        return;
      }
      const formattedDate = statusDate.replaceAll("-", "/");
      return onSubmit({
        ...values,
        note: [
          `${structuredStatusConfig.dateLabel} : ${formattedDate}`,
          statusMemo.trim(),
        ]
          .filter(Boolean)
          .join("\n"),
        repairReceipt: requiresInventoryReceiptConfirmation
          ? {
              arrivedOn: statusDate,
              itemName: receiptItemName.trim(),
              quantity: parsedReceiptQuantity,
              matchType: isInventoryServiceCase
                ? "match"
                : (receiptMatchType as "match" | "mismatch"),
              memo: statusMemo.trim(),
            }
          : undefined,
        repairIntakeExpense: requiresRepairIntakeExpense
          ? {
              receivedOn: statusDate,
              memo: statusMemo.trim(),
              hasStoreCost: hasStoreRepairCost,
              storeCostAmount: hasStoreRepairCost
                ? parsedStoreRepairCostAmount
                : null,
            }
          : undefined,
      });
    }
    return onSubmit(values);
  };

  return (
    <form
      onSubmit={handleSubmit(handleStatusSubmit)}
      className="w-full"
      noValidate
    >
      <h2 className="text-lg font-semibold mb-3">상태 수정</h2>

      <div className="space-y-3">
        {/* 현재 상태 */}
        <div>
          <label className="block text-sm font-medium mb-1">현재 상태</label>
          <div className="flex w-full items-center justify-between gap-2 rounded-lg border border-brand-200 bg-white/70 px-3 py-1.5 text-left text-xs font-medium text-brand-700 shadow-sm sm:px-6 sm:py-2 sm:text-base">
            <span className="min-w-0 flex-1 truncate text-left">
              {currentStatusInfo?.name || currentStatus}
            </span>
            <span className="h-4 w-4 shrink-0" aria-hidden="true" />
          </div>
        </div>

        {/* 상태 선택 */}
        <div>
          <label className="block text-sm font-medium mb-1">
            변경할 상태 <span className="text-rose-600">*</span>
          </label>
          <Controller
            name="status"
            control={control}
            render={({ field }) => (
              <Dropdown>
                <Dropdown.Trigger>
                  <span className="block w-full text-left">
                    {statusOptions.find((opt) => opt.value === field.value)
                      ?.label || "선택하기"}
                  </span>
                </Dropdown.Trigger>
                <Dropdown.Content>
                  {statusOptions.map((option) => (
                    <Dropdown.Item
                      key={option.value}
                      option={option}
                      onSelect={(option: DropdownOption) => {
                        field.onChange(option.value);
                        setStatusDate(getTodayDateValue());
                        setStatusMemo("");
                        setHasStoreRepairCost(false);
                        setStoreRepairCostAmount("");
                        setIsInventoryReceiptConfirmed(false);
                        setIsCustomerContactConfirmed(false);
                        setIsRentalReturnConfirmed(false);
                        setReceiptItemName(originalItemName);
                        setShowReceiptItemSuggestions(false);
                        setReceiptQuantity(String(originalQuantity));
                        setReceiptMatchType("");
                      }}
                    />
                  ))}
                </Dropdown.Content>
              </Dropdown>
            )}
          />
          {errors.status && (
            <p className="mt-1 text-xs text-rose-600">
              {errors.status.message}
            </p>
          )}
        </div>

        {selectedStatus &&
          (structuredStatusConfig ? (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {structuredStatusConfig.dateLabel}{" "}
                  <span className="text-rose-600">*</span>
                </label>
                <KoreanDatePicker
                  value={statusDate}
                  onChange={setStatusDate}
                  align="left"
                  floating
                />
              </div>
              {requiresInventoryReceiptConfirmation && (
                <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50/70 p-4">
                  {!hasRegisteredSupplier ? (
                    <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                      거래처가 선택되어 있지 않습니다.
                    </p>
                  ) : (
                    <>
                      <div className="grid gap-2 text-sm sm:grid-cols-2">
                        <p className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                          <span className="text-xs font-semibold text-gray-500">
                            거래처명
                          </span>
                          <span className="mt-1 block font-semibold text-gray-900">
                            {normalizedSupplierName}
                          </span>
                        </p>
                        <p className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                          <span className="text-xs font-semibold text-gray-500">
                            고객
                          </span>
                          <span className="mt-1 block font-semibold text-gray-900">
                            {[customerName, customerPhone]
                              .filter(Boolean)
                              .join(" · ") || "고객 정보 없음"}
                          </span>
                        </p>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_176px]">
                        <label className="relative text-sm font-medium text-gray-700">
                          품목명 <span className="text-rose-600">*</span>
                          <div className="relative mt-1">
                            <svg
                              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              aria-hidden="true"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="m21 21-4.35-4.35m2.1-5.4a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z"
                              />
                            </svg>
                            <input
                              value={receiptItemName}
                              onFocus={() =>
                                setShowReceiptItemSuggestions(true)
                              }
                              onBlur={() =>
                                setShowReceiptItemSuggestions(false)
                              }
                              onChange={(event) => {
                                setReceiptItemName(event.target.value);
                                setReceiptMatchType("");
                                setShowReceiptItemSuggestions(true);
                              }}
                              autoComplete="off"
                              placeholder="품목명을 검색하세요"
                              className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-10 text-sm font-medium text-gray-900 shadow-sm outline-none transition placeholder:font-normal placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                              disabled={isSubmitting}
                            />
                          </div>
                          {showReceiptItemSuggestions &&
                            receiptItemName.trim() && (
                              <div className="absolute z-30 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                                {(receiptItemsQuery.data ?? []).length ? (
                                  (receiptItemsQuery.data ?? []).map((item) => (
                                    <button
                                      key={item.id}
                                      type="button"
                                      onMouseDown={(event) => {
                                        event.preventDefault();
                                        setReceiptItemName(item.item_name);
                                        setReceiptMatchType("");
                                        setShowReceiptItemSuggestions(false);
                                      }}
                                      className="flex w-full items-center justify-between gap-3 border-b border-gray-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-gray-50"
                                    >
                                      <span className="font-medium text-gray-800">
                                        {item.item_name}
                                      </span>
                                      <span className="text-xs text-gray-500">
                                        {item.item_categories?.name ??
                                          "종류 없음"}
                                      </span>
                                    </button>
                                  ))
                                ) : !receiptItemsQuery.isFetching ? (
                                  <p className="px-3 py-3 text-center text-sm text-gray-500">
                                    검색 결과가 없습니다.
                                  </p>
                                ) : null}
                              </div>
                            )}
                        </label>
                        <label className="text-sm font-medium text-gray-700">
                          수량 <span className="text-rose-600">*</span>
                          <div className="mt-1 flex items-center gap-1.5">
                            <input
                              type="number"
                              min={1}
                              max={maximumReceiptQuantity ?? undefined}
                              inputMode="numeric"
                              value={receiptQuantity}
                              onChange={(event) => {
                                setReceiptQuantity(event.target.value);
                                setReceiptMatchType("");
                              }}
                              className="h-10 w-[72px] rounded-lg border border-gray-300 bg-white px-2 text-center text-sm font-medium shadow-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                              disabled={isSubmitting}
                            />
                            {([-1, 1] as const).map((delta) => (
                              <button
                                key={delta}
                                type="button"
                                aria-label={
                                  delta < 0 ? "수량 감소" : "수량 증가"
                                }
                                disabled={
                                  isSubmitting ||
                                  (delta < 0 && parsedReceiptQuantity <= 1) ||
                                  (delta > 0 &&
                                    maximumReceiptQuantity !== null &&
                                    parsedReceiptQuantity >=
                                      maximumReceiptQuantity)
                                }
                                onClick={() => {
                                  setReceiptQuantity(
                                    String(
                                      Math.max(
                                        1,
                                        Math.min(
                                          maximumReceiptQuantity ??
                                            Number.POSITIVE_INFINITY,
                                          (Number.isFinite(
                                            parsedReceiptQuantity,
                                          )
                                            ? parsedReceiptQuantity
                                            : 1) + delta,
                                        ),
                                      ),
                                    ),
                                  );
                                  setReceiptMatchType("");
                                }}
                                className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border border-gray-300 bg-white text-lg text-gray-600 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {delta < 0 ? "−" : "+"}
                              </button>
                            ))}
                          </div>
                          {isInventoryServiceCase && serviceProgress && (
                            <p className="mt-1 text-xs text-gray-500">
                              출고 {serviceProgress.outbound_quantity}개 / 입고 {serviceProgress.received_quantity}개 / 남은 {serviceProgress.remaining_quantity}개
                            </p>
                          )}
                        </label>
                      </div>
                      {!isInventoryServiceCase && <div className="grid grid-cols-2 gap-2">
                        {(
                          [
                            ["match", "제품·수량 일치"],
                            ["mismatch", "제품·수량 불일치"],
                          ] as const
                        ).map(([value, label]) => {
                          const disabled =
                            isSubmitting ||
                            (value === "match" && receiptValuesDiffer) ||
                            (value === "mismatch" && !receiptValuesDiffer);
                          return (
                            <label
                              key={value}
                              className={`flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 text-center text-sm font-semibold transition ${disabled ? "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400" : receiptMatchType === value ? "cursor-pointer border-brand-400 bg-brand-50 text-brand-700" : "cursor-pointer border-gray-300 bg-white text-gray-700 hover:border-brand-300"}`}
                            >
                              <input
                                type="checkbox"
                                checked={receiptMatchType === value}
                                onChange={() => setReceiptMatchType(value)}
                                disabled={disabled}
                                className="h-4 w-4 accent-brand-500"
                              />
                              {label}
                            </label>
                          );
                        })}
                      </div>}
                      <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700">
                        <span className="min-w-0 flex-1 font-semibold">
                          {serviceCaseType === "vendor_exchange"
                            ? "업체 교환입고 처리"
                            : serviceCaseType === "store_product_as"
                              ? "매장제품 A/S 입고 처리"
                              : "A/S 교환입고 처리"}
                        </span>
                        <input
                          type="checkbox"
                          checked={isInventoryReceiptConfirmed}
                          onChange={(event) =>
                            setIsInventoryReceiptConfirmed(event.target.checked)
                          }
                          className="h-4 w-4 shrink-0 cursor-pointer accent-brand-500"
                          disabled={isSubmitting || !isRepairReceiptValid}
                        />
                      </label>
                    </>
                  )}
                </div>
              )}
              {requiresCustomerContactConfirmation && (
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 bg-gray-50/70 p-3 text-sm text-gray-700">
                  <span className="min-w-0 flex-1">
                    고객 특이사항에 적힌대로 연락해주세요.
                  </span>
                  <input
                    type="checkbox"
                    checked={isCustomerContactConfirmed}
                    onChange={(event) =>
                      setIsCustomerContactConfirmed(event.target.checked)
                    }
                    className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-brand-500"
                    disabled={isSubmitting}
                  />
                </label>
              )}
              {requiresRentalReturnConfirmation && (
                <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50/70 p-3 text-sm text-gray-700">
                  <p className="whitespace-pre-wrap break-words">
                    <span className="font-semibold">대여 품목: </span>
                    {rentalItemSummary}
                  </p>
                  <label className="flex cursor-pointer items-center gap-3 border-t border-gray-200 pt-2">
                    <span className="min-w-0 flex-1">매장에 다시 입고됨</span>
                    <input
                      type="checkbox"
                      checked={isRentalReturnConfirmed}
                      onChange={(event) =>
                        setIsRentalReturnConfirmed(event.target.checked)
                      }
                      className="h-4 w-4 shrink-0 cursor-pointer accent-brand-500"
                      disabled={isSubmitting}
                    />
                  </label>
                </div>
              )}
              {requiresRepairIntakeExpense && (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div>
                    <span className="mb-1 block text-sm font-medium text-gray-700">
                      매장 접수비용
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      {([false, true] as const).map((value) => (
                        <button
                          key={String(value)}
                          type="button"
                          onClick={() => {
                            setHasStoreRepairCost(value);
                            if (!value) setStoreRepairCostAmount("");
                          }}
                          disabled={isSubmitting}
                          className={`h-10 min-w-16 cursor-pointer rounded-lg border px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${hasStoreRepairCost === value ? "border-brand-500 bg-brand-500 text-white" : "border-gray-300 bg-white text-gray-600 hover:border-brand-300"}`}
                        >
                          {value ? "O" : "X"}
                        </button>
                      ))}
                    </div>
                  </div>
                  {hasStoreRepairCost && (
                    <label className="relative min-w-0 flex-1 text-sm font-medium text-gray-700">
                      금액 <span className="text-rose-600">*</span>
                      <input
                        type="number"
                        min={1}
                        inputMode="numeric"
                        value={storeRepairCostAmount}
                        onChange={(event) =>
                          setStoreRepairCostAmount(event.target.value)
                        }
                        placeholder="금액 입력"
                        className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 pr-8 text-right text-sm font-medium shadow-sm outline-none hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                        disabled={isSubmitting}
                      />
                      <span className="pointer-events-none absolute bottom-2.5 right-3 text-sm text-gray-500">
                        원
                      </span>
                    </label>
                  )}
                </div>
              )}
              <div>
                <input
                  type="text"
                  value={statusMemo}
                  onChange={(event) => setStatusMemo(event.target.value)}
                  maxLength={500}
                  className="h-10 w-full rounded border border-brand-300 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-brand-300"
                  placeholder={structuredStatusConfig.memoPlaceholder}
                  required={structuredStatusConfig.memoRequired}
                  aria-required={structuredStatusConfig.memoRequired}
                  disabled={isSubmitting}
                />
              </div>
            </div>
          ) : (
            <div>
              <span className="mb-2 block whitespace-pre-line text-xs text-gray-500">
                {selectedStatusMemoGuide}
              </span>
              <textarea
                {...register("note")}
                className="w-full min-h-24 rounded border border-brand-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                placeholder="메모를 입력하세요. (선택)"
                aria-invalid={!!errors.note || undefined}
                disabled={isSubmitting}
              />
              {errors.note && (
                <p className="mt-1 text-xs text-rose-600">
                  {errors.note.message}
                </p>
              )}
            </div>
          ))}
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 mt-6">
        <Button
          size="sm"
          variant="gray"
          disabled={isSubmitting}
          onClick={onCancel}
          type="button"
        >
          취소
        </Button>
        <Button
          size="sm"
          type="submit"
          disabled={
            isSubmitting ||
            !selectedStatus ||
            selectedStatus === currentStatus ||
            (Boolean(structuredStatusConfig) && !statusDate) ||
            Boolean(
              structuredStatusConfig?.memoRequired && !statusMemo.trim(),
            ) ||
            (requiresInventoryReceiptConfirmation &&
              (!isInventoryReceiptConfirmed || !isRepairReceiptValid)) ||
            (requiresCustomerContactConfirmation &&
              !isCustomerContactConfirmed) ||
            (requiresRentalReturnConfirmation && !isRentalReturnConfirmed) ||
            (requiresRepairIntakeExpense && !isStoreRepairCostValid)
          }
        >
          {isSubmitting ? "저장 중..." : "저장"}
        </Button>
      </div>
    </form>
  );
};

export default StatusUpdateModal;
