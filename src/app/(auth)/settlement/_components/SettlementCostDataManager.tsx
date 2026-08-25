"use client";

import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import Button from "@/app/_components/Button";
import Loading from "@/app/_components/Loading";
import {
  deleteSettlementHistoricalPurchase,
  getHistoricalPurchaseSuppliers,
  getSettlementCostItems,
  getSettlementHistoricalPurchases,
  saveSettlementHistoricalPurchase,
  saveSettlementHistoricalPurchasesBulk,
  saveSettlementUnifiedItemCostsBulk,
  saveSettlementItemCost,
} from "@/app/_domains/_settlement/_services/settlementService";
import {
  SettlementCostBasisType,
  SettlementCostSegment,
  SettlementHistoricalPurchase,
  SettlementSoldItem,
} from "@/app/_domains/_settlement/_types/settlement.types";

const fieldClass =
  "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-900 shadow-sm outline-none transition placeholder:font-normal placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
const storeOptions = [
  { value: "ovape", label: "오베이프" },
  { value: "eguvape", label: "이구베이프" },
  { value: "other", label: "그 외" },
] as const;
const invoiceOptions = [
  { value: "tax_invoice", label: "세금계산서" },
  { value: "cash_receipt", label: "현금영수증" },
  { value: "x", label: "X" },
] as const;

type BulkPurchaseRow = {
  orderDate: string;
  store: "ovape" | "eguvape" | "other";
  invoiceType: "tax_invoice" | "cash_receipt" | "x";
  supplierId: string;
  supplierName: string;
  totalAmount: number;
  purchaseAmount: number;
  supplierDiscount: number;
  wholesaleShippingFee: number;
  pointsUsed: number;
  paidAmount: number;
  note: string;
  sourceRows: number;
};

const normalizeHeader = (value: string) => value.replaceAll(/\s/g, "").trim();
const parseExcelDate = (value: string) => {
  const normalized = value.trim();
  const korean = normalized.match(/^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
  const plain = normalized.match(/^(\d{4})[-./]\s*(\d{1,2})[-./]\s*(\d{1,2})/);
  const match = korean ?? plain;
  if (!match) return "";
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
};

const parseBulkPurchases = (
  text: string,
  suppliers: { id: string; name: string }[],
) => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.split("\t"))
    .filter((columns) => columns.some((value) => value.trim()));
  if (lines.length < 2)
    return { rows: [] as BulkPurchaseRow[], errors: [] as string[] };
  const headers = lines[0].map(normalizeHeader);
  const indexOf = (...names: string[]) =>
    headers.findIndex((header) =>
      names.some(
        (name) =>
          header === name ||
          header.startsWith(name) ||
          header.replaceAll(/[^가-힣a-zA-Z0-9]/g, "") === name,
      ),
    );
  const indexes = {
    supplier: indexOf("도매처", "거래처"),
    date: indexOf("주문날짜"),
    kind: indexOf("종류", "제품명"),
    amount: indexOf("금액", "총매입", "총매입가", "총매입액", "매입금액"),
    issuance: indexOf("발행종류"),
  };
  const missingHeaders = [
    [indexes.supplier, "도매처"],
    [indexes.date, "주문날짜"],
    [indexes.kind, "종류"],
    [indexes.amount, "금액"],
    [indexes.issuance, "발행 종류"],
  ].filter(([index]) => index === -1);
  if (missingHeaders.length)
    return {
      rows: [] as BulkPurchaseRow[],
      errors: [
        `필수 열이 없습니다: ${missingHeaders.map(([, label]) => label).join(", ")}`,
      ],
    };

  const supplierMap = new Map(
    suppliers.map((supplier) => [
      supplier.name.trim().toLocaleLowerCase("ko-KR"),
      supplier,
    ]),
  );
  const grouped = new Map<string, BulkPurchaseRow>();
  const errors: string[] = [];
  lines.slice(1).forEach((columns, rowIndex) => {
    const rowNumber = rowIndex + 2;
    const supplierName = (columns[indexes.supplier] ?? "").trim();
    const supplier = supplierMap.get(supplierName.toLocaleLowerCase("ko-KR"));
    const orderDate = parseExcelDate(columns[indexes.date] ?? "");
    const issuanceValue = (columns[indexes.issuance] ?? "")
      .replaceAll(/\s/g, "")
      .toLocaleLowerCase("ko-KR");
    const issuance =
      issuanceValue === "오베이프세금계산서"
        ? ({ store: "ovape", invoiceType: "tax_invoice" } as const)
        : issuanceValue === "오베이프현금영수증"
          ? ({ store: "ovape", invoiceType: "cash_receipt" } as const)
          : issuanceValue === "이구베이프세금계산서"
            ? ({ store: "eguvape", invoiceType: "tax_invoice" } as const)
            : issuanceValue === "이구베이프현금영수증"
              ? ({ store: "eguvape", invoiceType: "cash_receipt" } as const)
              : issuanceValue === "x"
                ? ({ store: "other", invoiceType: "x" } as const)
                : null;
    const kind = (columns[indexes.kind] ?? "").replaceAll(/\s/g, "");
    const amount = Number(
      (columns[indexes.amount] ?? "").replaceAll(/[,원\s]/g, ""),
    );
    const allowedKinds = ["매입", "도매처할인", "도매택배비", "적립금사용"];
    const rowErrors = [
      !supplier ? `등록되지 않은 거래처: ${supplierName || "빈 값"}` : "",
      !orderDate || orderDate < "2026-01-01" || orderDate > "2026-07-21"
        ? "주문날짜 오류"
        : "",
      !allowedKinds.includes(kind) ? `종류 오류: ${kind || "빈 값"}` : "",
      !issuance
        ? `발행 종류 오류: ${columns[indexes.issuance] || "빈 값"}`
        : "",
      !Number.isFinite(amount) ? "금액 오류" : "",
    ].filter(Boolean);
    if (rowErrors.length) {
      errors.push(`${rowNumber}행: ${rowErrors.join(", ")}`);
      return;
    }
    const key = [
      supplier!.id,
      orderDate,
      issuance!.store,
      issuance!.invoiceType,
    ].join("|");
    const current = grouped.get(key);
    if (current) {
      current.sourceRows += 1;
    } else {
      grouped.set(key, {
        orderDate,
        store: issuance!.store,
        invoiceType: issuance!.invoiceType,
        supplierId: supplier!.id,
        supplierName: supplier!.name,
        totalAmount: 0,
        purchaseAmount: 0,
        supplierDiscount: 0,
        wholesaleShippingFee: 0,
        pointsUsed: 0,
        paidAmount: 0,
        note: "",
        sourceRows: 1,
      });
    }
    const target = grouped.get(key)!;
    const normalizedAmount = Math.abs(Math.floor(amount));
    if (kind === "매입") target.purchaseAmount += normalizedAmount;
    else if (kind === "도매처할인") target.supplierDiscount += normalizedAmount;
    else if (kind === "도매택배비")
      target.wholesaleShippingFee += normalizedAmount;
    else if (kind === "적립금사용") target.pointsUsed += normalizedAmount;
    target.totalAmount =
      target.purchaseAmount -
      target.supplierDiscount +
      target.wholesaleShippingFee;
    target.paidAmount = target.totalAmount - target.pointsUsed;
  });
  for (const row of grouped.values()) {
    if (row.totalAmount < 0 || row.paidAmount < 0)
      errors.push(
        `${row.orderDate} ${row.supplierName}: 할인 또는 적립금이 매입액보다 큽니다.`,
      );
  }
  return { rows: [...grouped.values()], errors };
};

