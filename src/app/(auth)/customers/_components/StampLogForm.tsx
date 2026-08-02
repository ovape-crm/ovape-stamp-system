"use client";

import Button from "@/app/_components/Button";
import {
  PaymentTypeEnum,
  PaymentTypeEnumType,
  StoreTypeEnum,
  StoreTypeEnumType,
} from "@/app/_enums/enums";
import { useItems } from "@/app/_domains/_item/_hooks/useItems";
import { useOutboundMemoRules } from "@/app/_domains/_item/_hooks/useOutboundMemoRules";
import type { ItemType } from "@/app/_domains/_item/_types/item.types";
import type {
  OutboundMemoRule,
  OutboundMemoRuleOutboundType,
} from "@/app/_domains/_item/_types/outboundMemoRule.types";
import toast from "react-hot-toast";
import type {
  StampLogItem,
  StampLogMeta,
} from "@/app/_domains/_stamp/_services/stampService";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CustomerMode } from "@/app/_domains/_customer/_utils/specialCustomer";

const ovapePaymentTypes = [
  PaymentTypeEnum.CARD,
  PaymentTypeEnum.TRANSFER,
  PaymentTypeEnum.CASH,
  PaymentTypeEnum.KAKAOTALK,
  PaymentTypeEnum.CASH_RECEIPT,
  PaymentTypeEnum.TRANSFER_CASH_RECEIPT,
];

const eguVapePaymentTypes = [
  PaymentTypeEnum.EGU_CARD,
  PaymentTypeEnum.EGU_TRANSFER,
  PaymentTypeEnum.EGU_CASH,
  PaymentTypeEnum.EGU_CASH_RECEIPT,
];

const paymentTypesByStore = {
  [StoreTypeEnum.OVAPE.value]: ovapePaymentTypes,
  [StoreTypeEnum.EGU_VAPE.value]: eguVapePaymentTypes,
};

const remarkOptions = [
  { value: "", name: "미입력" },
  { value: "service", name: "서비스" },
  { value: "exchange_in", name: "교환입고" },
  { value: "exchange_out", name: "교환출고" },
  { value: "custom", name: "메모입력" },
  { value: "price_adjust", name: "가격조정" },
] as const;

type RemarkOptionValue =
  | (typeof remarkOptions)[number]["value"]
  | "demo"
  | "adjustment_in"
  | "adjustment_out";

const discountOptions = [
  { value: "special", name: "특별" },
  { value: "transfer", name: "이체" },
  { value: "cash", name: "현금" },
] as const;

type DiscountOptionValue = (typeof discountOptions)[number]["value"];
type DeliveryMethod = "store_visit" | "parcel" | "delivery";

type DraftStampLogLine = StampLogItem & {
  id: string;
  itemCategoryName?: string | null;
};

export type StampLogValue = {
  note: string;
  paymentType: PaymentTypeEnumType["value"];
  paymentTypeName: string;
  amount: number;
  logMeta: StampLogMeta;
  storeName: StoreTypeEnumType["value"];
  storeLabel: string;
  finalAmount: number;
  finalAmountExpression: string;
};

export type StampLogFormInitialValue = {
  paymentType?: PaymentTypeEnumType["value"];
  storeName?: StoreTypeEnumType["value"];
  amount?: number;
  logMeta?: StampLogMeta | null;
};

