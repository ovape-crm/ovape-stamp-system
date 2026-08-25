"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { useState, useRef, useEffect, useDeferredValue } from "react";
import { useQuery } from "@tanstack/react-query";
import Button from "@/app/_components/Button";
import KoreanDatePicker from "@/app/_components/KoreanDatePicker";
import CustomerSelector from "./CustomerSelector";
import { CustomerType } from "@/app/_domains/_customer/_types/customer.types";
import { formatPhoneNumber } from "@/app/_utils/utils";
import {
  searchItemOptions,
  type ItemSearchOption,
} from "@/app/_domains/_item/_services/itemService";
import { itemKeys } from "@/app/_domains/_item/_queryKeys/itemKeys";
import {
  getInventorySuppliers,
  inventoryKeys,
} from "@/app/_domains/_inventory/_services/inventoryService";
import { useModal } from "@/app/_contexts/ModalContext";

const getLocalDateInputValue = () => {
  const now = new Date();
  const timezoneOffset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - timezoneOffset).toISOString().slice(0, 10);
};

const formatReceivedNoteDate = (value: string) => {
  if (value === "X") return "X";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${year}/${month}/${day}` : "";
};

const isGeneratedExchangeCompletionNote = (line: string) => {
  const value = line.trim();
  return (
    value === "교환완료" ||
    value === "동일제품,수량 교환완료" ||
    /^.+\s+\d+개(?:\s+\(.+\))?\s+교환완료$/.test(value)
  );
};

// ============================================================================
// 폼 검증 스키마
// ============================================================================

const schema = z
  .object({
    customerId: z.string().trim(),
    itemId: z.string().optional(),
    itemType: z.string().trim().min(1, { message: "품목 종류를 선택하세요." }),
    itemName: z
      .string()
      .trim()
      .min(1, { message: "기기/제품 이름을 입력하세요." })
      .max(100, { message: "기기/제품 이름은 100자 이하로 입력하세요." }),
    quantity: z
      .number({ error: "수량을 입력하세요." })
      .min(1, { message: "수량은 1개 이상이어야 합니다." })
      .max(1000, { message: "수량은 1000개 이하로 입력하세요." }),
    symptom: z
      .string()
      .trim()
      .min(1, { message: "증상을 입력하세요." })
      .max(500, { message: "증상은 500자 이하로 입력하세요." }),
    hasAfterServiceCost: z.boolean(),
    afterServicePaymentMethod: z.enum(["card", "transfer", "cash"]).optional(),
    afterServiceCostAmount: z.number().min(0).max(100000000),
    afterServiceCostMemo: z
      .string()
      .trim()
      .max(200, { message: "가격조정 메모는 200자 이하로 입력하세요." })
      .optional(),
    isLoanerDeviceIssued: z.boolean(),
    isRentalIssued: z.boolean(),
    rentalDate: z.string().optional(),
    rentalNote: z
      .string()
      .trim()
      .max(500, { message: "대여 메모는 500자 이하로 입력하세요." })
      .optional(),
    isExchangeIssued: z.boolean(),
    exchangeDate: z.string().optional(),
    exchangeItemId: z.string().optional(),
    exchangeItemName: z.string().optional(),
    exchangeItemCategoryName: z.string().optional(),
    exchangeQuantity: z.number().min(1).max(1000),
    exchangeNote: z
      .string()
      .trim()
      .max(500, { message: "교환 메모는 500자 이하로 입력하세요." })
      .optional(),
    customerNote: z
      .string()
      .trim()
      .max(500, { message: "고객 특이사항은 500자 이하로 입력하세요." })
      .optional(),
    shopNote: z
      .string()
      .trim()
      .max(500, { message: "매장 특이사항은 500자 이하로 입력하세요." })
      .optional(),
    receivedNote: z
      .string()
      .trim()
      .min(1, { message: "접수 메모를 입력하세요." })
      .max(500, { message: "접수 메모는 500자 이하로 입력하세요." })
      .optional(),
  })
  .superRefine((values, context) => {
    if (values.hasAfterServiceCost && !values.afterServicePaymentMethod) {
      context.addIssue({
        code: "custom",
        path: ["afterServicePaymentMethod"],
        message: "결제방식을 선택하세요.",
      });
    }
    if (values.hasAfterServiceCost && !values.customerId) {
      context.addIssue({
        code: "custom",
        path: ["customerId"],
        message: "A/S 비용 매출 처리를 위해 고객을 선택하세요.",
      });
    }
    const defaultCostAmount =
      values.afterServicePaymentMethod === "card" ? 6600 : 6000;
    if (
      values.hasAfterServiceCost &&
      values.afterServicePaymentMethod &&
      values.afterServiceCostAmount !== defaultCostAmount &&
      !values.afterServiceCostMemo?.trim()
    ) {
      context.addIssue({
        code: "custom",
        path: ["afterServiceCostMemo"],
        message: "가격조정 메모를 입력하세요.",
      });
    }
    if (values.isRentalIssued && !values.rentalDate) {
      context.addIssue({
        code: "custom",
        path: ["rentalDate"],
        message: "대여일을 선택하세요.",
      });
    }
    if (values.isRentalIssued && !values.rentalNote?.trim()) {
      context.addIssue({
        code: "custom",
        path: ["rentalNote"],
        message: "대여 메모를 입력하세요.",
      });
    }
    if (values.isExchangeIssued && !values.exchangeDate) {
      context.addIssue({
        code: "custom",
        path: ["exchangeDate"],
        message: "교환일을 선택하세요.",
      });
    }
    if (values.isExchangeIssued && !values.exchangeNote?.trim()) {
      context.addIssue({
        code: "custom",
        path: ["exchangeNote"],
        message: "교환 메모를 입력하세요.",
      });
    }
    if (values.isExchangeIssued && !values.customerId) {
      context.addIssue({
        code: "custom",
        path: ["exchangeItemId"],
        message: "교환 출고 처리를 위해 고객을 선택하세요.",
      });
    }
    if (values.isExchangeIssued && !values.exchangeItemId) {
      context.addIssue({
        code: "custom",
        path: ["exchangeItemId"],
        message: "교환할 품목을 검색 결과에서 선택하세요.",
      });
    }
  });

type FormValues = z.infer<typeof schema>;

// ============================================================================
// 컴포넌트
// ============================================================================

export default function AfterServiceCreateModal({
  onSubmit,
  onCancel,
  isSubmitting,
  initialData,
  mode = "create",
  onDelete,
  isAdmin = false,
}: {
  onSubmit: (values: FormValues) => Promise<void> | void;
  onCancel: () => void;
  isSubmitting: boolean;
  initialData?: {
    customerId?: string | null;
    customerName?: string | null;
    customerPhone?: string | null;
    itemType: string;
    itemName: string;
    quantity: number;
    symptom: string;
    shopNote?: string | null;
    customerNote?: string | null;
    isLoanerDeviceIssued?: boolean;
    purchaseDate?: string;
    receivedDate?: string;
    supplierName?: string;
    hasAfterServiceCost?: boolean;
    afterServicePaymentMethod?: "card" | "transfer" | "cash";
    afterServiceCostAmount?: number;
    afterServiceCostMemo?: string;
    isRentalIssued?: boolean;
    rentalDate?: string;
    rentalNote?: string;
    isExchangeIssued?: boolean;
    exchangeDate?: string;
    exchangeItemName?: string;
    exchangeItemId?: string;
    exchangeItemCategoryName?: string;
    exchangeQuantity?: number;
    exchangeNote?: string;
  };
  mode?: "create" | "edit";
  onDelete?: () => Promise<void> | void;
  isAdmin?: boolean;
}) {
  const { setSize } = useModal();
  // ========================================================================
  // 상태 관리
  // ========================================================================
  const [showConfirm, setShowConfirm] = useState(false);
  const [formData, setFormData] = useState<FormValues | null>(null);
  const canSubmitRef = useRef(true); // 중복 제출 방지용
  const stepContentRef = useRef<HTMLDivElement>(null);
  const hasAppliedInitialDataRef = useRef(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    null,
  );
  const [selectedCustomerInfo, setSelectedCustomerInfo] =
    useState<CustomerType | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showInventoryOverrideConfirm, setShowInventoryOverrideConfirm] =
    useState(false);
  const [showItemSuggestions, setShowItemSuggestions] = useState(false);
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [purchaseDate, setPurchaseDate] = useState("");
  const [receivedDate, setReceivedDate] = useState(getLocalDateInputValue);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(
    null,
  );
  const [isSupplierPickerOpen, setIsSupplierPickerOpen] = useState(false);
  const [receivedInfoError, setReceivedInfoError] = useState("");
  const [isCostAmountEditing, setIsCostAmountEditing] = useState(false);
  const [hasCostAdjustment, setHasCostAdjustment] = useState(false);
  const { data: suppliers = [], isPending: areSuppliersLoading } = useQuery({
    queryKey: [...inventoryKeys.suppliers, "after-service"],
    queryFn: () => getInventorySuppliers(false),
  });
  // ========================================================================
  // React Hook Form 설정
  // ========================================================================
  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
    control,
    setValue,
    reset,
    watch,
    trigger,
  } = useForm<FormValues>({
    mode: "onChange",
    resolver: zodResolver(schema),
    defaultValues: {
      customerId: initialData?.customerId || "",
      itemId: "",
      itemType: initialData?.itemType || "",
      itemName: initialData?.itemName || "",
      quantity: initialData?.quantity || 1,
      symptom: initialData?.symptom || "",
      hasAfterServiceCost: false,
      afterServicePaymentMethod: undefined,
      afterServiceCostAmount: 6000,
      afterServiceCostMemo: "",
      isLoanerDeviceIssued: initialData?.isLoanerDeviceIssued ?? false,
      isRentalIssued: false,
      rentalDate: "",
      rentalNote: "",
      isExchangeIssued: false,
      exchangeDate: "",
      exchangeItemId: "",
      exchangeItemName: "",
      exchangeItemCategoryName: "",
      exchangeQuantity: 1,
      exchangeNote: "",
      customerNote: initialData?.customerNote || "",
      shopNote: initialData?.shopNote || "",
      receivedNote: "",
    },
  });

  const itemNameKeyword = watch("itemName");
  const selectedItemId = watch("itemId") ?? "";
  const selectedItemType = watch("itemType");
  const selectedQuantity = watch("quantity");
  const symptom = watch("symptom");
  const isRentalIssued = watch("isRentalIssued");
  const hasAfterServiceCost = watch("hasAfterServiceCost");
  const afterServicePaymentMethod = watch("afterServicePaymentMethod");
  const afterServiceCostAmount = watch("afterServiceCostAmount");
  const afterServiceCostMemo = watch("afterServiceCostMemo");
  const rentalDate = watch("rentalDate");
  const isExchangeIssued = watch("isExchangeIssued");
  const exchangeDate = watch("exchangeDate");
  const exchangeItemName = watch("exchangeItemName") ?? "";
  const exchangeItemId = watch("exchangeItemId") ?? "";
  const exchangeQuantity = watch("exchangeQuantity");
  const isStepOneComplete =
    itemNameKeyword.trim().length > 0 &&
    selectedItemType.trim().length > 0 &&
    selectedQuantity >= 1;
  const isStepTwoComplete =
    symptom.trim().length > 0 &&
    !isCostAmountEditing &&
    (mode !== "create" ||
      (purchaseDate.length > 0 &&
        receivedDate.length > 0 &&
        supplierSearch.trim().length > 0 &&
        (!hasAfterServiceCost || Boolean(selectedCustomerId)) &&
        (!hasAfterServiceCost || Boolean(afterServicePaymentMethod)) &&
        (!hasAfterServiceCost ||
          !afterServicePaymentMethod ||
          afterServiceCostAmount ===
            (afterServicePaymentMethod === "card" ? 6600 : 6000) ||
          Boolean(afterServiceCostMemo?.trim()))));
  const [showExchangeItemSuggestions, setShowExchangeItemSuggestions] =
    useState(false);
  const deferredExchangeItemKeyword = useDeferredValue(exchangeItemName.trim());
  const {
    data: exchangeItemSuggestions = [],
    isFetching: areExchangeItemsLoading,
  } = useQuery({
    queryKey: [
      ...itemKeys.all(),
      "exchange-search",
      deferredExchangeItemKeyword,
    ],
    queryFn: () => searchItemOptions(deferredExchangeItemKeyword),
    enabled: isExchangeIssued && deferredExchangeItemKeyword.length > 0,
  });
  const supplierSuggestions = suppliers
    .filter(
      (supplier) =>
        supplier.is_use &&
        supplier.name
          .toLocaleLowerCase("ko-KR")
          .includes(supplierSearch.trim().toLocaleLowerCase("ko-KR")),
    )
    .slice(0, 20);
  const deferredItemNameKeyword = useDeferredValue(itemNameKeyword.trim());
  const {
    data: itemSuggestions = [],
    isFetching: areItemsLoading,
    isError: isItemSearchError,
  } = useQuery({
    queryKey: itemKeys.search(deferredItemNameKeyword),
    queryFn: () => searchItemOptions(deferredItemNameKeyword),
    enabled: deferredItemNameKeyword.length > 0,
  });

  const handleItemSelect = (item: ItemSearchOption) => {
    setValue("itemId", String(item.id));
    setValue("itemName", item.item_name, { shouldValidate: true });
    setValue("itemType", item.item_categories?.name || "", {
      shouldValidate: true,
    });
    setShowItemSuggestions(false);
  };

  useEffect(() => {
    setValue(
      "receivedNote",
      `고객구매일 : ${formatReceivedNoteDate(purchaseDate)}\n고객접수일 : ${formatReceivedNoteDate(receivedDate)}\n도매처 : ${supplierSearch.trim()}\nA/S 비용 : ${hasAfterServiceCost ? `${afterServiceCostAmount.toLocaleString("ko-KR")}원` : "X"}${hasAfterServiceCost && afterServicePaymentMethod ? `\n결제방식 : ${{ card: "카드", transfer: "이체", cash: "현금" }[afterServicePaymentMethod]}` : ""}${hasAfterServiceCost && afterServiceCostMemo?.trim() ? `\n가격조정 메모 : ${afterServiceCostMemo.trim()}` : ""}`,
      { shouldValidate: true },
    );
  }, [
    hasAfterServiceCost,
    afterServicePaymentMethod,
    afterServiceCostAmount,
    afterServiceCostMemo,
    mode,
    purchaseDate,
    receivedDate,
    setValue,
    supplierSearch,
  ]);

  useEffect(() => {
    stepContentRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [currentStep]);

  useEffect(() => {
    setSize(showConfirm ? "max-w-2xl" : "max-w-md");
  }, [setSize, showConfirm]);

  // 초기 데이터가 변경되면 폼 리셋
  useEffect(() => {
    if (hasAppliedInitialDataRef.current) return;
    hasAppliedInitialDataRef.current = true;
    setIsCostAmountEditing(false);

    if (initialData) {
      const customerId = initialData.customerId || null;
      setSelectedCustomerId(customerId);
      setPurchaseDate(initialData.purchaseDate ?? "");
      setReceivedDate(initialData.receivedDate || getLocalDateInputValue());
      setSupplierSearch(initialData.supplierName ?? "");
      setSelectedSupplierId(initialData.supplierName ? "existing" : null);
      setHasCostAdjustment(
        Boolean(initialData.afterServiceCostMemo) ||
          (initialData.afterServiceCostAmount ?? 6000) !==
            (initialData.afterServicePaymentMethod === "card" ? 6600 : 6000),
      );

      // 고객 정보 설정
      if (customerId && initialData.customerName) {
        const customer: CustomerType = {
          id: customerId,
          name: initialData.customerName,
          phone: initialData.customerPhone || "",
          gender: "male",
          note: null,
          created_at: "",
          updated_at: "",
          stamps: [],
        };
        setSelectedCustomerInfo(customer);
      } else {
        setSelectedCustomerInfo(null);
      }

      reset({
        customerId: customerId || "",
        itemId: "",
        itemType: initialData.itemType,
        itemName: initialData.itemName,
        quantity: initialData.quantity,
        symptom: initialData.symptom,
        hasAfterServiceCost: initialData.hasAfterServiceCost ?? false,
        afterServicePaymentMethod: initialData.afterServicePaymentMethod,
        afterServiceCostAmount: initialData.afterServiceCostAmount ?? 6000,
        afterServiceCostMemo: initialData.afterServiceCostMemo ?? "",
        isLoanerDeviceIssued: initialData.isLoanerDeviceIssued ?? false,
        isRentalIssued: initialData.isRentalIssued ?? false,
        rentalDate: initialData.rentalDate ?? "",
        rentalNote: initialData.rentalNote ?? "",
        isExchangeIssued: initialData.isExchangeIssued ?? false,
        exchangeDate: initialData.exchangeDate ?? "",
        exchangeItemId:
          initialData.exchangeItemId ??
          (initialData.isExchangeIssued ? "existing" : ""),
        exchangeItemName: initialData.exchangeItemName ?? "",
        exchangeItemCategoryName:
          initialData.exchangeItemCategoryName ?? "",
        exchangeQuantity: initialData.exchangeQuantity ?? 1,
        exchangeNote: initialData.exchangeNote ?? "",
        customerNote: initialData.customerNote || "",
        shopNote: initialData.shopNote || "",
      });
    } else {
      // initialData가 없으면 초기화
      setSelectedCustomerId(null);
      setSelectedCustomerInfo(null);
    }
  }, [initialData, reset]);

  // ========================================================================
  // 고객 선택 핸들러
  // ========================================================================
  const handleCustomerChange = (
    customerId: string | null,
    customer: CustomerType | null,
  ) => {
    setSelectedCustomerId(customerId);
    setSelectedCustomerInfo(customer);
    // customerId를 string으로 확실히 변환
    const customerIdString = customerId ? String(customerId) : "";
    setValue("customerId", customerIdString, { shouldValidate: true });
  };

  // ========================================================================
  // 이벤트 핸들러
  // ========================================================================

  /**
   * 폼 제출 시 확인 화면으로 이동
   */
  const handleFormSubmit = (values: FormValues) => {
    if (!isValid) {
      return;
    }
    const isSameExchangeItem =
      values.itemName.trim() === values.exchangeItemName?.trim() &&
      values.quantity === values.exchangeQuantity;
    const exchangeCompletionNote = values.isExchangeIssued
      ? isSameExchangeItem
        ? "동일제품,수량 교환완료"
        : `${values.exchangeItemName?.trim() ?? ""} ${values.exchangeQuantity}개${values.exchangeNote?.trim() ? ` (${values.exchangeNote.trim()})` : ""} 교환완료`.trim()
      : "";

    setFormData({
      ...values,
      customerNote: [
        values.customerNote
          ?.split("\n")
          .filter((line) => !isGeneratedExchangeCompletionNote(line))
          .join("\n")
          .trim(),
        exchangeCompletionNote,
      ]
        .filter(Boolean)
        .join("\n"),
      shopNote: [
        values.shopNote?.trim(),
        values.isRentalIssued
          ? `대여 : ${values.rentalNote?.trim() ?? ""}${/\d+\s*개/.test(values.rentalNote ?? "") ? "" : ` ${values.quantity}개`}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    });
    setShowConfirm(true);

    canSubmitRef.current = true;
  };

  const handleNextStep = async () => {
    if (currentStep === 2) {
      if (!isStepTwoComplete) return;
      setCurrentStep(3);

      if (mode !== "create") return;

      const exactSupplier = suppliers.find(
        (supplier) =>
          supplier.is_use &&
          supplier.name.trim().toLocaleLowerCase("ko-KR") ===
            supplierSearch.trim().toLocaleLowerCase("ko-KR"),
      );
      if (!selectedSupplierId && exactSupplier) {
        setSelectedSupplierId(exactSupplier.id);
        setSupplierSearch(exactSupplier.name);
      }

      setValue(
        "receivedNote",
        `고객구매일 : ${formatReceivedNoteDate(purchaseDate)}\n고객접수일 : ${formatReceivedNoteDate(receivedDate)}\n도매처 : ${exactSupplier?.name ?? supplierSearch.trim()}\nA/S 비용 : ${hasAfterServiceCost ? `${afterServiceCostAmount.toLocaleString("ko-KR")}원` : "X"}${hasAfterServiceCost && afterServicePaymentMethod ? `\n결제방식 : ${{ card: "카드", transfer: "이체", cash: "현금" }[afterServicePaymentMethod]}` : ""}${hasAfterServiceCost && afterServiceCostMemo?.trim() ? `\n가격조정 메모 : ${afterServiceCostMemo.trim()}` : ""}`,
        { shouldValidate: true },
      );

      setReceivedInfoError("");
      return;
    }

    setReceivedInfoError("");
    if (!isStepOneComplete) return;
    const isStepValid = await trigger(["itemName", "itemType", "quantity"]);

    if (!isStepValid) return;
    setCurrentStep((step) => Math.min(step + 1, 3) as 1 | 2 | 3);
  };

  /**
   * 확인 화면에서 최종 제출
   */
  const handleConfirm = async () => {
    if (!formData || !canSubmitRef.current || isSubmitting) {
      return;
    }

    canSubmitRef.current = false;

    try {
      await onSubmit(formData);
    } catch (error) {
      canSubmitRef.current = true;
      throw error;
    }
  };

  // ========================================================================
  // 확인 화면 렌더링
  // ========================================================================
  if (showConfirm && formData) {
    return (
      <div className="w-full flex flex-col min-h-0">
        <h2 className="mb-2 shrink-0 text-lg font-semibold">AS 정보 확인</h2>

        <div className="min-h-0 flex-1">
          <div className="mb-3 rounded-lg bg-gray-50 p-3">
            <div className="grid grid-cols-2 gap-x-5 gap-y-2 [&>div]:min-w-0 [&_span]:text-xs [&_p]:text-sm">
              {selectedCustomerInfo && (
                <div>
                  <span className="text-sm font-medium text-gray-600">
                    고객:
                  </span>
                  <p className="text-base font-semibold text-gray-900">
                    {selectedCustomerInfo.name} (
                    {formatPhoneNumber(selectedCustomerInfo.phone)})
                  </p>
                </div>
              )}
              <div>
                <span className="text-sm font-medium text-gray-600">
                  기기 종류:
                </span>
                <p className="text-base font-semibold text-gray-900">
                  {formData.itemType}
                </p>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-600">
                  기기/제품 이름:
                </span>
                <p className="text-base font-semibold text-gray-900">
                  {formData.itemName}
                </p>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-600">수량:</span>
                <p className="text-base font-semibold text-gray-900">
                  {formData.quantity}개
                </p>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-600">증상:</span>
                <p className="text-base text-gray-900 whitespace-pre-wrap">
                  {formData.symptom}
                </p>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-600">
                  재고처리 여부:
                </span>
                <p className="text-base font-semibold text-gray-900">
                  {formData.isLoanerDeviceIssued ? "예" : "아니오"}
                </p>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-600">
                  대여 여부:
                </span>
                <p className="text-base font-semibold text-gray-900">
                  {formData.isRentalIssued ? "예" : "아니오"}
                </p>
              </div>
              {formData.isRentalIssued && (
                <div>
                  <span className="text-sm font-medium text-gray-600">
                    대여일:
                  </span>
                  <p className="text-base font-semibold text-gray-900">
                    {formatReceivedNoteDate(formData.rentalDate ?? "")}
                  </p>
                </div>
              )}
              <div>
                <span className="text-sm font-medium text-gray-600">
                  A/S 교환출고:
                </span>
                <p className="text-base font-semibold text-gray-900">
                  {formData.isExchangeIssued ? "예" : "아니오"}
                </p>
              </div>
              {formData.isExchangeIssued && (
                <div>
                  <span className="text-sm font-medium text-gray-600">
                    교환일:
                  </span>
                  <p className="text-base font-semibold text-gray-900">
                    {formatReceivedNoteDate(formData.exchangeDate ?? "")}
                  </p>
                </div>
              )}
              {formData.customerNote && (
                <div>
                  <span className="text-sm font-medium text-gray-600">
                    고객 특이사항:
                  </span>
                  <p className="text-base text-gray-900 whitespace-pre-wrap">
                    {formData.customerNote}
                  </p>
                </div>
              )}
              {formData.shopNote && (
                <div>
                  <span className="text-sm font-medium text-gray-600">
                    매장 특이사항:
                  </span>
                  <p className="text-base text-gray-900 whitespace-pre-wrap">
                    {formData.shopNote}
                  </p>
                </div>
              )}
              {mode === "create" && formData.receivedNote && (
                <div>
                  <span className="text-sm font-medium text-gray-600">
                    접수 메모:
                  </span>
                  <p className="text-base text-gray-900 whitespace-pre-wrap">
                    {formData.receivedNote}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="py-2 text-center">
            <p className="text-gray-700 text-sm">
              위 정보로 AS를 {mode === "edit" ? "수정" : "등록"}하시겠습니까?
            </p>
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-3 border-t border-gray-200 pt-3">
          <Button
            onClick={() => setShowConfirm(false)}
            disabled={isSubmitting}
            size="sm"
            variant="gray"
          >
            수정
          </Button>
          <Button
            disabled={isSubmitting || !isValid}
            onClick={handleConfirm}
            size="sm"
          >
            {isSubmitting
              ? mode === "edit"
                ? "수정 중..."
                : "등록 중..."
              : mode === "edit"
                ? "수정"
                : "등록"}
          </Button>
        </div>
      </div>
    );
  }

  // ========================================================================
  // 입력 폼 렌더링
  // ========================================================================
  return (
    <form
      onSubmit={(event) => event.preventDefault()}
      className="w-full flex flex-col min-h-0"
      noValidate
    >
      <h2 className="mb-3 shrink-0 text-lg font-semibold">
        {mode === "edit" ? "A/S 수정" : "A/S 추가"}
      </h2>

      <div className="mb-4 flex shrink-0 items-start justify-center">
        {["고객 및 제품", "A/S 접수 정보", "특이사항"].map(
          (label, index, steps) => {
            const step = (index + 1) as 1 | 2 | 3;
            const isActive = currentStep === step;
            const isDone = currentStep > step;

            return (
              <div key={label} className="flex items-start">
                <div className="flex w-20 flex-col items-center gap-1.5">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                      isDone
                        ? "bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-sm"
                        : isActive
                          ? "bg-brand-100 text-brand-600 ring-2 ring-brand-400"
                          : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {isDone ? "✓" : step}
                  </div>
                  <span
                    className={`whitespace-nowrap text-[11px] font-medium ${
                      isActive || isDone ? "text-brand-700" : "text-gray-400"
                    }`}
                  >
                    {label}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`mt-4 h-0.5 w-8 rounded-full transition-colors sm:w-12 ${
                      isDone ? "bg-brand-500" : "bg-gray-200"
                    }`}
                  />
                )}
              </div>
            );
          },
        )}
      </div>

      <div
        key={currentStep}
        ref={stepContentRef}
        className="space-y-4 overflow-y-auto min-h-0 flex-1 pr-1"
      >
        <section
          className="space-y-3"
          style={{ display: currentStep === 1 ? "block" : "none" }}
        >
          {/* 고객 검색 */}
          <CustomerSelector
            value={selectedCustomerId}
            onChange={handleCustomerChange}
            error={errors.customerId?.message}
            initialCustomer={selectedCustomerInfo}
          />

          {/* 품목 관리에서 기기/제품 검색 */}
          <div className="relative">
            <label className="block text-sm font-medium mb-1">
              기기/제품 이름 <span className="text-rose-600">*</span>
            </label>
            <input
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition hover:border-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              placeholder={
                areItemsLoading
                  ? "품목을 불러오는 중..."
                  : "품목 관리에 등록된 이름을 검색하세요"
              }
              autoComplete="off"
              aria-invalid={!!errors.itemName || undefined}
              {...register("itemName", {
                onChange: () => {
                  setValue("itemId", "");
                  setValue("itemType", "", { shouldValidate: true });
                  setShowItemSuggestions(true);
                },
                onBlur: () => setShowItemSuggestions(false),
              })}
              onFocus={() => setShowItemSuggestions(true)}
            />
            {showItemSuggestions && itemNameKeyword.trim() && (
              <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                {areItemsLoading ? (
                  <p className="px-3 py-3 text-sm text-gray-500">
                    품목을 불러오는 중...
                  </p>
                ) : isItemSearchError ? (
                  <p className="px-3 py-3 text-sm text-rose-600">
                    품목을 불러오지 못했습니다. 다시 시도해 주세요.
                  </p>
                ) : itemSuggestions.length > 0 ? (
                  itemSuggestions.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="flex w-full items-center justify-between gap-3 border-b border-gray-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-gray-50"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        handleItemSelect(item);
                      }}
                    >
                      <span className="font-medium text-gray-800">
                        {item.item_name}
                      </span>
                      <span className="shrink-0 text-xs text-gray-500">
                        {item.item_categories?.name || "종류 없음"}
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-3 text-sm text-gray-500">
                    일치하는 품목이 없습니다.
                  </p>
                )}
              </div>
            )}
            {errors.itemName && (
              <p className="mt-1 text-xs text-rose-600">
                {errors.itemName.message}
              </p>
            )}
          </div>

          {/* 선택한 품목의 종류 자동 표시 */}
          <div>
            <label className="block text-sm font-medium mb-1">
              기기 종류 <span className="text-rose-600">*</span>
            </label>
            <input
              className="w-full rounded border border-gray-200 bg-gray-100 px-3 py-2 text-sm text-gray-700"
              value={selectedItemType}
              placeholder="기기/제품 이름을 선택하면 자동으로 표시됩니다"
              readOnly
            />
            {errors.itemType && (
              <p className="mt-1 text-xs text-rose-600">
                품목 관리의 검색 결과에서 제품을 선택하세요.
              </p>
            )}
          </div>

          {/* 수량 */}
          <div>
            <label className="block text-sm font-medium mb-1">
              수량 <span className="text-rose-600">*</span>
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min="1"
                max="1000"
                className="h-10 w-20 rounded-lg border border-gray-300 bg-white px-3 text-center text-sm font-medium shadow-sm outline-none transition hover:border-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                aria-invalid={!!errors.quantity || undefined}
                {...register("quantity", { valueAsNumber: true })}
              />
              <button
                type="button"
                aria-label="수량 줄이기"
                disabled={selectedQuantity <= 1}
                onClick={() =>
                  setValue("quantity", Math.max(1, selectedQuantity - 1), {
                    shouldValidate: true,
                  })
                }
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 bg-white text-lg leading-none text-gray-600 transition-colors hover:bg-gray-50 active:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                −
              </button>
              <button
                type="button"
                aria-label="수량 늘리기"
                disabled={selectedQuantity >= 1000}
                onClick={() =>
                  setValue("quantity", Math.min(1000, selectedQuantity + 1), {
                    shouldValidate: true,
                  })
                }
                className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500 text-lg leading-none text-white transition-colors hover:bg-brand-600 active:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                +
              </button>
            </div>
            {errors.quantity && (
              <p className="mt-1 text-xs text-rose-600">
                {errors.quantity.message}
              </p>
            )}
          </div>
        </section>

        <section
          className="space-y-3"
          style={{ display: currentStep === 2 ? "block" : "none" }}
        >
          {/* 증상 */}
          <div>
            <label className="block text-sm font-medium mb-1">
              증상 <span className="text-rose-600">*</span>
            </label>
            <textarea
              rows={2}
              className="w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition hover:border-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              placeholder="AS 증상을 입력하세요"
              aria-invalid={!!errors.symptom || undefined}
              {...register("symptom")}
            />
            {errors.symptom && (
              <p className="mt-1 text-xs text-rose-600">
                {errors.symptom.message}
              </p>
            )}
          </div>

          {/* 접수 정보 */}
          <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="block text-sm font-medium text-gray-800">
                  <div className="flex items-center gap-2">
                    <span>
                      고객 구매일 <span className="text-rose-600">*</span>
                    </span>
                    <button
                      type="button"
                      aria-pressed={purchaseDate === "X"}
                      onClick={() => {
                        setPurchaseDate((value) => (value === "X" ? "" : "X"));
                        setReceivedInfoError("");
                      }}
                      className={`flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-xs font-semibold transition-colors ${
                        purchaseDate === "X"
                          ? "bg-brand-500 text-white"
                          : "border border-gray-300 bg-white text-gray-500 hover:bg-gray-50"
                      }`}
                    >
                      X
                    </button>
                  </div>
                  <div className="mt-1">
                    {purchaseDate === "X" ? (
                      <div className="flex h-10 w-full items-center rounded-lg border border-gray-300 bg-gray-50 px-3 text-sm font-semibold text-gray-700 shadow-sm">
                        X
                      </div>
                    ) : (
                      <KoreanDatePicker
                        value={purchaseDate}
                        onChange={(value) => {
                          setPurchaseDate(value);
                          setReceivedInfoError("");
                        }}
                        selectedLabel="고객 구매일"
                        placement="top"
                        align="left"
                        floating
                      />
                    )}
                  </div>
                </div>
                <label className="block text-sm font-medium text-gray-800">
                  <span className="flex h-6 items-center">
                    고객 접수일 <span className="text-rose-600">*</span>
                  </span>
                  <div className="mt-1">
                    <KoreanDatePicker
                      value={receivedDate}
                      onChange={(value) => {
                        setReceivedDate(value);
                        setReceivedInfoError("");
                      }}
                      selectedLabel="고객 접수일"
                      placement="top"
                      align="right"
                      floating
                    />
                  </div>
                </label>
              </div>

              <div className="relative">
                <div className="flex items-center gap-2">
                  <label className="block text-sm font-medium text-gray-800">
                    도매처 <span className="text-rose-600">*</span>
                  </label>
                  <button
                    type="button"
                    aria-pressed={selectedSupplierId === "later"}
                    onClick={() => {
                      const isSelected = selectedSupplierId === "later";
                      setSelectedSupplierId(isSelected ? null : "later");
                      setSupplierSearch(isSelected ? "" : "나중에 수정");
                      setIsSupplierPickerOpen(false);
                      setReceivedInfoError("");
                    }}
                    className={`flex h-6 items-center justify-center rounded-md px-2 text-xs font-semibold transition-colors ${
                      selectedSupplierId === "later"
                        ? "bg-brand-500 text-white"
                        : "border border-gray-300 bg-white text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    나중에 수정
                  </button>
                </div>
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
                    value={supplierSearch}
                    onFocus={() => {
                      if (selectedSupplierId !== "later") {
                        setIsSupplierPickerOpen(true);
                      }
                    }}
                    onBlur={() => setIsSupplierPickerOpen(false)}
                    onChange={(event) => {
                      setSupplierSearch(event.target.value);
                      setSelectedSupplierId(null);
                      setIsSupplierPickerOpen(true);
                      setReceivedInfoError("");
                    }}
                    placeholder={
                      areSuppliersLoading
                        ? "거래처를 불러오는 중..."
                        : "거래처명을 검색하세요"
                    }
                    autoComplete="off"
                    className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm shadow-sm outline-none transition hover:border-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  />
                </div>
                {isSupplierPickerOpen && supplierSearch.trim() && (
                  <div className="absolute z-30 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                    {supplierSuggestions.length ? (
                      supplierSuggestions.map((supplier) => (
                        <button
                          key={supplier.id}
                          type="button"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            setSupplierSearch(supplier.name);
                            setSelectedSupplierId(supplier.id);
                            setIsSupplierPickerOpen(false);
                            setReceivedInfoError("");
                          }}
                          className="flex min-h-10 w-full items-center rounded-lg px-3 text-left text-sm font-medium text-gray-800 hover:bg-gray-50"
                        >
                          {supplier.name}
                        </button>
                      ))
                    ) : (
                      <p className="px-3 py-3 text-center text-sm text-gray-500">
                        검색 결과가 없습니다.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-end gap-3">
                <div>
                  <span className="mb-2 block text-sm font-medium text-gray-800">
                    A/S 비용
                  </span>
                  <Controller
                    name="hasAfterServiceCost"
                    control={control}
                    render={({ field }) => (
                      <div className="grid w-28 grid-cols-2 gap-2">
                        {[false, true].map((value) => (
                          <button
                            key={String(value)}
                            type="button"
                            onClick={() => {
                              field.onChange(value);
                              if (!value) {
                                setValue(
                                  "afterServicePaymentMethod",
                                  undefined,
                                  { shouldValidate: true },
                                );
                                setValue("afterServiceCostAmount", 6000);
                                setValue("afterServiceCostMemo", "");
                                setIsCostAmountEditing(false);
                                setHasCostAdjustment(false);
                              }
                            }}
                            className={`h-10 rounded-lg text-sm font-semibold transition-colors ${field.value === value ? "bg-brand-500 text-white" : "border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"}`}
                          >
                            {value ? "O" : "X"}
                          </button>
                        ))}
                      </div>
                    )}
                  />
                </div>

                {hasAfterServiceCost && (
                  <div>
                    <span className="mb-2 block text-sm font-medium text-gray-800">
                      결제방식 <span className="text-rose-600">*</span>
                    </span>
                    <Controller
                      name="afterServicePaymentMethod"
                      control={control}
                      render={({ field }) => (
                        <div className="grid w-full grid-cols-3 gap-2">
                          {[
                            { value: "card", label: "카드" },
                            { value: "transfer", label: "이체" },
                            { value: "cash", label: "현금" },
                          ].map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => {
                                field.onChange(option.value);
                                setValue(
                                  "afterServiceCostAmount",
                                  option.value === "card" ? 6600 : 6000,
                                  { shouldValidate: true },
                                );
                                setValue("afterServiceCostMemo", "", {
                                  shouldValidate: true,
                                });
                                setIsCostAmountEditing(false);
                                setHasCostAdjustment(false);
                              }}
                              className={`h-10 rounded-lg text-sm font-semibold transition-colors ${field.value === option.value ? "bg-brand-500 text-white" : "border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"}`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      )}
                    />
                  </div>
                )}
              </div>

              {errors.afterServicePaymentMethod && (
                <p className="text-xs text-rose-600">
                  {errors.afterServicePaymentMethod.message}
                </p>
              )}

              {hasAfterServiceCost && !selectedCustomerId && (
                <p className="text-xs text-rose-600">
                  A/S 비용 매출 처리를 위해 1단계에서 고객을 선택하세요.
                </p>
              )}

              {hasAfterServiceCost && afterServicePaymentMethod && (
                <div className="ml-[7.75rem] grid w-[calc(100%-7.75rem)] grid-cols-3 gap-2">
                  {isCostAmountEditing ? (
                    <div className="relative col-span-2">
                      <input
                        type="number"
                        min="0"
                        className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 pr-8 text-right text-sm font-semibold shadow-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                        {...register("afterServiceCostAmount", {
                          valueAsNumber: true,
                        })}
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
                        원
                      </span>
                    </div>
                  ) : (
                    <div className="col-span-2 flex h-10 items-center rounded-lg border border-gray-300 bg-white px-3 text-base font-semibold text-gray-900 shadow-sm">
                      {afterServiceCostAmount.toLocaleString("ko-KR")}원
                    </div>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="gray"
                    className="w-full"
                    onClick={async () => {
                      if (!isCostAmountEditing) {
                        setHasCostAdjustment(true);
                        setIsCostAmountEditing(true);
                        return;
                      }

                      const defaultAmount =
                        afterServicePaymentMethod === "card" ? 6600 : 6000;
                      if (afterServiceCostAmount === defaultAmount) {
                        setValue("afterServiceCostMemo", "", {
                          shouldValidate: true,
                        });
                        setHasCostAdjustment(false);
                        setIsCostAmountEditing(false);
                        return;
                      }

                      const isAdjustmentValid = await trigger([
                        "afterServiceCostAmount",
                        "afterServiceCostMemo",
                      ]);
                      if (isAdjustmentValid) setIsCostAmountEditing(false);
                    }}
                  >
                    {isCostAmountEditing ? "조정완료" : "가격조정"}
                  </Button>
                </div>
              )}

              {hasAfterServiceCost &&
                afterServicePaymentMethod &&
                hasCostAdjustment && (
                  <div className="ml-[7.75rem] w-[calc(100%-7.75rem)]">
                    <input
                      type="text"
                      placeholder="가격조정 메모를 입력하세요"
                      readOnly={!isCostAmountEditing}
                      className={`h-10 w-full rounded-lg border border-gray-300 px-3 text-sm shadow-sm outline-none transition ${isCostAmountEditing ? "bg-white hover:border-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100" : "cursor-not-allowed bg-gray-50 text-gray-600"}`}
                      {...register("afterServiceCostMemo")}
                    />
                    {errors.afterServiceCostMemo && (
                      <p className="mt-1 text-xs text-rose-600">
                        {errors.afterServiceCostMemo.message}
                      </p>
                    )}
                  </div>
                )}

              {receivedInfoError && (
                <p className="text-xs text-rose-600">{receivedInfoError}</p>
              )}
          </div>
        </section>

        <section
          className="space-y-3"
          style={{ display: currentStep === 3 ? "block" : "none" }}
        >
          <div className="grid grid-cols-3 gap-3">
            <div className="min-w-0">
              <span className="mb-2 block text-sm font-medium">
                재고처리 여부
              </span>
              <Controller
                name="isLoanerDeviceIssued"
                control={control}
                render={({ field }) => (
                  <div className="grid w-28 grid-cols-2 gap-2">
                    {[false, true].map((value) => (
                      <button
                        key={String(value)}
                        type="button"
                        disabled={value && isRentalIssued}
                        onClick={() => {
                          if (!value && isExchangeIssued) {
                            setShowInventoryOverrideConfirm(true);
                            return;
                          }
                          field.onChange(value);
                        }}
                        className={`h-10 rounded-lg text-sm font-semibold transition-colors ${field.value === value ? "bg-brand-500 text-white" : "border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"}`}
                      >
                        {value ? "O" : "X"}
                      </button>
                    ))}
                  </div>
                )}
              />
            </div>
            <div className="min-w-0 border-l border-gray-200 pl-3">
              <span className="mb-2 block text-sm font-medium">대여 여부</span>
              <Controller
                name="isRentalIssued"
                control={control}
                render={({ field }) => (
                  <div className="grid w-28 grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        field.onChange(false);
                        setValue("rentalDate", "", { shouldValidate: true });
                        setValue("rentalNote", "", { shouldValidate: true });
                      }}
                      className={`h-10 rounded-lg text-sm font-semibold transition-colors ${!field.value ? "bg-brand-500 text-white" : "border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"}`}
                    >
                      X
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        field.onChange(true);
                        setValue("isLoanerDeviceIssued", false, {
                          shouldValidate: true,
                        });
                        setValue("rentalDate", getLocalDateInputValue(), {
                          shouldValidate: true,
                        });
                        setValue("isExchangeIssued", false, {
                          shouldValidate: true,
                        });
                        setValue("exchangeDate", "", { shouldValidate: true });
                        setValue("exchangeItemId", "", {
                          shouldValidate: true,
                        });
                        setValue("exchangeItemName", "", {
                          shouldValidate: true,
                        });
                        setValue("exchangeItemCategoryName", "", {
                          shouldValidate: true,
                        });
                        setValue("exchangeQuantity", 1, {
                          shouldValidate: true,
                        });
                        setValue("exchangeNote", "", { shouldValidate: true });
                      }}
                      className={`h-10 rounded-lg text-sm font-semibold transition-colors ${field.value ? "bg-brand-500 text-white" : "border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"}`}
                    >
                      O
                    </button>
                  </div>
                )}
              />
            </div>
            <div className="min-w-0 border-l border-gray-200 pl-3">
              <span className="mb-2 block text-sm font-medium">A/S 교환출고</span>
              <Controller
                name="isExchangeIssued"
                control={control}
                render={({ field }) => (
                  <div className="grid w-28 grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        field.onChange(false);
                        setValue("exchangeDate", "", { shouldValidate: true });
                        setValue("exchangeItemId", "", {
                          shouldValidate: true,
                        });
                        setValue("exchangeItemName", "", {
                          shouldValidate: true,
                        });
                        setValue("exchangeItemCategoryName", "", {
                          shouldValidate: true,
                        });
                        setValue("exchangeQuantity", 1, {
                          shouldValidate: true,
                        });
                        setValue("exchangeNote", "", { shouldValidate: true });
                      }}
                      className={`h-10 rounded-lg text-sm font-semibold transition-colors ${!field.value ? "bg-brand-500 text-white" : "border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"}`}
                    >
                      X
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        field.onChange(true);
                        setValue("isLoanerDeviceIssued", true, {
                          shouldValidate: true,
                        });
                        setValue("exchangeDate", getLocalDateInputValue(), {
                          shouldValidate: true,
                        });
                        setValue("exchangeItemId", selectedItemId, {
                          shouldValidate: true,
                        });
                        setValue("exchangeItemName", itemNameKeyword, {
                          shouldValidate: true,
                        });
                        setValue(
                          "exchangeItemCategoryName",
                          selectedItemType,
                        );
                        setValue("exchangeQuantity", selectedQuantity, {
                          shouldValidate: true,
                        });
                        setValue("isRentalIssued", false, {
                          shouldValidate: true,
                        });
                        setValue("rentalDate", "", { shouldValidate: true });
                        setValue("rentalNote", "", { shouldValidate: true });
                      }}
                      className={`h-10 rounded-lg text-sm font-semibold transition-colors ${field.value ? "bg-brand-500 text-white" : "border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"}`}
                    >
                      O
                    </button>
                  </div>
                )}
              />
            </div>
          </div>

          {isRentalIssued && (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  대여일 <span className="text-rose-600">*</span>
                </label>
                <KoreanDatePicker
                  value={rentalDate ?? ""}
                  onChange={(value) =>
                    setValue("rentalDate", value, { shouldValidate: true })
                  }
                  placement="bottom"
                  align="right"
                  floating
                />
                {errors.rentalDate && (
                  <p className="mt-1 text-xs text-rose-600">
                    {errors.rentalDate.message}
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  대여 메모 <span className="text-rose-600">*</span>
                </label>
                <textarea
                  rows={2}
                  className="w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition hover:border-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  placeholder="대여 제품명,색깔,수량 을 입력해주세요"
                  aria-invalid={!!errors.rentalNote || undefined}
                  {...register("rentalNote")}
                />
                {errors.rentalNote && (
                  <p className="mt-1 text-xs text-rose-600">
                    {errors.rentalNote.message}
                  </p>
                )}
              </div>
            </>
          )}

          {isExchangeIssued && (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  교환일 <span className="text-rose-600">*</span>
                </label>
                <KoreanDatePicker
                  value={exchangeDate ?? ""}
                  onChange={(value) =>
                    setValue("exchangeDate", value, { shouldValidate: true })
                  }
                  placement="bottom"
                  align="right"
                  floating
                />
                {errors.exchangeDate && (
                  <p className="mt-1 text-xs text-rose-600">
                    {errors.exchangeDate.message}
                  </p>
                )}
              </div>
              <div className="relative">
                <label className="mb-1 block text-sm font-medium">
                  교환 품목 <span className="text-rose-600">*</span>
                </label>
                <div className="relative">
                  <input
                    value={exchangeItemName}
                    readOnly={Boolean(exchangeItemId)}
                    onFocus={() => {
                      if (!exchangeItemId) setShowExchangeItemSuggestions(true);
                    }}
                    onBlur={() => setShowExchangeItemSuggestions(false)}
                    onChange={(event) => {
                      setValue("exchangeItemName", event.target.value);
                      setValue("exchangeItemId", "", { shouldValidate: true });
                      setValue("exchangeItemCategoryName", "");
                      setShowExchangeItemSuggestions(true);
                    }}
                    placeholder={
                      areExchangeItemsLoading
                        ? "품목을 불러오는 중..."
                        : "교환할 품목을 검색하세요"
                    }
                    autoComplete="off"
                    className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 pr-10 text-sm shadow-sm outline-none transition hover:border-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  />
                  {exchangeItemId && (
                    <button
                      type="button"
                      aria-label="교환 품목 선택 해제"
                      onClick={() => {
                        setValue("exchangeItemId", "", {
                          shouldValidate: true,
                        });
                        setValue("exchangeItemName", "", {
                          shouldValidate: true,
                        });
                        setValue("exchangeItemCategoryName", "");
                        setShowExchangeItemSuggestions(false);
                      }}
                      className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                    >
                      <svg
                        className="h-4 w-4"
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
                  )}
                </div>
                {showExchangeItemSuggestions && exchangeItemName.trim() && (
                  <div className="absolute z-30 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                    {exchangeItemSuggestions.length ? (
                      exchangeItemSuggestions.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            setValue("exchangeItemId", String(item.id), {
                              shouldValidate: true,
                            });
                            setValue("exchangeItemName", item.item_name, {
                              shouldValidate: true,
                            });
                            setValue(
                              "exchangeItemCategoryName",
                              item.item_categories?.name ?? "",
                            );
                            setShowExchangeItemSuggestions(false);
                          }}
                          className="flex w-full items-center justify-between gap-3 border-b border-gray-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-gray-50"
                        >
                          <span className="font-medium text-gray-800">
                            {item.item_name}
                          </span>
                          <span className="text-xs text-gray-500">
                            {item.item_categories?.name ?? "종류 없음"}
                          </span>
                        </button>
                      ))
                    ) : (
                      <p className="px-3 py-3 text-sm text-gray-500">
                        검색 결과가 없습니다.
                      </p>
                    )}
                  </div>
                )}
                {errors.exchangeItemId && (
                  <p className="mt-1 text-xs text-rose-600">
                    {errors.exchangeItemId.message}
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  수량 <span className="text-rose-600">*</span>
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    className="h-10 w-20 rounded-lg border border-gray-300 bg-white px-3 text-center text-sm font-medium shadow-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                    {...register("exchangeQuantity", { valueAsNumber: true })}
                  />
                  <button
                    type="button"
                    disabled={exchangeQuantity <= 1}
                    onClick={() =>
                      setValue(
                        "exchangeQuantity",
                        Math.max(1, exchangeQuantity - 1),
                        { shouldValidate: true },
                      )
                    }
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 bg-white text-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                  >
                    −
                  </button>
                  <button
                    type="button"
                    disabled={exchangeQuantity >= 1000}
                    onClick={() =>
                      setValue(
                        "exchangeQuantity",
                        Math.min(1000, exchangeQuantity + 1),
                        { shouldValidate: true },
                      )
                    }
                    className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500 text-lg text-white hover:bg-brand-600 disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  교환 메모 <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm shadow-sm outline-none transition hover:border-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  placeholder="교환 메모를 입력해주세요"
                  aria-invalid={!!errors.exchangeNote || undefined}
                  {...register("exchangeNote")}
                />
                {errors.exchangeNote && (
                  <p className="mt-1 text-xs text-rose-600">
                    {errors.exchangeNote.message}
                  </p>
                )}
              </div>
            </>
          )}

          {/* 고객 특이사항 */}
          <div>
            <label className="block text-sm font-medium mb-1">
              고객 특이사항
            </label>
            <textarea
              rows={2}
              className="w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition hover:border-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              placeholder={
                "고객 관련 특이사항을 입력하세요 (선택사항)\nex) 도착시 문자 or 전화"
              }
              aria-invalid={!!errors.customerNote || undefined}
              {...register("customerNote")}
            />
            {errors.customerNote && (
              <p className="mt-1 text-xs text-rose-600">
                {errors.customerNote.message}
              </p>
            )}
          </div>

          {/* 매장 특이사항 */}
          <div>
            <label className="block text-sm font-medium mb-1">
              매장 특이사항
            </label>
            <textarea
              rows={2}
              className="w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition hover:border-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              placeholder="매장 관련 특이사항을 입력하세요 (선택사항)"
              aria-invalid={!!errors.shopNote || undefined}
              {...register("shopNote")}
            />
            {errors.shopNote && (
              <p className="mt-1 text-xs text-rose-600">
                {errors.shopNote.message}
              </p>
            )}
          </div>
        </section>
      </div>

      <div
        className={`pt-4 border-t border-gray-200 flex mt-6 shrink-0 ${
          mode === "edit" && onDelete && isAdmin
            ? "justify-between"
            : "justify-end"
        }`}
      >
        {mode === "edit" && onDelete && isAdmin && (
          <div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isSubmitting}
            >
              AS 삭제
            </Button>
          </div>
        )}

        <div className="flex gap-3">
          <Button
            size="sm"
            variant="gray"
            disabled={isSubmitting}
            onClick={onCancel}
          >
            취소
          </Button>
          {currentStep > 1 && (
            <Button
              size="sm"
              type="button"
              variant="gray"
              disabled={isSubmitting}
              onClick={() =>
                setCurrentStep((step) => Math.max(step - 1, 1) as 1 | 2 | 3)
              }
            >
              이전
            </Button>
          )}
          {currentStep === 2 && isCostAmountEditing ? null : currentStep < 3 ? (
            <Button
              size="sm"
              type="button"
              disabled={
                isSubmitting ||
                (currentStep === 1
                  ? !isStepOneComplete
                  : !isStepTwoComplete)
              }
              onClick={handleNextStep}
            >
              다음
            </Button>
          ) : (
            <Button
              size="sm"
              type="button"
              disabled={isSubmitting}
              onClick={() => void handleSubmit(handleFormSubmit)()}
            >
              {isSubmitting
                ? mode === "edit"
                  ? "수정 중..."
                  : "등록 중..."
                : mode === "edit"
                  ? "수정"
                  : "등록"}
            </Button>
          )}
        </div>
      </div>

      {showInventoryOverrideConfirm && (
        <div className="fixed inset-0 z-[2002] flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6">
            <h3 className="mb-4 text-lg font-semibold">재고처리 확인</h3>
            <p className="mb-6 text-gray-600">
              교환처리시 재고처리는 O가 되어야합니다.
              <br />
              X로 적용하시겠습니까?
            </p>
            <div className="flex justify-end gap-3">
              <Button
                size="sm"
                variant="gray"
                type="button"
                onClick={() => setShowInventoryOverrideConfirm(false)}
              >
                아니오
              </Button>
              <Button
                size="sm"
                type="button"
                onClick={() => {
                  setValue("isLoanerDeviceIssued", false, {
                    shouldValidate: true,
                  });
                  setShowInventoryOverrideConfirm(false);
                }}
              >
                네
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 삭제 확인 모달 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[2002] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">AS 삭제 확인</h3>
            <p className="text-gray-600 mb-6">
              정말로 이 AS를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="flex justify-end gap-3">
              <Button
                size="sm"
                variant="gray"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isSubmitting}
              >
                취소
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  if (onDelete) {
                    await onDelete();
                    setShowDeleteConfirm(false);
                  }
                }}
                disabled={isSubmitting}
              >
                삭제
              </Button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