type HistoricalCostBulkRow = {
  itemId: number | null;
  itemName: string;
  totalQuantity: number;
  soldQuantity: number;
  openingQuantity: number;
  segments: { quantity: number; unitCost: number }[];
};

const parseHistoricalCostPaste = (
  text: string,
  items: SettlementSoldItem[],
) => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.split("\t"))
    .filter((columns) => columns.some((value) => value.trim()));
  if (lines.length < 2)
    return { rows: [] as HistoricalCostBulkRow[], errors: [] as string[] };
  const headers = lines[0].map(normalizeHeader);
  const itemNameIndex = headers.findIndex((header) => header === "품목명");
  const quantityIndex = headers.findIndex((header) =>
    ["구간수량", "수량입력"].includes(header),
  );
  const unitCostIndex = headers.findIndex((header) =>
    ["개당원가", "원가입력"].includes(header),
  );
  if ([itemNameIndex, quantityIndex, unitCostIndex].some((index) => index < 0))
    return {
      rows: [] as HistoricalCostBulkRow[],
      errors: ["필수 열이 없습니다: 품목명, 수량 입력, 원가 입력"],
    };
  const itemMap = new Map(
    items
      .filter((item) => item.soldBeforeBaseline > 0 || item.openingQuantity > 0)
      .map((item) => [item.itemName, item]),
  );
  const grouped = new Map<string, HistoricalCostBulkRow>();
  const errors: string[] = [];
  let previousItemName = "";
  lines.slice(1).forEach((columns, rowIndex) => {
    const rowNumber = rowIndex + 2;
    const enteredItemName = (columns[itemNameIndex] ?? "").trim();
    const itemName = enteredItemName || previousItemName;
    if (enteredItemName) previousItemName = enteredItemName;
    const item = itemMap.get(itemName);
    const quantity = Number(
      (columns[quantityIndex] ?? "").replaceAll(/[,개\s]/g, ""),
    );
    const unitCost = Number(
      (columns[unitCostIndex] ?? "").replaceAll(/[,원\s]/g, ""),
    );
    const rowErrors = [
      !item ? `판매 품목을 찾을 수 없음: ${itemName || "빈 값"}` : "",
      !Number.isInteger(quantity) || quantity <= 0 ? "구간수량 오류" : "",
      !Number.isInteger(unitCost) || unitCost < 0 ? "개당원가 오류" : "",
    ].filter(Boolean);
    if (rowErrors.length) {
      errors.push(`${rowNumber}행: ${rowErrors.join(", ")}`);
      return;
    }
    const current = grouped.get(itemName) ?? {
      itemId: item!.itemId,
      itemName,
      totalQuantity: item!.soldBeforeBaseline + item!.openingQuantity,
      soldQuantity: item!.soldBeforeBaseline,
      openingQuantity: item!.openingQuantity,
      segments: [],
    };
    current.segments.push({ quantity, unitCost });
    grouped.set(itemName, current);
  });
  for (const row of grouped.values()) {
    const entered = row.segments.reduce(
      (sum, segment) => sum + segment.quantity,
      0,
    );
    if (entered !== row.totalQuantity)
      errors.push(
        `${row.itemName}: 구간수량 합계 ${entered}개 / 판매수량 ${row.totalQuantity}개`,
      );
  }
  return { rows: [...grouped.values()], errors };
};