const formatAmount = (value: number) => value.toLocaleString("ko-KR");
const parseSignedAmount = (value: string) => {
  if (value === "" || value === "-") return 0;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getOutboundRuleType = (
  remarkType: RemarkOptionValue,
): OutboundMemoRuleOutboundType => {
  if (remarkType === "exchange_in" || remarkType === "exchange_out") {
    return remarkType;
  }
  if (remarkType === "service" || remarkType === "price_adjust") {
    return remarkType;
  }
  return "standard";
};

export default function StampLogForm({
  onChange,
  initialValue,
  isStampAmountEditable = true,
  layout = "stacked",
  leftPanelExtra,
  rightPanelExtra,
  step,
  onValidityChange,
  reservationSlot,
  customerMode = "normal",
  currentStampCount = 0,
  customerAddress,
}: {
  onChange: (value: StampLogValue | null) => void;
  initialValue?: StampLogFormInitialValue;
  isStampAmountEditable?: boolean;
  /**
   * 'stacked' (기본): 기존처럼 모든 섹션을 한 줄로 쌓아서 표시
   * 'split': 매장명/결제유형/스탬프개수/할인은 좌측, 품목/금액/특이사항은 우측 2단 레이아웃
   */
  layout?: "stacked" | "split";
  /** layout이 'split'일 때 좌측 패널 최상단에 렌더링할 요소 (예: 대상 고객 카드) */
  leftPanelExtra?: React.ReactNode;
  /** layout이 'split'일 때 우측 패널 최하단에 렌더링할 요소 (예: 출고 예약 토글) */
  rightPanelExtra?: React.ReactNode;
  /**
   * layout이 'split'일 때만 사용. 값이 있으면 2단 레이아웃 대신 스텝별 필드만 노출:
   * 1 → 매장명/결제유형/스탬프개수, 2 → 품목선택/품목목록/할인/금액/특이사항
   * (내부 상태 보존을 위해 컴포넌트는 계속 마운트된 채로 CSS로만 숨김)
   */
  step?: 1 | 2 | 3;
  /** paymentType, 품목 선택 여부가 바뀔 때마다 호출 (스텝 이동 가능 여부 판단용) */
  onValidityChange?: (info: {
    hasPaymentType: boolean;
    hasItems: boolean;
    hasDeliveryInfo: boolean;
    hasCompletedBasicSequence: boolean;
  }) => void;
  /** step 모드에서 2번 스텝의 출고 특이사항 입력 오른쪽에 함께 렌더링할 요소 (예: 출고 예약 토글) */
  reservationSlot?: React.ReactNode;
  customerMode?: CustomerMode;
  currentStampCount?: number;
  customerAddress?: string | null;
}) {
  const [paymentType, setPaymentType] = useState<
    PaymentTypeEnumType["value"] | ""
  >(initialValue?.paymentType ?? "");
  const [amount, setAmount] = useState<number>(
    customerMode === "x" ? 0 : (initialValue?.amount ?? 0),
  );
  const [paymentMode, setPaymentMode] = useState<"single" | "split" | "remark">(
    initialValue?.logMeta?.payments?.length
      ? "split"
      : initialValue?.paymentType === PaymentTypeEnum.SHIPMENT_REMARK.value
        ? "remark"
        : "single",
  );
  const [splitPayments, setSplitPayments] = useState<
    Array<{
      paymentType: PaymentTypeEnumType["value"];
      paymentTypeName: string;
      amount: number;
    }>
  >(initialValue?.logMeta?.payments ?? []);
  const [storeName, setStoreName] = useState<StoreTypeEnumType["value"]>(
    initialValue?.storeName ?? StoreTypeEnum.OVAPE.value,
  );
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>(
    initialValue?.logMeta?.deliveryMethod ?? "store_visit",
  );
  const [hasConfirmedStore, setHasConfirmedStore] = useState(true);
  const [hasConfirmedDeliveryMethod, setHasConfirmedDeliveryMethod] = useState(
    Boolean(initialValue),
  );
  const [deliveryAddressSource, setDeliveryAddressSource] = useState<
    "registered" | "new"
  >(initialValue?.logMeta?.deliveryAddressSource ?? "new");
  const [deliveryAddress, setDeliveryAddress] = useState(
    initialValue?.logMeta?.deliveryAddress ?? "",
  );
  const [deliveryFeeInput, setDeliveryFeeInput] = useState(
    initialValue?.logMeta?.deliveryFee === undefined
      ? ""
      : String(initialValue.logMeta.deliveryFee),
  );
  const deliveryFee = deliveryFeeInput === "" ? 0 : Number(deliveryFeeInput);
  const [itemSearch, setItemSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState<ItemType | null>(null);
  const [showItemResults, setShowItemResults] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [remarkType, setRemarkType] = useState<RemarkOptionValue>("");
  const [customRemark, setCustomRemark] = useState("");
  const [exchangeMemo, setExchangeMemo] = useState("");
  const [priceAdjustAmount, setPriceAdjustAmount] = useState("0");
  const [priceAdjustMemo, setPriceAdjustMemo] = useState("");
  const [operationMemo, setOperationMemo] = useState("");
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [draftLines, setDraftLines] = useState<DraftStampLogLine[]>(
    () =>
      initialValue?.logMeta?.items?.map((item, index) => ({
        ...item,
        id: `${item.itemId}-${index}`,
      })) ?? [],
  );
  const [discountType, setDiscountType] = useState<DiscountOptionValue | "">(
    () => {
      const initialDiscountType = initialValue?.logMeta?.discount?.type;
      return discountOptions.some(
        (option) => option.value === initialDiscountType,
      )
        ? (initialDiscountType as DiscountOptionValue)
        : "";
    },
  );
  const [discountAmount, setDiscountAmount] = useState(
    initialValue?.logMeta?.discount?.amount ?? 0,
  );
  const [extraNote, setExtraNote] = useState(
    initialValue?.logMeta?.extraNote ?? "",
  );
  const itemSearchRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef(new Map<string, HTMLElement>());
  const previousLineRectsRef = useRef(new Map<string, DOMRect>());

  const itemFilters = useMemo(
    () => ({
      searchConditions: itemSearch.trim()
        ? [{ searchTarget: "item_name", searchKeyword: itemSearch.trim() }]
        : undefined,
      isUse: true,
    }),
    [itemSearch],
  );
  const { items, isLoading: isItemsLoading } = useItems(itemFilters);
  const { rules: outboundMemoRules, isError: isOutboundMemoRulesError } =
    useOutboundMemoRules();

  const paymentTypeOptions = paymentTypesByStore[storeName];
  const isNonSalesSpecialCustomer =
    customerMode === "demo" || customerMode === "adjustment";
  const usesStandardSalesFlow =
    customerMode === "normal" || customerMode === "x";
  const visibleRemarkOptions =
    customerMode === "adjustment"
      ? ([
          { value: "adjustment_in", name: "재고조정-입고" },
          { value: "adjustment_out", name: "재고조정-출고" },
        ] as const)
      : customerMode === "demo"
        ? ([{ value: "demo", name: "시연용" }] as const)
        : remarkOptions;
  const getMemoRulesForItem = (
    item: ItemType | null,
    outboundType: OutboundMemoRuleOutboundType,
  ): OutboundMemoRule[] => {
    if (!item || !usesStandardSalesFlow) return [];

    const itemRules = outboundMemoRules.filter(
      (rule) =>
        rule.is_active &&
        (rule.applicable_outbound_types?.length
          ? rule.applicable_outbound_types
          : [
              "standard",
              "service",
              "exchange_in",
              "exchange_out",
              "price_adjust",
            ]
        ).includes(outboundType) &&
        rule.target_type === "item" &&
        String(rule.item_id) === String(item.id),
    );
    if (itemRules.length) return itemRules;

    return outboundMemoRules.filter(
      (rule) =>
        rule.is_active &&
        (rule.applicable_outbound_types?.length
          ? rule.applicable_outbound_types
          : [
              "standard",
              "service",
              "exchange_in",
              "exchange_out",
              "price_adjust",
            ]
        ).includes(outboundType) &&
        rule.target_type === "category" &&
        (String(rule.category_id) === String(item.category_id) ||
          (Boolean(rule.item_categories?.name) &&
            rule.item_categories?.name === item.item_categories?.name)),
    );
  };
  const selectedOutboundRuleType = getOutboundRuleType(remarkType);
  const selectedMemoRules = getMemoRulesForItem(
    selectedItem,
    selectedOutboundRuleType,
  );
  const usesLegacyDeviceMemoRule =
    isOutboundMemoRulesError &&
    selectedItem?.item_categories?.name.trim() === "기기";
  const selectedMemoMessages = usesLegacyDeviceMemoRule
    ? ["박스 매장 보관 유무를 적어주세요."]
    : selectedMemoRules.map((rule) => rule.message);
  const isSelectedMemoRequired = selectedMemoRules.some(
    (rule) => rule.is_required,
  );
  const selectedRuleMemo =
    selectedOutboundRuleType === "exchange_in" ||
    selectedOutboundRuleType === "exchange_out"
      ? exchangeMemo
      : selectedOutboundRuleType === "price_adjust"
        ? priceAdjustMemo
        : customRemark;
  const totalAmount = draftLines.reduce((sum, line) => sum + line.amount, 0);
  const discountLabel = discountOptions.find(
    (option) => option.value === discountType,
  )?.name;
  const activeDiscountAmount = discountLabel ? discountAmount : 0;
  const activeDeliveryFee = deliveryMethod === "store_visit" ? 0 : deliveryFee;
  const discountTag =
    discountLabel && activeDiscountAmount > 0
      ? `${discountLabel}할인${activeDiscountAmount}`
      : "";
  const discountLine = discountTag ? `${discountTag})` : "";
  const deliveryFeeLabel =
    deliveryMethod === "parcel"
      ? "택배비"
      : deliveryMethod === "delivery"
        ? "배달비"
        : "";
  const deliveryFeeTag =
    deliveryFeeLabel && activeDeliveryFee > 0
      ? `${deliveryFeeLabel}${activeDeliveryFee}`
      : "";
  const transactionTags = [discountTag, deliveryFeeTag].filter(Boolean);
  const transactionNote =
    transactionTags.length > 0 ? `${transactionTags.join(",")})` : "";
  const itemNote = draftLines.map((line) => line.lineText).join(", ");
  const generatedNote = [transactionNote, itemNote].filter(Boolean).join(" ");
  const finalAmount = totalAmount - activeDiscountAmount;
  const splitPaymentTotal = splitPayments.reduce(
    (sum, payment) => sum + payment.amount,
    0,
  );
  const splitPaymentDifference = finalAmount - splitPaymentTotal;
  const hasAmountForEverySplitPayment =
    splitPayments.length >= 2 &&
    splitPayments.every((payment) => payment.amount >= 1);
  const splitPaymentMatches =
    hasAmountForEverySplitPayment && splitPaymentDifference === 0;
  const amountExpression = draftLines
    .map((line) => formatAmount(line.amount))
    .join(" + ");
  const finalAmountExpression = [
    amountExpression || "0",
    activeDiscountAmount > 0 ? `- ${formatAmount(activeDiscountAmount)}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const hasSelectedSplitPayments = splitPayments.length >= 2;
  const hasValidPayment =
    paymentMode === "remark"
      ? true
      : paymentMode === "split"
        ? hasSelectedSplitPayments
        : paymentType !== "";
  const hasValidDeliveryInfo =
    deliveryMethod === "store_visit" ||
    (deliveryAddress.trim().length > 0 && deliveryFeeInput !== "");

  useEffect(() => {
    if (!isNonSalesSpecialCustomer) return;
    setPaymentType(PaymentTypeEnum.SHIPMENT_REMARK.value);
    setAmount(0);
    setDiscountType("");
    setDiscountAmount(0);
  }, [isNonSalesSpecialCustomer]);

  useEffect(() => {
    if (customerMode === "x") setAmount(0);
  }, [customerMode]);

  useEffect(() => {
    if (customerMode === "demo") setRemarkType("demo");
  }, [customerMode]);

  const resetLineInputs = () => {
    setItemSearch("");
    setSelectedItem(null);
    setShowItemResults(false);
    setQuantity(1);
    setRemarkType(customerMode === "demo" ? "demo" : "");
    setCustomRemark("");
    setExchangeMemo("");
    setPriceAdjustAmount("0");
    setPriceAdjustMemo("");
    setOperationMemo("");
    setEditingLineId(null);
  };

  const getItemLabel = (item: ItemType) => {
    return item.item_name;
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        itemSearchRef.current &&
        !itemSearchRef.current.contains(event.target as Node)
      ) {
        setShowItemResults(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!selectedItem && itemSearch.trim()) {
      setShowItemResults(true);
    }
  }, [itemSearch, selectedItem]);

  // 부모에게 현재 값을 전달 (유효하지 않으면 null)
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!hasValidPayment || draftLines.length === 0) {
      onChangeRef.current(null);
      return;
    }

    const logMeta: StampLogMeta = {
      storeName,
      totalAmount: finalAmount,
      extraNote: extraNote.trim() || undefined,
      deliveryMethod,
      deliveryAddressSource:
        deliveryMethod === "store_visit" ? undefined : deliveryAddressSource,
      deliveryAddress:
        deliveryMethod === "store_visit"
          ? undefined
          : deliveryAddress.trim() || undefined,
      deliveryFee:
        deliveryMethod === "store_visit" ? undefined : activeDeliveryFee,
      payments:
        paymentMode === "split" && hasSelectedSplitPayments
          ? splitPayments
          : undefined,
      discount:
        discountLabel && activeDiscountAmount > 0
          ? {
              type: discountType,
              name: discountLabel,
              amount: activeDiscountAmount,
              lineText: discountLine,
            }
          : undefined,
      items: draftLines.map((line) => ({
        itemId: line.itemId,
        itemName: line.itemName,
        itemCategoryName: line.itemCategoryName,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        adjustedUnitPrice: line.adjustedUnitPrice,
        amount: line.amount,
        remark: line.remark,
        lineText: line.lineText,
        inventoryAction: line.inventoryAction,
      })),
    };

    onChangeRef.current({
      note: generatedNote,
      paymentType:
        paymentMode === "remark"
          ? PaymentTypeEnum.SHIPMENT_REMARK.value
          : paymentMode === "split"
            ? splitPayments[0].paymentType
            : (paymentType as PaymentTypeEnumType["value"]),
      paymentTypeName:
        paymentMode === "remark"
          ? PaymentTypeEnum.SHIPMENT_REMARK.name
          : paymentMode === "split"
            ? "분할결제"
            : (paymentTypeOptions.find((o) => o.value === paymentType)?.name ??
              ""),
      amount,
      logMeta,
      storeName,
      storeLabel:
        Object.values(StoreTypeEnum).find((o) => o.value === storeName)?.name ??
        "",
      finalAmount,
      finalAmountExpression,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    paymentType,
    draftLines,
    storeName,
    deliveryMethod,
    deliveryAddressSource,
    deliveryAddress,
    deliveryFee,
    activeDeliveryFee,
    deliveryFeeTag,
    transactionNote,
    amount,
    finalAmount,
    finalAmountExpression,
    generatedNote,
    discountLabel,
    activeDiscountAmount,
    discountType,
    discountLine,
    extraNote,
    paymentMode,
    splitPayments,
    hasValidPayment,
    hasSelectedSplitPayments,
  ]);

  // 스텝 UI에서 "다음" 버튼 활성화 여부를 부모가 판단할 수 있도록 알림
  const onValidityChangeRef = useRef(onValidityChange);
  onValidityChangeRef.current = onValidityChange;

  useEffect(() => {
    onValidityChangeRef.current?.({
      hasPaymentType: hasValidPayment,
      hasItems: draftLines.length > 0,
      hasDeliveryInfo: hasValidDeliveryInfo,
      hasCompletedBasicSequence:
        hasConfirmedStore &&
        hasConfirmedDeliveryMethod &&
        hasValidDeliveryInfo &&
        hasValidPayment,
    });
  }, [
    hasValidPayment,
    hasValidDeliveryInfo,
    hasConfirmedStore,
    hasConfirmedDeliveryMethod,
    draftLines,
  ]);

  const handleItemSelect = (item: ItemType) => {
    setSelectedItem(item);
    setItemSearch("");
    setShowItemResults(false);
    const matchedRules = getMemoRulesForItem(
      item,
      getOutboundRuleType(remarkType),
    );
    const useLegacyRule =
      isOutboundMemoRulesError && item.item_categories?.name.trim() === "기기";
    const messages = useLegacyRule
      ? ["박스 매장 보관 유무를 적어주세요."]
      : matchedRules.map((rule) => rule.message);
    if (
      useLegacyRule ||
      matchedRules.some((rule) => rule.auto_select_memo || rule.is_required)
    ) {
      setRemarkType("custom");
    }
    if (messages.length) {
      toast(messages.join("\n"), {
        icon: "📦",
      });
    }
  };

  const handleRemarkTypeChange = (nextType: RemarkOptionValue) => {
    const matchedRules = getMemoRulesForItem(
      selectedItem,
      getOutboundRuleType(nextType),
    );
    setRemarkType(
      nextType === "" && matchedRules.some((rule) => rule.is_required)
        ? "custom"
        : nextType,
    );
    if (matchedRules.length) {
      toast(matchedRules.map((rule) => rule.message).join("\n"), {
        icon: "📦",
      });
    }
  };

  const handleItemRemove = () => {
    setSelectedItem(null);
    setItemSearch("");
    setShowItemResults(false);
  };

  const handleAddLine = () => {
    if (!selectedItem || quantity < 1) return;
    if (isSelectedMemoRequired && !selectedRuleMemo.trim()) {
      toast.error("안내된 메모를 입력해 주세요.");
      return;
    }
    if (
      customerMode === "adjustment" &&
      remarkType !== "adjustment_in" &&
      remarkType !== "adjustment_out"
    ) {
      toast.error("재고조정-입고 또는 재고조정-출고를 선택해 주세요.");
      return;
    }

    const price = selectedItem.selling_price ?? 0;
    const adjustedPrice = parseSignedAmount(priceAdjustAmount);
    const priceAdjustmentMemo = priceAdjustMemo.trim() || "가격 조정";
    const isExchange =
      remarkType === "exchange_in" || remarkType === "exchange_out";
    const exchangeLabel =
      remarkType === "exchange_in" ? "교환입고" : "교환출고";
    const optionalOperationMemo = operationMemo.trim();
    const remark =
      customerMode === "demo"
        ? `시연용${optionalOperationMemo ? `,${optionalOperationMemo}` : ""}`
        : customerMode === "adjustment"
          ? remarkType === "adjustment_in"
            ? `재고조정-입고${optionalOperationMemo ? `,${optionalOperationMemo}` : ""}`
            : remarkType === "adjustment_out"
              ? `재고조정-출고${optionalOperationMemo ? `,${optionalOperationMemo}` : ""}`
              : ""
          : isExchange
            ? `${exchangeLabel}${exchangeMemo.trim() ? `(${exchangeMemo.trim()})` : ""}`
            : remarkType === "service"
              ? `서비스${customRemark.trim() ? `(${customRemark.trim()})` : ""}`
              : remarkType === "custom"
                ? customRemark.trim()
                : remarkType === "price_adjust"
                  ? priceAdjustmentMemo
                  : "";
    const isFreeRemark =
      isNonSalesSpecialCustomer || remarkType === "service" || isExchange;
    const lineAmount = isFreeRemark
      ? 0
      : remarkType === "price_adjust"
        ? adjustedPrice * quantity
        : price * quantity;
    const remarkText =
      remarkType === "price_adjust"
        ? `${remark}, ${formatAmount(adjustedPrice)}원`
        : remark;
    const lineText = `${selectedItem.item_name} ${quantity}개${
      remarkText ? ` (${remarkText})` : ""
    }`;

    const nextLine: DraftStampLogLine = {
      id: editingLineId ?? `${selectedItem.id}-${Date.now()}`,
      itemId: selectedItem.id,
      itemName: selectedItem.item_name,
      itemCategoryName: selectedItem.item_categories?.name ?? null,
      quantity,
      unitPrice: price,
      adjustedUnitPrice: remarkType === "price_adjust" ? adjustedPrice : null,
      amount: lineAmount,
      remark,
      lineText,
      inventoryAction:
        customerMode === "demo"
          ? "out"
          : remarkType === "exchange_in"
            ? "exchange_in"
            : remarkType === "exchange_out"
              ? "exchange_out"
              : remarkType === "adjustment_in"
                ? "adjustment_in"
                : remarkType === "adjustment_out"
                  ? "adjustment_out"
                  : "out",
    };

    setDraftLines((prev) =>
      editingLineId
        ? prev.map((line) => (line.id === editingLineId ? nextLine : line))
        : [...prev, nextLine],
    );
    resetLineInputs();
  };

  const handleEditLine = (line: DraftStampLogLine) => {
    const item: ItemType = items.find(
      (candidate) => candidate.id === line.itemId,
    ) ?? {
      id: line.itemId,
      category_id: null,
      item_code: "",
      item_name: line.itemName,
      purchase_price: null,
      selling_price: line.unitPrice,
      liquid_type: null,
      liquid_flavor: null,
      note: null,
      is_use: true,
      created_at: "",
      updated_at: "",
      item_categories: line.itemCategoryName
        ? {
            id: "",
            name: line.itemCategoryName,
            order_index: 0,
            created_at: "",
          }
        : null,
    };

    setEditingLineId(line.id);
    setSelectedItem(item);
    setItemSearch("");
    setShowItemResults(false);
    setQuantity(line.quantity);
    setCustomRemark("");
    setExchangeMemo("");
    setPriceAdjustAmount(
      typeof line.adjustedUnitPrice === "number"
        ? String(line.adjustedUnitPrice)
        : "0",
    );
    setPriceAdjustMemo("");

    if (line.inventoryAction === "exchange_in") {
      setRemarkType("exchange_in");
      setExchangeMemo(line.remark?.match(/^교환입고\((.*)\)$/)?.[1] ?? "");
    } else if (line.inventoryAction === "exchange_out") {
      setRemarkType("exchange_out");
      setExchangeMemo(line.remark?.match(/^교환출고\((.*)\)$/)?.[1] ?? "");
    } else if (typeof line.adjustedUnitPrice === "number") {
      setRemarkType("price_adjust");
      setPriceAdjustMemo(
        line.remark === "가격 조정" ? "" : (line.remark ?? ""),
      );
    } else if (line.remark?.startsWith("서비스")) {
      setRemarkType("service");
      setCustomRemark(line.remark.match(/^서비스\((.*)\)$/)?.[1] ?? "");
    } else if (line.remark) {
      setRemarkType("custom");
      setCustomRemark(line.remark);
    } else {
      setRemarkType("");
    }
  };

  const getShipmentTypeLabel = (line: DraftStampLogLine) => {
    if (line.inventoryAction === "adjustment_in") return "재고조정-입고";
    if (line.inventoryAction === "adjustment_out") return "재고조정-출고";
    if (line.inventoryAction === "exchange_in") return "교환입고";
    if (line.inventoryAction === "exchange_out") return "교환출고";
    if (line.remark?.startsWith("시연용")) return "시연용";
    if (typeof line.adjustedUnitPrice === "number") return "가격조정";
    if (line.remark?.startsWith("서비스")) return "서비스";
    return "일반판매";
  };

  const getShipmentTypeClassName = (line: DraftStampLogLine) => {
    const type = getShipmentTypeLabel(line);

    if (type === "서비스") return "bg-sky-50 text-sky-700";
    if (type === "교환입고") return "bg-emerald-50 text-emerald-700";
    if (type === "교환출고") return "bg-amber-50 text-amber-700";
    if (type === "가격조정") return "bg-violet-50 text-violet-700";
    return "bg-gray-100 text-gray-600";
  };

  const getLineDisplayMemo = (line: DraftStampLogLine) => {
    const remark = line.remark?.trim();
    if (!remark) return "";

    const wrappedMemo = remark.match(
      /^(?:서비스|교환입고|교환출고)\((.*)\)$/,
    )?.[1];
    if (wrappedMemo) return wrappedMemo.trim();

    if (
      remark === "서비스" ||
      remark === "교환입고" ||
      remark === "교환출고" ||
      remark === "가격 조정" ||
      remark === "가격조정"
    ) {
      return "";
    }

    return remark;
  };

  const setLineRef = (id: string) => (node: HTMLElement | null) => {
    if (node) {
      lineRefs.current.set(id, node);
    } else {
      lineRefs.current.delete(id);
    }
  };

  const captureLinePositions = () => {
    const nextRects = new Map<string, DOMRect>();
    lineRefs.current.forEach((node, id) => {
      nextRects.set(id, node.getBoundingClientRect());
    });
    previousLineRectsRef.current = nextRects;
  };

  const moveLine = (fromIndex: number, direction: -1 | 1) => {
    const toIndex = fromIndex + direction;
    captureLinePositions();
    setDraftLines((prev) => {
      if (toIndex < 0 || toIndex >= prev.length) return prev;

      const next = [...prev];
      const [movedLine] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, movedLine);
      return next;
    });
  };

  useLayoutEffect(() => {
    const previousRects = previousLineRectsRef.current;
    if (previousRects.size === 0) return;

    lineRefs.current.forEach((node, id) => {
      const previousRect = previousRects.get(id);
      if (!previousRect) return;

      const currentRect = node.getBoundingClientRect();
      const deltaY = previousRect.top - currentRect.top;
      if (deltaY === 0) return;

      node.style.transition = "none";
      node.style.transform = `translateY(${deltaY}px)`;
      node.style.zIndex = "1";

      requestAnimationFrame(() => {
        node.style.transition = "transform 180ms ease";
        node.style.transform = "translateY(0)";

        node.addEventListener(
          "transitionend",
          () => {
            node.style.transition = "";
            node.style.transform = "";
            node.style.zIndex = "";
          },
          { once: true },
        );
      });
    });

    previousLineRectsRef.current = new Map();
  }, [draftLines]);

  const storeField = (
    <div>
      <span className="block text-sm font-medium mb-2">
        매장명 <span className="text-rose-600">*</span>
      </span>
      <div className="grid grid-cols-2 gap-2">
        {Object.values(StoreTypeEnum).map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={storeName === option.value ? "primary" : "gray"}
            onClick={() => {
              setStoreName(option.value);
              setPaymentType("");
            }}
          >
            {option.name}
          </Button>
        ))}
      </div>
    </div>
  );

  const paymentField = (
    <div>
      <span className="block text-sm font-medium mb-2">
        결제 유형 <span className="text-rose-600">*</span>
      </span>
      <div className="grid grid-cols-3 gap-2">
        {paymentTypeOptions.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={paymentType === option.value ? "primary" : "gray"}
            onClick={() => setPaymentType(option.value)}
          >
            {option.name}
          </Button>
        ))}
      </div>
    </div>
  );

  const stampCountField = (
    <div className={step === 1 ? "min-w-0 w-full" : undefined}>
      {step !== 1 && (
        <label className="mb-1 block text-sm font-medium text-gray-700">
          스탬프 개수 <span className="text-rose-600">*</span>
        </label>
      )}
      <div
        className={
          step === 1
            ? "grid grid-cols-[minmax(42px,1fr)_32px_32px] items-center gap-1"
            : "flex items-center gap-2"
        }
      >
        <input
          type="text"
          value={amount}
          onChange={(e) => {
            if (!isStampAmountEditable) return;
            const v = e.target.value;
            if (v === "" || /^[0-9]+$/.test(v)) {
              setAmount(v === "" ? 0 : Number(v));
            }
          }}
          disabled={!isStampAmountEditable}
          className={`${step === 1 ? "h-9 w-full" : "w-16 py-2"} rounded-lg border border-gray-300 px-3 text-center text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-100 disabled:text-gray-500`}
        />
        <button
          type="button"
          onClick={() => setAmount((v) => Math.max(0, v - 1))}
          disabled={!isStampAmountEditable}
          className="flex h-9 w-8 items-center justify-center rounded-lg border border-gray-300 bg-white text-lg leading-none text-gray-600 transition-colors hover:bg-gray-50 active:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          −
        </button>
        <button
          type="button"
          onClick={() => setAmount((v) => v + 1)}
          disabled={!isStampAmountEditable}
          className="flex h-9 w-8 items-center justify-center rounded-lg bg-brand-500 text-lg leading-none text-white transition-colors hover:bg-brand-600 active:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          +
        </button>
      </div>
      {!isStampAmountEditable ? (
        <p className="mt-1.5 whitespace-nowrap text-[10px] text-gray-400">
          {customerMode === "x"
            ? "미적립 고객은 스탬프가 적립되지 않습니다."
            : "수정 시 스탬프 개수는 변경되지 않습니다."}
        </p>
      ) : (
        amount === 0 && (
          <p className="mt-1.5 whitespace-nowrap text-[10px] text-gray-400">
            0개 입력시{" "}
            <span className="font-medium text-gray-500">
              미적립 처리됩니다.
            </span>
          </p>
        )
      )}
    </div>
  );

  const stepOneStoreField = (
    <div className="grid grid-cols-[140px_minmax(0,1fr)] items-center border-b border-gray-200">
      <div className="flex h-full items-center border-r border-gray-200 px-4 py-4 text-sm font-bold text-gray-800">
        <span className="mr-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500 text-[11px] font-bold leading-none text-white">
          {hasConfirmedStore ? "✓" : "1"}
        </span>
        출고 매장 <span className="ml-1 text-rose-600">*</span>
      </div>
      <div className="grid grid-cols-2 gap-2 p-4">
        {Object.values(StoreTypeEnum).map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={
              hasConfirmedStore && storeName === option.value
                ? "primary"
                : "gray"
            }
            className="rounded-lg"
            onClick={() => {
              setStoreName(option.value);
              setHasConfirmedStore(true);
              setHasConfirmedDeliveryMethod(false);
              setPaymentType("");
              setSplitPayments([]);
            }}
          >
            {option.name}
          </Button>
        ))}
      </div>
    </div>
  );

  const stepOnePaymentField = (
    <div className="grid grid-cols-[140px_minmax(0,1fr)] border-b border-gray-200">
      <div className="flex items-start border-r border-gray-200 px-4 py-5 text-sm font-bold text-gray-800">
        <span className="mr-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500 text-[11px] font-bold leading-none text-white">
          {hasValidPayment ? "✓" : "3"}
        </span>
        결제 정보 <span className="ml-1 text-rose-600">*</span>
      </div>
      <div className="min-w-0 p-4">
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { value: "single", label: "단일결제" },
              { value: "split", label: "분할결제" },
              { value: "remark", label: "특이사항" },
            ] as const
          ).map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={paymentMode === option.value ? "primary" : "gray"}
              className="rounded-lg"
              onClick={() => {
                setPaymentMode(option.value);
                if (option.value === "remark") {
                  setPaymentType(PaymentTypeEnum.SHIPMENT_REMARK.value);
                  setSplitPayments([]);
                } else if (option.value === "single") {
                  setSplitPayments([]);
                  if (paymentType === PaymentTypeEnum.SHIPMENT_REMARK.value)
                    setPaymentType("");
                } else {
                  setPaymentType("");
                }
              }}
            >
              {option.label}
            </Button>
          ))}
        </div>

        {paymentMode !== "remark" && (
          <div className="mt-3 border-t border-gray-200 pt-3">
            <div className="grid grid-cols-3 gap-2">
              {paymentTypeOptions.map((option) => {
                const splitPayment = splitPayments.find(
                  (payment) => payment.paymentType === option.value,
                );
                const selected =
                  paymentMode === "single"
                    ? paymentType === option.value
                    : Boolean(splitPayment);
                return (
                  <Button
                    key={option.value}
                    type="button"
                    size="sm"
                    variant={selected ? "primary" : "gray"}
                    onClick={() => {
                      if (paymentMode === "single") {
                        setPaymentType(option.value);
                        return;
                      }
                      setSplitPayments((current) =>
                        current.some(
                          (payment) => payment.paymentType === option.value,
                        )
                          ? current.filter(
                              (payment) => payment.paymentType !== option.value,
                            )
                          : [
                              ...current,
                              {
                                paymentType: option.value,
                                paymentTypeName: option.name,
                                amount: 0,
                              },
                            ],
                      );
                    }}
                  >
                    <span className="whitespace-nowrap">{option.name}</span>
                  </Button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const stepOneDeliveryField = (
    <div className="grid grid-cols-[140px_minmax(0,1fr)] border-b border-gray-200">
      <div className="flex items-start border-r border-gray-200 px-4 py-5 text-sm font-bold text-gray-800">
        <span className="mr-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500 text-[11px] font-bold leading-none text-white">
          {hasConfirmedDeliveryMethod && hasValidDeliveryInfo ? "✓" : "2"}
        </span>
        수령 방식 <span className="ml-1 text-rose-600">*</span>
      </div>
      <div className="min-w-0 p-4">
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { value: "store_visit", label: "매장방문" },
              { value: "parcel", label: "택배" },
              { value: "delivery", label: "배달" },
            ] as const
          ).map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={
                hasConfirmedDeliveryMethod && deliveryMethod === option.value
                  ? "primary"
                  : "gray"
              }
              onClick={() => {
                setDeliveryMethod(option.value);
                setHasConfirmedDeliveryMethod(true);
                setPaymentType("");
                setSplitPayments([]);
                if (option.value === "store_visit") {
                  setDeliveryAddress("");
                  setDeliveryFeeInput("");
                }
              }}
            >
              {option.label}
            </Button>
          ))}
        </div>
        {deliveryMethod !== "store_visit" && (
          <div className="mt-3 grid grid-cols-[72px_minmax(0,1fr)_88px] items-start gap-2 pt-2">
            <div>
              <label className="mb-1 block h-4 text-xs font-semibold leading-4 text-gray-600">
                {deliveryMethod === "parcel" ? "택배비" : "배달비"}
              </label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={5}
                  value={deliveryFeeInput}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (
                      value === "" ||
                      (/^[0-9]+$/.test(value) && value.length <= 5)
                    ) {
                      setDeliveryFeeInput(value);
                    }
                  }}
                  placeholder="금액"
                  className="h-20 w-full rounded-lg border border-gray-300 bg-white pl-1.5 pr-6 text-right text-sm outline-none transition placeholder:text-gray-400 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">
                  원
                </span>
              </div>
            </div>
            <div className="min-w-0">
              <label className="mb-1 block h-4 text-xs font-semibold leading-4 text-gray-600">
                배송 주소
              </label>
              <textarea
                value={deliveryAddress}
                onChange={(event) => setDeliveryAddress(event.target.value)}
                placeholder={
                  customerAddress?.trim()
                    ? "배송 주소를 확인하세요."
                    : "배송 주소를 입력하세요."
                }
                rows={3}
                className="h-20 w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm leading-5 outline-none transition placeholder:text-gray-400 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </div>
            <div>
              <div aria-hidden="true" className="mb-1 h-4" />
              <div className="grid h-20 grid-rows-2 gap-2">
                <Button
                  type="button"
                  size="xs"
                  variant={
                    deliveryAddressSource === "registered" ? "primary" : "gray"
                  }
                  disabled={!customerAddress?.trim()}
                  onClick={() => {
                    setDeliveryAddressSource("registered");
                    setDeliveryAddress(customerAddress?.trim() ?? "");
                  }}
                  className="h-9 w-full"
                >
                  불러오기
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant={deliveryAddressSource === "new" ? "primary" : "gray"}
                  onClick={() => {
                    setDeliveryAddressSource("new");
                    setDeliveryAddress("");
                  }}
                  className="h-9 w-full"
                >
                  새로작성
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const stepOneStampField = (
    <div className="grid grid-cols-[140px_minmax(0,1fr)]">
      <div className="flex items-start border-r border-gray-200 px-4 py-5 text-sm font-bold text-gray-800">
        <span className="mr-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500 text-[11px] font-bold leading-none text-white">
          4
        </span>
        스탬프 적립
      </div>
      <div className="min-w-0 p-4">
        <div className="grid grid-cols-3 items-stretch gap-2">
          <div className="min-w-0 rounded-lg border border-gray-200 bg-gray-50 p-2">
            {stampCountField}
          </div>
          <div className="flex min-w-0 flex-col items-center justify-center rounded-lg border border-gray-200 bg-gray-50 px-2 py-3 text-center">
            <p className="whitespace-nowrap text-[10px] text-gray-500">
              현재 스탬프 잔여량
            </p>
            <strong className="text-lg text-gray-900">
              {currentStampCount}개
            </strong>
          </div>
          <div className="flex min-w-0 flex-col items-center justify-center rounded-lg border border-gray-200 bg-gray-50 px-2 py-3 text-center">
            <p className="whitespace-nowrap text-[10px] text-gray-500">
              적립 후 잔여량
            </p>
            <strong className="text-lg text-brand-600">
              {currentStampCount + amount}개
            </strong>
          </div>
        </div>
      </div>
    </div>
  );

  const itemSelectionField = (
    <div className="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 lg:grid-cols-2 lg:items-stretch">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(270px,1fr)]">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            품목 선택 <span className="text-rose-600">*</span>
          </label>
          <div ref={itemSearchRef} className="relative">
            <div className="relative">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="m21 21-4.35-4.35m2.1-5.4a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z"
                />
              </svg>
              <input
                type="text"
                value={selectedItem ? getItemLabel(selectedItem) : itemSearch}
                onChange={(e) => {
                  if (!selectedItem) {
                    setItemSearch(e.target.value);
                  }
                }}
                onFocus={() => {
                  if (!selectedItem && itemSearch.trim()) {
                    setShowItemResults(true);
                  }
                }}
                disabled={!!selectedItem}
                className={`h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-10 text-sm font-medium text-gray-900 shadow-sm outline-none transition placeholder:font-normal placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 ${
                  selectedItem
                    ? "bg-gray-100 text-gray-700 cursor-not-allowed"
                    : "bg-white"
                }`}
                placeholder="품목명을 입력하세요"
              />
              {selectedItem && !editingLineId ? (
                <button
                  type="button"
                  onClick={handleItemRemove}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  aria-label="품목 선택 해제"
                >
                  X
                </button>
              ) : !selectedItem ? (
                isItemsLoading && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="w-4 h-4 border-2 border-brand-300 border-t-brand-600 rounded-full animate-spin" />
                  </div>
                )
              ) : null}
            </div>

            {!selectedItem && showItemResults && items.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-brand-200 rounded-lg shadow-lg max-h-60 overflow-auto">
                {items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="block w-full px-4 py-3 text-left cursor-pointer hover:bg-brand-50 transition-colors border-b border-brand-50 last:border-b-0"
                    onClick={() => handleItemSelect(item)}
                  >
                    <div className="flex items-start gap-2">
                      <p className="min-w-0 flex-1 break-words text-sm font-medium text-gray-900">
                        {getItemLabel(item)}
                      </p>
                      <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                        {item.item_categories?.name ?? "미분류"}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {!selectedItem &&
              showItemResults &&
              items.length === 0 &&
              itemSearch.trim() &&
              !isItemsLoading && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-brand-200 rounded-lg shadow-lg p-4">
                  <p className="text-sm text-gray-500 text-center">
                    검색 결과가 없습니다.
                  </p>
                </div>
              )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            수량
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={quantity}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "" || /^[0-9]+$/.test(v)) {
                  setQuantity(v === "" ? 1 : Math.max(1, Number(v)));
                }
              }}
              className="h-10 w-16 rounded-lg border border-gray-300 px-3 text-center text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <button
              type="button"
              onClick={() => setQuantity((v) => Math.max(1, v - 1))}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 bg-white text-lg leading-none text-gray-600 transition-colors hover:bg-gray-50 active:bg-gray-100"
            >
              −
            </button>
            <button
              type="button"
              onClick={() => setQuantity((v) => v + 1)}
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500 text-lg leading-none text-white transition-colors hover:bg-brand-600 active:bg-brand-700"
            >
              +
            </button>
            {editingLineId && (
              <Button
                type="button"
                size="sm"
                variant="gray"
                onClick={resetLineInputs}
                className="h-10"
              >
                취소
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              onClick={handleAddLine}
              className="h-10"
              disabled={
                !selectedItem ||
                quantity < 1 ||
                (isSelectedMemoRequired && !selectedRuleMemo.trim()) ||
                (customerMode === "adjustment" &&
                  remarkType !== "adjustment_in" &&
                  remarkType !== "adjustment_out")
              }
            >
              {editingLineId ? "수정" : "추가"}
            </Button>
          </div>
        </div>
      </div>

      <div
        className={`h-full space-y-3 border-gray-200 lg:col-start-2 lg:flex lg:flex-col lg:border-l lg:pl-3 ${
          remarkType === "" ? "lg:justify-center" : "lg:justify-start"
        }`}
      >
        <div className="grid grid-cols-6 gap-1.5">
          {visibleRemarkOptions.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="xs"
              variant={remarkType === option.value ? "primary" : "gray"}
              onClick={() => handleRemarkTypeChange(option.value)}
            >
              {option.name}
            </Button>
          ))}
        </div>

        {selectedMemoMessages.length > 0 && (
          <div className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
            {selectedMemoMessages.map((message) => (
              <p key={message}>
                {message}
                {isSelectedMemoRequired && (
                  <span className="ml-1 font-bold text-rose-600">필수</span>
                )}
              </p>
            ))}
          </div>
        )}

        {(remarkType === "custom" || remarkType === "service") && (
          <div>
            <input
              type="text"
              value={customRemark}
              onChange={(e) => setCustomRemark(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder={
                selectedMemoMessages[0]
                  ? selectedMemoMessages[0]
                  : remarkType === "service"
                    ? "특이사항을 입력하세요. (선택)"
                    : "특이사항을 입력하세요."
              }
            />
          </div>
        )}

        {(customerMode === "demo" || customerMode === "adjustment") && (
          <div>
            <input
              type="text"
              value={operationMemo}
              onChange={(event) => setOperationMemo(event.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              placeholder={
                customerMode === "demo"
                  ? "시연용 처리 메모 (선택)"
                  : remarkType === "adjustment_in"
                    ? "재고조정-입고 메모 (선택)"
                    : remarkType === "adjustment_out"
                      ? "재고조정-출고 메모 (선택)"
                      : "처리 메모 (선택)"
              }
            />
          </div>
        )}

        {(remarkType === "exchange_in" || remarkType === "exchange_out") && (
          <input
            type="text"
            value={exchangeMemo}
            onChange={(event) => setExchangeMemo(event.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder={
              selectedMemoMessages[0] ?? "특이사항을 입력하세요. (선택)"
            }
          />
        )}

        {remarkType === "price_adjust" && (
          <div className="grid items-center gap-3 sm:grid-cols-[170px_minmax(0,1fr)]">
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-sm font-medium text-gray-700">
                가격 <span className="text-rose-600">*</span>
              </span>
              <input
                type="text"
                value={priceAdjustAmount}
                onChange={(e) => {
                  const v = e.target.value;
                  if (/^-?[0-9]*$/.test(v)) {
                    setPriceAdjustAmount(v);
                  }
                }}
                inputMode="numeric"
                className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-right text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="금액"
              />
              <span className="text-sm text-gray-600">원</span>
            </div>
            <input
              type="text"
              value={priceAdjustMemo}
              onChange={(e) => setPriceAdjustMemo(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder={selectedMemoMessages[0] ?? "미입력 시 가격 조정"}
            />
          </div>
        )}
      </div>
    </div>
  );

  const itemListLabel = (
    <div className="mb-2 flex items-center gap-3">
      <span className="text-sm font-medium text-gray-700">
        품목 목록 <span className="text-rose-600">*</span>
      </span>
      {draftLines.length > 0 && (
        <span className="text-xs text-gray-500">
          {new Set(draftLines.map((line) => line.itemId)).size}종 · 총{" "}
          {draftLines.reduce((sum, line) => sum + line.quantity, 0)}개
        </span>
      )}
    </div>
  );

  const itemListContent = (
    <>
      {draftLines.length === 0 ? (
        <p className="text-sm text-gray-400">추가된 품목이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full min-w-[820px] table-fixed text-sm">
            <thead className="bg-gray-50 text-xs font-semibold text-gray-600">
              <tr className="border-b border-gray-200">
                <th className="w-[5%] px-2 py-2 text-center">번호</th>
                <th className="w-[29%] px-2 py-2 text-left">품목명</th>
                <th className="w-[11%] px-2 py-2 text-center">품목종류</th>
                <th className="w-[10%] px-2 py-2 text-center">출고 유형</th>
                <th className="w-[7%] px-2 py-2 text-center">수량</th>
                <th className="w-[10%] px-2 py-2 text-right">단가</th>
                <th className="w-[10%] px-2 py-2 text-right">소계</th>
                <th className="w-[18%] px-3 py-2 text-center">작업</th>
              </tr>
            </thead>
            <tbody>
              {draftLines.map((line, index) => (
                <tr
                  ref={setLineRef(line.id)}
                  key={line.id}
                  className="border-b border-gray-200 last:border-b-0"
                >
                  <td className="px-2 py-2">
                    <span className="mx-auto flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-xs font-semibold leading-none text-white">
                      {index + 1}
                    </span>
                  </td>
                  <td className="px-2 py-2 font-medium text-gray-900">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                      <span className="break-words">{line.itemName}</span>
                      {getLineDisplayMemo(line) && (
                        <span className="break-words text-xs font-normal text-gray-500">
                          ({getLineDisplayMemo(line)})
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-center text-xs font-medium text-gray-600">
                    {line.itemCategoryName ?? "미분류"}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ${getShipmentTypeClassName(line)}`}
                    >
                      {getShipmentTypeLabel(line)}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-center font-medium text-gray-800">
                    {line.quantity}개
                  </td>
                  <td className="px-2 py-2 text-right text-gray-700">
                    {formatAmount(
                      typeof line.adjustedUnitPrice === "number"
                        ? line.adjustedUnitPrice
                        : line.unitPrice,
                    )}
                    원
                  </td>
                  <td className="px-2 py-2 text-right font-medium text-gray-900">
                    {formatAmount(line.amount)}원
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        type="button"
                        variant="secondary"
                        size="xs"
                        onClick={() => handleEditLine(line)}
                        aria-label={`${line.lineText} 수정`}
                      >
                        ✏️
                      </Button>
                      <button
                        type="button"
                        onClick={() => moveLine(index, -1)}
                        disabled={index === 0}
                        className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-gray-200 bg-white text-xs font-semibold text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-35"
                        aria-label={`${line.lineText} 위로 이동`}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveLine(index, 1)}
                        disabled={index === draftLines.length - 1}
                        className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-gray-200 bg-white text-xs font-semibold text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-35"
                        aria-label={`${line.lineText} 아래로 이동`}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setDraftLines((prev) =>
                            prev.filter((item) => item.id !== line.id),
                          )
                        }
                        className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-xs font-semibold text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        aria-label={`${line.lineText} 삭제`}
                      >
                        X
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );

  const itemListField = step ? (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      {itemListLabel}
      <div className="min-h-24">{itemListContent}</div>
    </div>
  ) : (
    <div>
      {itemListLabel}
      <div className="min-h-24 rounded-lg bg-gray-50 p-3">
        {itemListContent}
      </div>
    </div>
  );

  const discountField = (
    <div className="h-full rounded-lg border border-gray-200 bg-gray-50 p-3">
      <span className="mb-2 block text-sm font-semibold text-gray-800">
        할인
      </span>
      <div className="grid grid-cols-[minmax(0,1fr)_110px] items-center gap-2">
        <div className="grid grid-cols-3 gap-2">
          {discountOptions.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={discountType === option.value ? "primary" : "gray"}
              className="rounded-lg"
              onClick={() =>
                setDiscountType((current) =>
                  current === option.value ? "" : option.value,
                )
              }
            >
              {option.name}
            </Button>
          ))}
        </div>
        <div>
          <div className="flex items-center gap-1">
            <input
              type="text"
              aria-label="할인 금액"
              value={discountAmount}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "" || /^[0-9]+$/.test(v)) {
                  setDiscountAmount(v === "" ? 0 : Number(v));
                }
              }}
              className="h-11 min-w-0 w-full rounded-lg border border-gray-300 bg-white px-3 text-right text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="0"
            />
            <span className="text-sm text-gray-600">원</span>
          </div>
        </div>
      </div>
    </div>
  );

  const amountField = (
    <div>
      <span className="block text-sm font-medium text-gray-700 mb-2">금액</span>
      <div className="rounded-lg bg-gray-50 px-3 py-3">
        <p className="text-sm font-semibold text-gray-900">
          {finalAmountExpression || "0"} = {formatAmount(finalAmount)}
        </p>
      </div>
    </div>
  );

  const splitPaymentAmountField =
    paymentMode === "split" && splitPayments.length > 0 ? (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
        <span className="mb-2 block text-sm font-medium text-gray-700">
          분할결제 금액 <span className="text-rose-600">*</span>
        </span>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {splitPayments.map((payment) => (
            <div
              key={payment.paymentType}
              className="grid min-w-0 grid-cols-[minmax(64px,0.8fr)_minmax(90px,1.2fr)] gap-1.5"
            >
              <div className="flex h-11 min-w-0 items-center rounded-lg border border-gray-200 bg-white px-3">
                <span className="truncate text-sm font-semibold text-gray-700">
                  {payment.paymentTypeName}
                </span>
              </div>
              <label className="flex h-11 min-w-0 items-center gap-1 rounded-lg border border-gray-200 bg-white px-2">
                <input
                  type="number"
                  min="0"
                  value={payment.amount || ""}
                  onChange={(event) =>
                    setSplitPayments((current) =>
                      current.map((item) =>
                        item.paymentType === payment.paymentType
                          ? {
                              ...item,
                              amount: Math.max(
                                0,
                                Number(event.target.value) || 0,
                              ),
                            }
                          : item,
                      ),
                    )
                  }
                  placeholder="금액"
                  aria-label={`${payment.paymentTypeName} 결제 금액`}
                  className="min-w-0 flex-1 bg-transparent text-right text-sm outline-none placeholder:text-gray-400"
                />
                <span className="shrink-0 text-xs text-gray-500">원</span>
              </label>
            </div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 overflow-hidden rounded-lg border border-gray-200 bg-white sm:grid-cols-4">
          <div className="border-b border-r border-gray-200 px-3 py-2 sm:border-b-0">
            <p className="text-xs text-gray-500">최종 결제금액</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-900">
              {formatAmount(finalAmount)}원
            </p>
          </div>
          <div className="border-b border-gray-200 px-3 py-2 sm:border-b-0 sm:border-r">
            <p className="text-xs text-gray-500">입력 합계</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-900">
              {formatAmount(splitPaymentTotal)}원
            </p>
          </div>
          <div className="border-r border-gray-200 px-3 py-2">
            <p className="text-xs text-gray-500">
              {splitPaymentDifference < 0 ? "초과 금액" : "남은 금액"}
            </p>
            <p
              className={`mt-0.5 text-sm font-semibold ${
                splitPaymentMatches
                  ? "text-emerald-600"
                  : splitPaymentDifference < 0
                    ? "text-rose-600"
                    : "text-gray-900"
              }`}
            >
              {formatAmount(Math.abs(splitPaymentDifference))}원
            </p>
          </div>
          <div
            className={`px-3 py-2 ${
              splitPaymentMatches ? "bg-emerald-50" : "bg-rose-50"
            }`}
          >
            <p className="text-xs text-gray-500">결제금액 확인</p>
            <p
              className={`mt-0.5 text-sm font-bold ${
                splitPaymentMatches ? "text-emerald-700" : "text-rose-700"
              }`}
            >
              {!hasAmountForEverySplitPayment
                ? "미입력된 결제방식을 확인하세요."
                : splitPaymentMatches
                  ? "일치"
                  : "불일치"}
            </p>
          </div>
        </div>
      </div>
    ) : null;

  const extraNoteField = (
    <div className="h-full rounded-lg border border-gray-200 bg-gray-50 p-3">
      <label className="mb-2 block text-sm font-semibold text-gray-800">
        출고 메모
      </label>
      <input
        type="text"
        value={extraNote}
        onChange={(e) => setExtraNote(e.target.value)}
        className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-500"
        placeholder="특이사항을 입력하세요. (선택)"
      />
    </div>
  );

  if (layout === "split") {
    // 스텝 UI 모드: step 값이 있으면 2단 레이아웃 대신 스텝별 필드만 노출.
    // 컴포넌트는 계속 마운트된 채로 CSS로만 보이거나 숨겨지므로, 스텝을 오가도
    // 매장명/결제유형/품목/할인 등 입력 상태가 그대로 유지된다.
    if (step) {
      return (
        <div className="space-y-5">
          <div className={step === 1 ? "space-y-5" : "hidden"}>
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              {stepOneStoreField}
              {isNonSalesSpecialCustomer ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                  <span className="text-sm font-medium text-gray-600">
                    결제 유형
                  </span>
                  <p className="mt-1 font-semibold text-gray-900">
                    특이사항 · 0원 처리
                  </p>
                </div>
              ) : (
                <>
                  {hasConfirmedStore && stepOneDeliveryField}
                  {hasConfirmedStore &&
                    hasConfirmedDeliveryMethod &&
                    hasValidDeliveryInfo &&
                    stepOnePaymentField}
                  {hasConfirmedStore &&
                    hasConfirmedDeliveryMethod &&
                    hasValidDeliveryInfo &&
                    hasValidPayment &&
                    customerMode !== "x" &&
                    stepOneStampField}
                </>
              )}
            </div>
          </div>
          <div className={step === 2 ? "space-y-5" : "hidden"}>
            <div className="min-w-0">{itemSelectionField}</div>
            <div className="min-w-0">{itemListField}</div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3 lg:items-stretch">
              {!isNonSalesSpecialCustomer && (
                <div className="min-w-0">{discountField}</div>
              )}
              {!isNonSalesSpecialCustomer && (
                <div className="min-w-0">{reservationSlot}</div>
              )}
              <div className="min-w-0">{extraNoteField}</div>
            </div>
            {splitPaymentAmountField}
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-5">
        <div className="lg:sticky lg:top-0 lg:z-10 lg:bg-white lg:pb-4 lg:border-b lg:border-gray-100">
          <div className="grid grid-cols-1 gap-x-8 gap-y-5 lg:grid-cols-2 lg:items-stretch">
            <div className="min-w-0">{leftPanelExtra}</div>
            <div className="min-w-0">{itemSelectionField}</div>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-x-8 gap-y-5 lg:grid-cols-2 lg:items-start">
          <div className="min-w-0 space-y-5">
            {storeField}
            {paymentField}
            {stampCountField}
            {discountField}
          </div>
          <div className="min-w-0 space-y-5">
            {itemListField}
            {amountField}
            {extraNoteField}
            {rightPanelExtra}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {leftPanelExtra}
      {storeField}
      {paymentField}
      {stampCountField}
      {itemSelectionField}
      {itemListField}
      {discountField}
      {amountField}
      {extraNoteField}
      {rightPanelExtra}
    </div>
  );
}