export default function SettlementCostDataManager() {
  const queryClient = useQueryClient();
  const [section, setSection] = useState<"purchases" | "costs">("purchases");
  const [editingId, setEditingId] = useState("");
  const [orderDate, setOrderDate] = useState("2026-06-01");
  const [store, setStore] = useState<"ovape" | "eguvape" | "other">("ovape");
  const [invoiceType, setInvoiceType] = useState<
    "tax_invoice" | "cash_receipt" | "x"
  >("tax_invoice");
  const [supplierId, setSupplierId] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false);
  const [totalAmount, setTotalAmount] = useState("");
  const [supplierDiscount, setSupplierDiscount] = useState("");
  const [wholesaleShippingFee, setWholesaleShippingFee] = useState("");
  const [pointsUsed, setPointsUsed] = useState("");
  const [note, setNote] = useState("");
  const [bulkPasteOpen, setBulkPasteOpen] = useState(false);
  const [bulkPasteText, setBulkPasteText] = useState("");
  const [costMode, setCostMode] =
    useState<SettlementCostBasisType>("historical");
  const [costDrafts, setCostDrafts] = useState<
    Record<string, { quantity: string; unitCost: string }[]>
  >({});
  const [costExcelOpen, setCostExcelOpen] = useState(false);
  const [costExcelPaste, setCostExcelPaste] = useState("");
  const [search, setSearch] = useState("");
  const [visibleCostCount, setVisibleCostCount] = useState(100);
  const purchasesKey = ["settlement-historical-purchases"];
  const costsKey = ["settlement-cost-items"];
  const suppliersQuery = useQuery({
    queryKey: ["settlement-purchase-suppliers"],
    queryFn: getHistoricalPurchaseSuppliers,
  });
  const purchasesQuery = useQuery({
    queryKey: purchasesKey,
    queryFn: getSettlementHistoricalPurchases,
  });
  const costsQuery = useQuery({
    queryKey: costsKey,
    queryFn: getSettlementCostItems,
  });
  const historicalCostPreview = useMemo(
    () => parseHistoricalCostPaste(costExcelPaste, costsQuery.data ?? []),
    [costExcelPaste, costsQuery.data],
  );
  const selectedSupplier = suppliersQuery.data?.find(
    (supplier) => supplier.id === supplierId,
  );
  const filteredSuppliers = useMemo(() => {
    const keyword = supplierSearch.trim().toLocaleLowerCase("ko-KR");
    return (suppliersQuery.data ?? []).filter(
      (supplier) =>
        !keyword || supplier.name.toLocaleLowerCase("ko-KR").includes(keyword),
    );
  }, [supplierSearch, suppliersQuery.data]);
  const bulkPreview = useMemo(
    () => parseBulkPurchases(bulkPasteText, suppliersQuery.data ?? []),
    [bulkPasteText, suppliersQuery.data],
  );
  const savePurchaseMutation = useMutation({
    mutationFn: saveSettlementHistoricalPurchase,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: purchasesKey }),
        queryClient.invalidateQueries({ queryKey: ["settlement-summary"] }),
      ]);
      resetPurchase();
      toast.success(
        editingId
          ? "과거 매입액이 수정되었습니다."
          : "과거 매입액이 추가되었습니다.",
      );
    },
    onError: () => toast.error("과거 매입액 저장에 실패했습니다."),
  });
  const deletePurchaseMutation = useMutation({
    mutationFn: deleteSettlementHistoricalPurchase,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: purchasesKey }),
        queryClient.invalidateQueries({ queryKey: ["settlement-summary"] }),
      ]);
      toast.success("과거 매입액이 삭제되었습니다.");
    },
    onError: () => toast.error("삭제에 실패했습니다."),
  });
  const bulkPurchaseMutation = useMutation({
    mutationFn: saveSettlementHistoricalPurchasesBulk,
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: purchasesKey }),
        queryClient.invalidateQueries({ queryKey: ["settlement-summary"] }),
      ]);
      setBulkPasteText("");
      setBulkPasteOpen(false);
      toast.success(`${variables.length}건의 과거 매입액을 추가했습니다.`);
    },
    onError: () => toast.error("엑셀 매입액 저장에 실패했습니다."),
  });
  const saveCostMutation = useMutation({
    mutationFn: saveSettlementItemCost,
    onSuccess: async (_data, variables) => {
      setCostDrafts((current) => {
        const next = { ...current };
        delete next[`${variables.itemName}:${variables.basisType}`];
        return next;
      });
      await queryClient.invalidateQueries({ queryKey: costsKey });
      toast.success("품목 원가가 저장되었습니다.");
    },
    onError: () => toast.error("품목 원가 저장에 실패했습니다."),
  });
  const bulkCostMutation = useMutation({
    mutationFn: saveSettlementUnifiedItemCostsBulk,
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: costsKey });
      setCostExcelPaste("");
      setCostExcelOpen(false);
      toast.success(
        `${variables.length}개 품목의 판매·기초재고 원가를 저장했습니다.`,
      );
    },
    onError: () => toast.error("과거원가 일괄 저장에 실패했습니다."),
  });
  const resetPurchase = () => {
    setEditingId("");
    setTotalAmount("");
    setSupplierDiscount("");
    setWholesaleShippingFee("");
    setPointsUsed("");
    setNote("");
  };
  const submitPurchase = (event: FormEvent) => {
    event.preventDefault();
    const purchaseAmount = Number(totalAmount);
    const discount = Number(supplierDiscount || 0);
    const shippingFee = Number(wholesaleShippingFee || 0);
    const usedPoints = Number(pointsUsed || 0);
    const confirmedAmount = purchaseAmount - discount + shippingFee;
    const paidAmount = confirmedAmount - usedPoints;
    if (
      !supplierId ||
      [purchaseAmount, discount, shippingFee, usedPoints].some(
        (value) => !Number.isFinite(value) || value < 0,
      ) ||
      confirmedAmount < 0 ||
      paidAmount < 0
    )
      return toast.error(
        "거래처와 매입·할인·택배비·적립금 금액을 확인해 주세요.",
      );
    savePurchaseMutation.mutate({
      id: editingId || undefined,
      orderDate,
      store,
      invoiceType,
      supplierId,
      totalAmount: Math.floor(confirmedAmount),
      purchaseAmount: Math.floor(purchaseAmount),
      supplierDiscount: Math.floor(discount),
      wholesaleShippingFee: Math.floor(shippingFee),
      pointsUsed: Math.floor(usedPoints),
      paidAmount: Math.floor(paidAmount),
      note,
    });
  };
  const editPurchase = (purchase: SettlementHistoricalPurchase) => {
    setEditingId(purchase.id);
    setOrderDate(purchase.order_date);
    setStore(purchase.store);
    setInvoiceType(purchase.invoice_type);
    setSupplierId(purchase.supplier_id);
    setSupplierSearch(purchase.inventory_suppliers?.name ?? "");
    setTotalAmount(String(purchase.purchase_amount));
    setSupplierDiscount(String(purchase.supplier_discount));
    setWholesaleShippingFee(String(purchase.wholesale_shipping_fee));
    setPointsUsed(String(purchase.points_used));
    setNote(purchase.note ?? "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const filteredCosts = useMemo(
    () =>
      (costsQuery.data ?? []).filter(
        (item) =>
          item.itemName.toLowerCase().includes(search.toLowerCase()) &&
          (costMode === "historical"
            ? item.soldBeforeBaseline > 0
            : item.openingQuantity > 0),
      ),
    [costMode, costsQuery.data, search],
  );
  const getDraft = (
    key: string,
    totalQuantity: number,
    stored: SettlementCostSegment[],
  ) =>
    costDrafts[key] ??
    (stored.length
      ? stored.map((segment) => ({
          quantity: String(segment.quantity),
          unitCost: String(segment.unitCost),
        }))
      : [{ quantity: String(totalQuantity), unitCost: "" }]);
  const updateDraft = (
    key: string,
    segments: { quantity: string; unitCost: string }[],
  ) => setCostDrafts((current) => ({ ...current, [key]: segments }));
  const downloadHistoricalCostExcel = async () => {
    const items = (costsQuery.data ?? []).filter(
      (item) => item.soldBeforeBaseline > 0 || item.openingQuantity > 0,
    );
    if (!items.length)
      return toast.error("내려받을 통합 원가 품목이 없습니다.");
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "OVAPE 정산";
    const worksheet = workbook.addWorksheet("판매-기초재고 통합원가", {
      views: [{ state: "frozen", xSplit: 1, ySplit: 1 }],
    });
    worksheet.columns = [
      { header: "품목명", key: "itemName", width: 38 },
      { header: "판매수량", key: "soldQuantity", width: 13 },
      { header: "기초재고", key: "openingQuantity", width: 13 },
      { header: "합계", key: "totalQuantity", width: 11 },
      { header: "원가순서", key: "order", width: 12 },
      { header: "수량 입력", key: "quantity", width: 14 },
      { header: "원가 입력", key: "unitCost", width: 16 },
    ];
    for (const [itemIndex, item] of items.entries()) {
      const hasHistorical = item.historicalSegments.length > 0;
      const hasOpening = item.openingSegments.length > 0;
      const totalQuantity = item.soldBeforeBaseline + item.openingQuantity;
      const segments =
        hasHistorical || hasOpening
          ? [
              ...item.historicalSegments,
              ...(!hasHistorical && item.soldBeforeBaseline > 0
                ? [
                    {
                      quantity: item.soldBeforeBaseline,
                      unitCost: null,
                      sortOrder: 0,
                    },
                  ]
                : []),
              ...item.openingSegments,
              ...(!hasOpening && item.openingQuantity > 0
                ? [
                    {
                      quantity: item.openingQuantity,
                      unitCost: null,
                      sortOrder: 0,
                    },
                  ]
                : []),
            ]
          : [{ quantity: totalQuantity, unitCost: null, sortOrder: 0 }];
      segments.forEach((segment, index) => {
        const row = worksheet.addRow({
          itemName: index === 0 ? item.itemName : "",
          soldQuantity: index === 0 ? item.soldBeforeBaseline : "",
          openingQuantity: index === 0 ? item.openingQuantity : "",
          totalQuantity: index === 0 ? totalQuantity : "",
          order: index + 1,
          quantity: segment.quantity,
          unitCost: segment.unitCost ?? "",
        });
        row.height = 22;
        const groupFill = itemIndex % 2 === 0 ? "FFF8FAFC" : "FFFFFFFF";
        for (let column = 1; column <= 5; column += 1)
          row.getCell(column).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: groupFill },
          };
        for (let column = 6; column <= 7; column += 1)
          row.getCell(column).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFFF2CC" },
          };
        if (index === 0) {
          row.eachCell((cell) => {
            cell.border = {
              top: { style: "medium", color: { argb: "FFCBD5E1" } },
            };
          });
          row.getCell(1).font = { bold: true };
        }
        row.getCell(6).dataValidation = {
          type: "whole",
          operator: "greaterThanOrEqual",
          allowBlank: false,
          formulae: [1],
          showErrorMessage: true,
          errorTitle: "수량 확인",
          error: "1개 이상의 정수를 입력하세요.",
        };
        row.getCell(7).dataValidation = {
          type: "whole",
          operator: "greaterThanOrEqual",
          allowBlank: true,
          formulae: [0],
          showErrorMessage: true,
          errorTitle: "원가 확인",
          error: "0원 이상의 정수를 입력하세요.",
        };
      });
    }
    worksheet.autoFilter = { from: "A1", to: "G1" };
    worksheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF43F75" },
      };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });
    worksheet.getRow(1).height = 26;
    worksheet.getColumn("itemName").alignment = { vertical: "middle" };
    worksheet.getColumn("soldQuantity").numFmt = "#,##0";
    worksheet.getColumn("openingQuantity").numFmt = "#,##0";
    worksheet.getColumn("totalQuantity").numFmt = "#,##0";
    worksheet.getColumn("order").numFmt = "0";
    worksheet.getColumn("quantity").numFmt = "#,##0";
    worksheet.getColumn("unitCost").numFmt = "#,##0";
    const guide = workbook.addWorksheet("사용방법");
    guide.columns = [{ width: 95 }];
    [
      "통합 원가 입력 방법",
      "1. 노란색 '수량 입력'과 '원가 입력' 칸만 작성합니다.",
      "2. 원가가 하나면 한 줄만 사용합니다.",
      "3. 같은 품목의 원가가 여러 개면 바로 아래에 행을 추가하고 수량·원가를 입력합니다.",
      "4. 같은 품목은 위 행의 원가부터 먼저 판매됩니다.",
      "5. 수량 입력 합계는 판매수량 + 기초재고 합계와 같아야 합니다.",
      "6. 작성 후 헤더를 포함한 범위를 복사해 정산 화면의 '작성 엑셀 붙여넣기'에 붙여넣습니다.",
    ].forEach((text, index) => {
      const row = guide.addRow([text]);
      row.height = index === 0 ? 28 : 24;
      if (index === 0) {
        row.getCell(1).font = {
          bold: true,
          size: 14,
          color: { argb: "FFFFFFFF" },
        };
        row.getCell(1).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF43F75" },
        };
      }
    });
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([new Uint8Array(buffer as ArrayBuffer)], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "2026-06-01_2026-07-22_판매분-기초재고_통합원가.xlsx";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <h1 className="text-lg font-bold text-gray-900">원가·과거자료 관리</h1>
        <p className="mt-1 text-sm text-gray-500">
          재고관리 시작 전 매입 총액과 실제 판매품목의 기준원가를 관리합니다.
        </p>
        <div className="mt-4 flex gap-2">
          {(
            [
              ["purchases", "과거 매입액"],
              ["costs", "판매품목 기준원가"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setSection(value)}
              className={`cursor-pointer rounded-lg border px-4 py-2 text-sm font-semibold ${section === value ? "border-brand-500 bg-brand-500 text-white" : "border-gray-300 bg-white text-gray-600"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>
      {section === "purchases" ? (
        <>
          <section className="rounded-xl border border-gray-200 bg-gray-50/70 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-gray-900">
                  엑셀 일괄등록
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  엑셀의 헤더를 포함해 복사한 뒤 붙여넣으세요. 같은
                  거래처·날짜·발행 종류는 한 건으로 묶입니다.
                </p>
              </div>
              <Button
                type="button"
                variant="gray"
                onClick={() => setBulkPasteOpen((open) => !open)}
              >
                {bulkPasteOpen ? "붙여넣기 닫기" : "엑셀 붙여넣기"}
              </Button>
            </div>
            {bulkPasteOpen && (
              <div className="mt-3 space-y-3 border-t border-gray-200 pt-3">
                <p className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs leading-5 text-gray-600">
                  필수 열: <strong>거래처(또는 도매처)</strong>, <strong>주문날짜</strong>,{" "}
                  <strong>종류(또는 제품명)</strong>, <strong>금액(또는 총 매입)</strong>,{" "}
                  <strong>발행 종류</strong>
                  <br />
                  종류 값: 매입/도매처할인/도매택배비/적립금사용 · 발행 종류 값:
                  오베이프 세금계산서/오베이프 현금영수증/이구베이프
                  세금계산서/이구베이프 현금영수증/X
                </p>
                <textarea
                  value={bulkPasteText}
                  onChange={(event) => setBulkPasteText(event.target.value)}
                  placeholder="엑셀에서 헤더와 데이터 행을 복사해 여기에 붙여넣으세요."
                  className="min-h-36 w-full resize-y rounded-lg border border-gray-300 bg-white p-3 font-mono text-xs text-gray-900 shadow-sm outline-none transition placeholder:font-sans placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
                {bulkPreview.errors.length > 0 && (
                  <div className="max-h-36 overflow-y-auto rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {bulkPreview.errors.map((error, index) => (
                      <p key={`${error}-${index}`}>{error}</p>
                    ))}
                  </div>
                )}
                {bulkPreview.rows.length > 0 && (
                  <>
                    <p className="text-xs text-gray-600">
                      등록 예정{" "}
                      <strong className="text-brand-600">
                        {bulkPreview.rows.length}
                      </strong>
                      건 · 합계{" "}
                      <strong>
                        {bulkPreview.rows
                          .reduce((sum, row) => sum + row.totalAmount, 0)
                          .toLocaleString("ko-KR")}
                        원
                      </strong>
                    </p>
                    <div className="max-h-64 overflow-auto rounded-lg border border-gray-200 bg-white">
                      <table className="w-full min-w-[1200px] text-xs">
                        <thead className="sticky top-0 bg-gray-50 text-left text-gray-600">
                          <tr>
                            <th className="px-3 py-2">주문날짜</th>
                            <th className="px-3 py-2">거래처</th>
                            <th className="px-3 py-2">매장</th>
                            <th className="px-3 py-2">계산서</th>
                            <th className="px-3 py-2 text-right">매입</th>
                            <th className="px-3 py-2 text-right">할인</th>
                            <th className="px-3 py-2 text-right">택배비</th>
                            <th className="px-3 py-2 text-right">적립금</th>
                            <th className="px-3 py-2 text-right">
                              매입 확정액
                            </th>
                            <th className="px-3 py-2 text-right">
                              실제 지급액
                            </th>
                            <th className="px-3 py-2 text-right">원본 행</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {bulkPreview.rows.map((row, index) => (
                            <tr
                              key={`${row.supplierId}-${row.orderDate}-${index}`}
                            >
                              <td className="px-3 py-2">{row.orderDate}</td>
                              <td className="px-3 py-2 font-semibold">
                                {row.supplierName}
                              </td>
                              <td className="px-3 py-2">
                                {row.store === "ovape"
                                  ? "오베이프"
                                  : row.store === "eguvape"
                                    ? "이구베이프"
                                    : "그 외"}
                              </td>
                              <td className="px-3 py-2">
                                {
                                  invoiceOptions.find(
                                    (option) =>
                                      option.value === row.invoiceType,
                                  )?.label
                                }
                              </td>
                              <td className="px-3 py-2 text-right">
                                {row.purchaseAmount.toLocaleString("ko-KR")}
                              </td>
                              <td className="px-3 py-2 text-right text-blue-600">
                                -{row.supplierDiscount.toLocaleString("ko-KR")}
                              </td>
                              <td className="px-3 py-2 text-right">
                                +
                                {row.wholesaleShippingFee.toLocaleString(
                                  "ko-KR",
                                )}
                              </td>
                              <td className="px-3 py-2 text-right text-violet-600">
                                -{row.pointsUsed.toLocaleString("ko-KR")}
                              </td>
                              <td className="px-3 py-2 text-right font-semibold">
                                {row.totalAmount.toLocaleString("ko-KR")}원
                              </td>
                              <td className="px-3 py-2 text-right font-semibold text-brand-600">
                                {row.paidAmount.toLocaleString("ko-KR")}원
                              </td>
                              <td className="px-3 py-2 text-right">
                                {row.sourceRows}행
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="gray"
                    onClick={() => setBulkPasteText("")}
                  >
                    초기화
                  </Button>
                  <Button
                    type="button"
                    disabled={
                      !bulkPreview.rows.length ||
                      bulkPreview.errors.length > 0 ||
                      bulkPurchaseMutation.isPending
                    }
                    onClick={() =>
                      bulkPurchaseMutation.mutate(
                        bulkPreview.rows.map((row) => ({
                          orderDate: row.orderDate,
                          store: row.store,
                          invoiceType: row.invoiceType,
                          supplierId: row.supplierId,
                          totalAmount: row.totalAmount,
                          purchaseAmount: row.purchaseAmount,
                          supplierDiscount: row.supplierDiscount,
                          wholesaleShippingFee: row.wholesaleShippingFee,
                          pointsUsed: row.pointsUsed,
                          paidAmount: row.paidAmount,
                          note: row.note,
                        })),
                      )
                    }
                  >
                    {bulkPurchaseMutation.isPending
                      ? "등록 중..."
                      : `${bulkPreview.rows.length}건 일괄등록`}
                  </Button>
                </div>
              </div>
            )}
          </section>
          <form
            onSubmit={submitPurchase}
            className="grid gap-3 rounded-xl border border-gray-200 bg-gray-50/70 p-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            <Field label="주문날짜">
              <input
                type="date"
                max="2026-07-21"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                className={fieldClass}
              />
            </Field>
            <Field label="매장선택">
              <Choice
                options={storeOptions}
                value={store}
                onChange={(value) => setStore(value as typeof store)}
              />
            </Field>
            <Field label="계산서 종류">
              <Choice
                options={invoiceOptions}
                value={invoiceType}
                onChange={(value) =>
                  setInvoiceType(value as typeof invoiceType)
                }
              />
            </Field>
            <Field label="거래처선택">
              <div className="relative">
                <svg
                  className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-gray-500"
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
                  onFocus={() => setSupplierPickerOpen(true)}
                  onBlur={() => setSupplierPickerOpen(false)}
                  onChange={(e) => {
                    setSupplierSearch(e.target.value);
                    setSupplierId("");
                    setSupplierPickerOpen(true);
                  }}
                  placeholder="거래처명 검색"
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-10 text-sm font-medium text-gray-900 shadow-sm outline-none transition placeholder:font-normal placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
                {supplierSearch && (
                  <button
                    type="button"
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setSupplierSearch("");
                      setSupplierId("");
                      setSupplierPickerOpen(true);
                    }}
                    aria-label="거래처 검색어 지우기"
                    className="absolute right-2 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"
                  >
                    ×
                  </button>
                )}
                {supplierPickerOpen && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-xl">
                    {filteredSuppliers.length ? (
                      filteredSuppliers.map((supplier) => (
                        <button
                          type="button"
                          key={supplier.id}
                          onPointerDown={(e) => {
                            e.preventDefault();
                            setSupplierId(supplier.id);
                            setSupplierSearch(supplier.name);
                            setSupplierPickerOpen(false);
                          }}
                          className={`flex min-h-10 w-full cursor-pointer items-center rounded-lg px-3 text-left text-sm ${supplier.id === supplierId ? "bg-brand-50 font-semibold text-brand-700" : "text-gray-700 hover:bg-gray-50"}`}
                        >
                          {supplier.name}
                          {supplier.id === supplierId && (
                            <span className="ml-auto text-brand-600">✓</span>
                          )}
                        </button>
                      ))
                    ) : (
                      <p className="px-3 py-4 text-center text-xs text-gray-500">
                        일치하는 거래처가 없습니다.
                      </p>
                    )}
                  </div>
                )}
              </div>
              {supplierId && (
                <span className="mt-1 text-xs text-emerald-600">
                  {selectedSupplier?.name} 선택됨
                </span>
              )}
            </Field>
            <Field label="매입">
              <input
                type="number"
                min="0"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                placeholder="매입 금액"
                className={fieldClass}
              />
            </Field>
            <Field label="도매처 할인">
              <input
                type="number"
                min="0"
                value={supplierDiscount}
                onChange={(e) => setSupplierDiscount(e.target.value)}
                placeholder="0"
                className={fieldClass}
              />
            </Field>
            <Field label="도매택배비">
              <input
                type="number"
                min="0"
                value={wholesaleShippingFee}
                onChange={(e) => setWholesaleShippingFee(e.target.value)}
                placeholder="0"
                className={fieldClass}
              />
            </Field>
            <Field label="적립금 사용">
              <input
                type="number"
                min="0"
                value={pointsUsed}
                onChange={(e) => setPointsUsed(e.target.value)}
                placeholder="0"
                className={fieldClass}
              />
            </Field>
            <Field label="메모">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="선택 입력"
                className={fieldClass}
              />
            </Field>
            <div className="flex justify-end gap-2 sm:col-span-2 lg:col-span-3">
              {editingId && (
                <Button type="button" variant="gray" onClick={resetPurchase}>
                  수정 취소
                </Button>
              )}
              <Button type="submit">
                {editingId ? "수정 저장" : "매입액 추가"}
              </Button>
            </div>
          </form>
          <p className="text-xs text-gray-600 sm:text-sm">
            <span className="font-semibold text-brand-600">
              {purchasesQuery.data?.length ?? 0}
            </span>
            건
          </p>
          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            {purchasesQuery.isPending ? (
              <Loading size="sm" />
            ) : purchasesQuery.data?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1250px] text-sm">
                  <thead className="bg-gray-50/70 text-left text-xs text-gray-600">
                    <tr>
                      <th className="px-4 py-3">주문날짜</th>
                      <th className="px-4 py-3">매장</th>
                      <th className="px-4 py-3">계산서</th>
                      <th className="px-4 py-3">거래처</th>
                      <th className="px-4 py-3 text-right">매입</th>
                      <th className="px-4 py-3 text-right">할인</th>
                      <th className="px-4 py-3 text-right">택배비</th>
                      <th className="px-4 py-3 text-right">적립금</th>
                      <th className="px-4 py-3 text-right">매입 확정액</th>
                      <th className="px-4 py-3 text-right">실제 지급액</th>
                      <th className="px-4 py-3">메모</th>
                      <th className="px-4 py-3 text-center">관리</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {purchasesQuery.data.map((p) => (
                      <tr key={p.id}>
                        <td className="px-4 py-3">{p.order_date}</td>
                        <td className="px-4 py-3">
                          {p.store === "ovape"
                            ? "오베이프"
                            : p.store === "eguvape"
                              ? "이구베이프"
                              : "그 외"}
                        </td>
                        <td className="px-4 py-3">
                          {
                            invoiceOptions.find(
                              (o) => o.value === p.invoice_type,
                            )?.label
                          }
                        </td>
                        <td className="px-4 py-3 font-semibold">
                          {p.inventory_suppliers?.name}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {p.purchase_amount.toLocaleString()}원
                        </td>
                        <td className="px-4 py-3 text-right text-blue-600">
                          -{p.supplier_discount.toLocaleString()}원
                        </td>
                        <td className="px-4 py-3 text-right">
                          +{p.wholesale_shipping_fee.toLocaleString()}원
                        </td>
                        <td className="px-4 py-3 text-right text-violet-600">
                          -{p.points_used.toLocaleString()}원
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">
                          {p.total_amount.toLocaleString()}원
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-brand-600">
                          {p.paid_amount.toLocaleString()}원
                        </td>
                        <td className="px-4 py-3">{p.note || "-"}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-center gap-2">
                            <Button
                              size="xs"
                              variant="gray"
                              onClick={() => editPurchase(p)}
                            >
                              수정
                            </Button>
                            <Button
                              size="xs"
                              variant="gray"
                              onClick={() =>
                                deletePurchaseMutation.mutate(p.id)
                              }
                            >
                              삭제
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="py-10 text-center text-sm text-gray-500">
                등록된 과거 매입액이 없습니다.
              </p>
            )}
          </section>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50/70 p-3 sm:flex-row">
            <Choice
              options={[
                { value: "historical", label: "6/1~7/21 판매분 과거원가" },
                { value: "opening_20260722", label: "7/22 기초재고 원가" },
              ]}
              value={costMode}
              onChange={(value) =>
                setCostMode(value as SettlementCostBasisType)
              }
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="품목 검색"
              className={`${fieldClass} sm:max-w-sm`}
            />
          </div>
          {(costMode === "historical" || costMode === "opening_20260722") && (
            <section className="rounded-xl border border-gray-200 bg-gray-50/70 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-gray-900">
                    판매분·기초재고 통합 원가 입력
                  </h2>
                  <p className="mt-1 text-xs text-gray-500">
                    6월 1일~7월 21일 판매수량과 7월 22일 기초재고수량을 한 번에
                    입력합니다. 같은 품목은 위 행부터 먼저 판매됩니다.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="gray"
                    onClick={downloadHistoricalCostExcel}
                  >
                    엑셀 양식 다운로드
                  </Button>
                  <Button
                    type="button"
                    variant="gray"
                    onClick={() => setCostExcelOpen((open) => !open)}
                  >
                    {costExcelOpen ? "붙여넣기 닫기" : "작성 엑셀 붙여넣기"}
                  </Button>
                </div>
              </div>
              {costExcelOpen && (
                <div className="mt-3 space-y-3 border-t border-gray-200 pt-3">
                  <p className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs leading-5 text-gray-600">
                    엑셀의 헤더를 포함해 복사하세요. 필수 열:{" "}
                    <strong>품목명</strong>, <strong>구간수량</strong>,{" "}
                    <strong>개당원가</strong>
                    <br />
                    동일 품목은 붙여넣은 위 행이 1차 원가이며 먼저 판매됩니다.
                    판매수량 경계에서 자동으로 나눠 저장합니다.
                  </p>
                  <textarea
                    value={costExcelPaste}
                    onChange={(event) => setCostExcelPaste(event.target.value)}
                    placeholder="작성한 엑셀 범위를 헤더와 함께 붙여넣으세요."
                    className="min-h-36 w-full resize-y rounded-lg border border-gray-300 bg-white p-3 font-mono text-xs text-gray-900 shadow-sm outline-none transition placeholder:font-sans placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  />
                  {historicalCostPreview.errors.length > 0 && (
                    <div className="max-h-40 overflow-y-auto rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      {historicalCostPreview.errors.map((error, index) => (
                        <p key={`${error}-${index}`}>{error}</p>
                      ))}
                    </div>
                  )}
                  {historicalCostPreview.rows.length > 0 && (
                    <div className="max-h-64 overflow-auto rounded-lg border border-gray-200 bg-white">
                      <table className="w-full min-w-[850px] text-xs">
                        <thead className="sticky top-0 bg-gray-50 text-left text-gray-600">
                          <tr>
                            <th className="px-3 py-2">품목명</th>
                            <th className="px-3 py-2 text-right">
                              6/1~7/21 판매
                            </th>
                            <th className="px-3 py-2 text-right">
                              7/22 기초재고
                            </th>
                            <th className="px-3 py-2 text-right">합계</th>
                            <th className="px-3 py-2">입력 원가 순서</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {historicalCostPreview.rows.map((row) => (
                            <tr key={row.itemName}>
                              <td className="px-3 py-2 font-semibold">
                                {row.itemName}
                              </td>
                              <td className="px-3 py-2 text-right">
                                {row.soldQuantity}개
                              </td>
                              <td className="px-3 py-2 text-right">
                                {row.openingQuantity}개
                              </td>
                              <td className="px-3 py-2 text-right font-semibold">
                                {row.totalQuantity}개
                              </td>
                              <td className="px-3 py-2">
                                {row.segments.map((segment, index) => (
                                  <span
                                    key={index}
                                    className="mr-2 inline-flex rounded-md bg-gray-100 px-2 py-1"
                                  >
                                    {index + 1}차 {segment.quantity}개 ×{" "}
                                    {segment.unitCost.toLocaleString()}원
                                  </span>
                                ))}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="gray"
                      onClick={() => setCostExcelPaste("")}
                    >
                      초기화
                    </Button>
                    <Button
                      type="button"
                      disabled={
                        !historicalCostPreview.rows.length ||
                        historicalCostPreview.errors.length > 0 ||
                        bulkCostMutation.isPending
                      }
                      onClick={() =>
                        bulkCostMutation.mutate(
                          historicalCostPreview.rows.map((row) => ({
                            itemId: row.itemId,
                            itemName: row.itemName,
                            soldQuantity: row.soldQuantity,
                            openingQuantity: row.openingQuantity,
                            segments: row.segments,
                          })),
                        )
                      }
                    >
                      {bulkCostMutation.isPending
                        ? "저장 중..."
                        : `${historicalCostPreview.rows.length}개 품목 저장`}
                    </Button>
                  </div>
                </div>
              )}
            </section>
          )}
          {costMode === "opening_20260722" && (
            <p className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
              7월 22일 재고관리 시작 당시 등록된 기초재고수량입니다. 이후
              입고·출고·재고조정 수량은 포함하지 않습니다.
            </p>
          )}
          <p className="text-xs text-gray-600 sm:text-sm">
            <span className="font-semibold text-brand-600">
              {Math.min(visibleCostCount, filteredCosts.length)}
            </span>
            /{filteredCosts.length}
          </p>
          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            {costsQuery.isPending ? (
              <Loading size="sm" />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[850px] text-sm">
                    <thead className="bg-gray-50/70 text-left text-xs text-gray-600">
                      <tr>
                        <th className="px-4 py-3">품목</th>
                        <th className="px-4 py-3 text-right">
                          {costMode === "historical"
                            ? "판매수량"
                            : "기초재고수량"}
                        </th>
                        <th className="px-4 py-3">수량별 원가</th>
                        <th className="px-4 py-3 text-center">관리</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredCosts.slice(0, visibleCostCount).map((item) => {
                        const totalQuantity =
                          costMode === "historical"
                            ? item.soldBeforeBaseline
                            : item.openingQuantity;
                        const stored =
                          costMode === "historical"
                            ? item.historicalSegments
                            : item.openingSegments;
                        const key = `${item.itemName}:${costMode}`;
                        const segments = getDraft(key, totalQuantity, stored);
                        const enteredQuantity = segments.reduce(
                          (sum, segment) =>
                            sum + (Number(segment.quantity) || 0),
                          0,
                        );
                        return (
                          <tr key={item.itemName} className="align-top">
                            <td className="px-4 py-4">
                              <span className="font-semibold">
                                {item.itemName}
                              </span>
                              {costMode === "historical" && (
                                <span
                                  className={`ml-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                    item.currentItemStatus === "active"
                                      ? "bg-emerald-50 text-emerald-700"
                                      : item.currentItemStatus === "inactive"
                                        ? "bg-gray-100 text-gray-600"
                                        : "bg-amber-50 text-amber-700"
                                  }`}
                                >
                                  {item.currentItemStatus === "active"
                                    ? "현재 사용"
                                    : item.currentItemStatus === "inactive"
                                      ? "미사용"
                                      : "현재 품목 없음"}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-4 text-right">
                              <span className="font-semibold">
                                {totalQuantity}개
                              </span>
                              <p
                                className={`mt-1 text-xs ${enteredQuantity === totalQuantity ? "text-emerald-600" : "text-brand-600"}`}
                              >
                                입력 {enteredQuantity}/{totalQuantity}
                              </p>
                            </td>
                            <td className="px-4 py-3">
                              <div className="space-y-2">
                                {segments.map((segment, index) => (
                                  <div
                                    key={index}
                                    className="flex items-center gap-2"
                                  >
                                    <span className="w-20 shrink-0 text-xs font-semibold text-gray-500">
                                      {index + 1}차
                                      {index === 0 ? " · 먼저 판매" : ""}
                                    </span>
                                    <input
                                      type="number"
                                      min="1"
                                      value={segment.quantity}
                                      onChange={(e) =>
                                        updateDraft(
                                          key,
                                          segments.map((value, segmentIndex) =>
                                            segmentIndex === index
                                              ? {
                                                  ...value,
                                                  quantity: e.target.value,
                                                }
                                              : value,
                                          ),
                                        )
                                      }
                                      placeholder="수량"
                                      aria-label={`${item.itemName} ${index + 1}차 수량`}
                                      className={`${fieldClass} w-24`}
                                    />
                                    <span className="text-xs text-gray-500">
                                      개
                                    </span>
                                    <input
                                      type="number"
                                      min="0"
                                      value={segment.unitCost}
                                      onChange={(e) =>
                                        updateDraft(
                                          key,
                                          segments.map((value, segmentIndex) =>
                                            segmentIndex === index
                                              ? {
                                                  ...value,
                                                  unitCost: e.target.value,
                                                }
                                              : value,
                                          ),
                                        )
                                      }
                                      placeholder="개당 원가"
                                      aria-label={`${item.itemName} ${index + 1}차 개당 원가`}
                                      className={`${fieldClass} w-36`}
                                    />
                                    <span className="text-xs text-gray-500">
                                      원
                                    </span>
                                    {segments.length > 1 && (
                                      <Button
                                        size="xs"
                                        variant="gray"
                                        onClick={() =>
                                          updateDraft(
                                            key,
                                            segments.filter(
                                              (_, segmentIndex) =>
                                                segmentIndex !== index,
                                            ),
                                          )
                                        }
                                      >
                                        삭제
                                      </Button>
                                    )}
                                  </div>
                                ))}
                                <Button
                                  size="xs"
                                  variant="gray"
                                  onClick={() =>
                                    updateDraft(key, [
                                      ...segments,
                                      { quantity: "", unitCost: "" },
                                    ])
                                  }
                                >
                                  품목 나누기
                                </Button>
                              </div>
                            </td>
                            <td className="px-4 py-4 text-center">
                              <Button
                                size="xs"
                                disabled={saveCostMutation.isPending}
                                onClick={() => {
                                  const parsed = segments.map((segment) => ({
                                    quantity: Number(segment.quantity),
                                    unitCost: Number(segment.unitCost),
                                  }));
                                  if (
                                    parsed.some(
                                      (segment) =>
                                        !Number.isInteger(segment.quantity) ||
                                        segment.quantity <= 0 ||
                                        !Number.isInteger(segment.unitCost) ||
                                        segment.unitCost < 0,
                                    )
                                  )
                                    return toast.error(
                                      "각 구간의 수량과 원가를 확인해 주세요.",
                                    );
                                  if (
                                    parsed.reduce(
                                      (sum, segment) => sum + segment.quantity,
                                      0,
                                    ) !== totalQuantity
                                  )
                                    return toast.error(
                                      `나눈 수량의 합계를 전체 수량 ${totalQuantity}개와 맞춰 주세요.`,
                                    );
                                  saveCostMutation.mutate({
                                    itemId: item.itemId,
                                    itemName: item.itemName,
                                    basisType: costMode,
                                    segments: parsed,
                                  });
                                }}
                              >
                                저장
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {visibleCostCount < filteredCosts.length && (
                  <div className="border-t border-gray-200 p-3 text-center">
                    <Button
                      variant="gray"
                      onClick={() =>
                        setVisibleCostCount((count) => count + 100)
                      }
                    >
                      더 불러오기
                    </Button>
                  </div>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}

const Field = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <label className="flex min-w-0 flex-col">
    <span className="mb-1 text-xs font-semibold text-gray-600">{label}</span>
    {children}
  </label>
);
const Choice = ({
  options,
  value,
  onChange,
}: {
  options: readonly { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) => (
  <div className="grid h-10 grid-flow-col overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm">
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        onClick={() => onChange(option.value)}
        className={`cursor-pointer border-r border-gray-200 px-3 text-xs font-semibold last:border-r-0 ${value === option.value ? "bg-brand-500 text-white" : "text-gray-600 hover:bg-gray-50"}`}
      >
        {option.label}
      </button>
    ))}
  </div>
);
