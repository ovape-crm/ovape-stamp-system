"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import Button from "@/app/_components/Button";
import { Dropdown, DropdownOption } from "@/app/_components/Dropdown";
import Loading from "@/app/_components/Loading";
import KoreanDatePicker, {
  KoreanDateRangePicker,
} from "@/app/_components/KoreanDatePicker";
import { useUser } from "@/app/_contexts/UserContext";
import {
  getInventoryMovements,
  getInventoryOverview,
  initializeInventory,
  addInitialInventoryEntries,
  resetInventoryForReinitialization,
  inventoryKeys,
  normalizeInventoryItemName,
  saveInventoryTrackingSettings,
  getInventorySuppliers,
  saveInventorySupplier,
  getPurchaseOrders,
  createPurchaseOrder,
  setPurchaseArrivalQuantity,
  updatePurchaseOrderQuantity,
  checkPurchaseArrivalQuantity,
  processPurchaseArrival,
  closePurchaseOrderRemainder,
  reversePurchaseReceipt,
  deletePurchaseOrderHistory,
  deactivatePurchaseAdjustmentCategory,
  getPurchaseAdjustmentCategories,
  savePurchaseAdjustmentCategory,
  savePurchaseOrderAdjustments,
  updatePurchaseOrderDetails,
  searchReservationCustomers,
  getCustomerReservationHistories,
} from "@/app/_domains/_inventory/_services/inventoryService";
import type {
  InventoryItem,
  InventorySupplier,
  PurchaseAdjustmentCategory,
  PurchaseAdjustmentKind,
  PurchaseOrder,
  PurchaseOrderAdjustment,
} from "@/app/_domains/_inventory/_types/inventory.types";

type Tab = "stock" | "untracked" | "receive" | "movements" | "initial";
const defaultTabOrder: Tab[] = [
  "stock",
  "untracked",
  "movements",
  "receive",
  "initial",
];
const tabLabels: Record<Tab, string> = {
  stock: "재고 현황",
  untracked: "수량 미관리 품목",
  movements: "재고 변동",
  receive: "입고 관리",
  initial: "기초 재고 입고",
};
type ReceiptRow = {
  id: number | string;
  itemName: string;
  quantity: string;
  unitPrice: string;
  note: string;
  handlingType: "none" | "demo" | "reservation" | "memo";
  handlingNote: string;
  customerId: string;
  customerName: string;
  reservationLogId: string;
};

const createEmptyReceiptRow = (id: number, isAdmin: boolean): ReceiptRow => ({
  id,
  itemName: "",
  quantity: "1",
  unitPrice: isAdmin ? "0" : "",
  note: "",
  handlingType: "none",
  handlingNote: "",
  customerId: "",
  customerName: "",
  reservationLogId: "",
});

const PURCHASE_HANDLING_OPTIONS = [
  { value: "none", label: "미입력" },
  { value: "demo", label: "시연용 처리" },
  { value: "reservation", label: "예약 연결" },
  { value: "memo", label: "메모입력" },
] as const;

const isLegacyDemoMemo = (value: string | null | undefined) =>
  /시연용\s*처리|시연용처리/.test(value?.trim() ?? "");

const getLegacyDemoNote = (value: string | null | undefined) =>
  (value ?? "")
    .replace(/시연용\s*처리/g, "")
    .replace(/^[\s,:·-]+|[\s,:·-]+$/g, "")
    .trim();

const clearLegacyDemoMemo = (value: string) =>
  isLegacyDemoMemo(value) ? getLegacyDemoNote(value) : value;

const movementLabels: Record<string, string> = {
  initial: "기초재고",
  purchase_in: "입고",
  adjustment: "재고 조정",
  reversal: "입고/취소",
  sale_out: "출고",
  exchange_in: "입고/교환",
  outbound_edit: "출고/수정",
  outbound_cancel: "출고/취소",
};

export function InventoryPageContent({
  initialSection = "stock",
}: {
  initialSection?: "stock" | "receive";
}) {
  const { isAdmin } = useUser();
  const pageRouter = useRouter();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>(
    initialSection === "receive" ? "receive" : "stock",
  );
  const [inventorySection] = useState<"stock" | "receive">(initialSection);
  const [tabOrder, setTabOrder] = useState<Tab[]>(defaultTabOrder);
  const [editingTabOrder, setEditingTabOrder] = useState(false);
  const [receiveView, setReceiveView] = useState<"receive" | "suppliers">(
    "receive",
  );
  const [receiveTabOrder, setReceiveTabOrder] = useState<
    ("receive" | "suppliers")[]
  >(["receive", "suppliers"]);
  const [editingReceiveTabOrder, setEditingReceiveTabOrder] = useState(false);
  const [purchaseOrderTarget, setPurchaseOrderTarget] = useState<string | null>(
    null,
  );
  useEffect(() => {
    if (initialSection !== "receive") return;
    const updateTarget = () => {
      const match = window.location.hash.match(/^#order-(.+)$/);
      setPurchaseOrderTarget(match?.[1] ?? null);
    };
    updateTarget();
    window.addEventListener("hashchange", updateTarget);
    return () => window.removeEventListener("hashchange", updateTarget);
  }, [initialSection]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => {
    const saved = window.localStorage.getItem("inventory-tab-order");
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as Tab[];
      if (
        parsed.length === defaultTabOrder.length &&
        defaultTabOrder.every((item) => parsed.includes(item))
      ) {
        setTabOrder(parsed);
      }
    } catch {
      window.localStorage.removeItem("inventory-tab-order");
    }
  }, []);
  useEffect(() => {
    const saved = window.localStorage.getItem("inventory-receive-tab-order");
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as ("receive" | "suppliers")[];
      if (
        parsed.length === 2 &&
        parsed.includes("receive") &&
        parsed.includes("suppliers")
      ) {
        setReceiveTabOrder(parsed);
      }
    } catch {
      window.localStorage.removeItem("inventory-receive-tab-order");
    }
  }, []);
  const moveTab = (index: number, direction: -1 | 1) => {
    setTabOrder((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      window.localStorage.setItem("inventory-tab-order", JSON.stringify(next));
      return next;
    });
  };
  const moveReceiveTab = (index: number, direction: -1 | 1) => {
    setReceiveTabOrder((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      window.localStorage.setItem(
        "inventory-receive-tab-order",
        JSON.stringify(next),
      );
      return next;
    });
  };
  const overviewQuery = useQuery({
    queryKey: inventoryKeys.overview,
    queryFn: getInventoryOverview,
  });
  const movementsQuery = useQuery({
    queryKey: inventoryKeys.movements,
    queryFn: () => getInventoryMovements(2000),
    enabled: Boolean(overviewQuery.data?.initializedAt),
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.refetchQueries({
        queryKey: inventoryKeys.overview,
        type: "active",
      }),
      queryClient.refetchQueries({
        queryKey: inventoryKeys.movements,
        type: "active",
      }),
    ]);
  };

  if (overviewQuery.isPending)
    return <Loading size="lg" text="재고 정보를 불러오는 중..." />;
  if (overviewQuery.isError) {
    return (
      <div className="mx-auto mt-12 max-w-xl rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
        <p className="font-semibold text-rose-700">
          재고 테이블을 불러오지 못했습니다.
        </p>
        <p className="mt-2 text-sm text-rose-600">
          Supabase에서 docs/inventory_management.sql을 먼저 실행해 주세요.
        </p>
      </div>
    );
  }

  const { items, initializedAt } = overviewQuery.data;

  return (
    <main className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6 lg:px-8">
      {inventorySection === "stock" && (
        <div className="flex items-end justify-between border-b border-gray-200">
          <div
            className="flex min-w-0 overflow-x-auto"
            role="tablist"
            aria-label="재고 관리 메뉴"
          >
            {tabOrder.map((item, index) =>
              item === "receive" || (item === "initial" && !isAdmin) ? null : (
                <div key={item} className="flex shrink-0 items-center">
                  {editingTabOrder && (
                    <button
                      type="button"
                      onClick={() => moveTab(index, -1)}
                      disabled={index === 0}
                      className="h-7 w-6 text-xs text-gray-400 hover:text-brand-600 disabled:opacity-20"
                      aria-label={`${tabLabels[item]} 왼쪽으로 이동`}
                    >
                      ‹
                    </button>
                  )}
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab === item}
                    onClick={() => setTab(item)}
                    className={`border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
                      tab === item
                        ? "border-brand-500 text-brand-700"
                        : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                    }`}
                  >
                    {tabLabels[item]}
                  </button>
                  {editingTabOrder && (
                    <button
                      type="button"
                      onClick={() => moveTab(index, 1)}
                      disabled={index === tabOrder.length - 1}
                      className="h-7 w-6 text-xs text-gray-400 hover:text-brand-600 disabled:opacity-20"
                      aria-label={`${tabLabels[item]} 오른쪽으로 이동`}
                    >
                      ›
                    </button>
                  )}
                </div>
              ),
            )}
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setEditingTabOrder((current) => !current)}
              className={`mb-2 ml-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-white transition ${
                editingTabOrder
                  ? "border-brand-300 text-brand-700 shadow-sm"
                  : "border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-brand-700"
              }`}
              aria-label={
                editingTabOrder ? "탭 순서 변경 완료" : "탭 순서 변경"
              }
              title={editingTabOrder ? "탭 순서 변경 완료" : "탭 순서 변경"}
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                  d="M12 15.25A3.25 3.25 0 1 0 12 8.75a3.25 3.25 0 0 0 0 6.5Zm7.25-3.25c0-.48-.05-.95-.14-1.4l2.02-1.57-2-3.46-2.48 1a7.4 7.4 0 0 0-2.42-1.4L13.88 2.5h-4l-.35 2.67a7.4 7.4 0 0 0-2.42 1.4l-2.48-1-2 3.46 2.02 1.57a7.18 7.18 0 0 0 0 2.8l-2.02 1.57 2 3.46 2.48-1a7.4 7.4 0 0 0 2.42 1.4l.35 2.67h4l.35-2.67a7.4 7.4 0 0 0 2.42-1.4l2.48 1 2-3.46-2.02-1.57c.09-.45.14-.92.14-1.4Z"
                />
              </svg>
            </button>
          )}
        </div>
      )}
      {inventorySection === "receive" && (
        <div className="flex items-end justify-between border-b border-gray-200">
          <div className="flex" role="tablist" aria-label="입고 관리 메뉴">
            {receiveTabOrder
              .filter((item) => isAdmin || item === "receive")
              .map((item, index) => (
                <div key={item} className="flex items-center">
                  {editingReceiveTabOrder && (
                    <button
                      type="button"
                      onClick={() => moveReceiveTab(index, -1)}
                      disabled={index === 0}
                      className="h-7 w-6 text-xs text-gray-400 hover:text-brand-600 disabled:opacity-20"
                      aria-label={`${item === "receive" ? "입고" : "거래처 관리"} 왼쪽으로 이동`}
                    >
                      ‹
                    </button>
                  )}
                  <button
                    type="button"
                    role="tab"
                    aria-selected={receiveView === item}
                    onClick={() => setReceiveView(item)}
                    className={`border-b-2 px-5 py-3 text-sm font-semibold transition-colors ${
                      receiveView === item
                        ? "border-brand-500 text-brand-700"
                        : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                    }`}
                  >
                    {item === "receive" ? "입고" : "거래처 관리"}
                  </button>
                  {editingReceiveTabOrder && (
                    <button
                      type="button"
                      onClick={() => moveReceiveTab(index, 1)}
                      disabled={index === receiveTabOrder.length - 1}
                      className="h-7 w-6 text-xs text-gray-400 hover:text-brand-600 disabled:opacity-20"
                      aria-label={`${item === "receive" ? "입고" : "거래처 관리"} 오른쪽으로 이동`}
                    >
                      ›
                    </button>
                  )}
                </div>
              ))}
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setEditingReceiveTabOrder((current) => !current)}
              className={`mb-2 ml-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-white transition ${
                editingReceiveTabOrder
                  ? "border-brand-300 text-brand-700 shadow-sm"
                  : "border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-brand-700"
              }`}
              aria-label={
                editingReceiveTabOrder
                  ? "입고 탭 순서 변경 완료"
                  : "입고 탭 순서 변경"
              }
              title={
                editingReceiveTabOrder
                  ? "입고 탭 순서 변경 완료"
                  : "입고 탭 순서 변경"
              }
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                  d="M12 15.25A3.25 3.25 0 1 0 12 8.75a3.25 3.25 0 0 0 0 6.5Zm7.25-3.25c0-.48-.05-.95-.14-1.4l2.02-1.57-2-3.46-2.48 1a7.4 7.4 0 0 0-2.42-1.4L13.88 2.5h-4l-.35 2.67a7.4 7.4 0 0 0-2.42 1.4l-2.48-1-2 3.46 2.02 1.57a7.18 7.18 0 0 0 0 2.8l-2.02 1.57 2 3.46 2.48-1a7.4 7.4 0 0 0 2.42 1.4l.35 2.67h4l.35-2.67a7.4 7.4 0 0 0 2.42-1.4l2.48 1 2-3.46-2.02-1.57c.09-.45.14-.92.14-1.4Z"
                />
              </svg>
            </button>
          )}
        </div>
      )}

      {!initializedAt ? (
        isAdmin ? (
          <>
            <InitialStockSetup
              items={items.filter((item) => item.item_code)}
              initialized={false}
              onSaved={refresh}
            />
          </>
        ) : (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center text-amber-700">
            관리자가 기초재고를 등록하는 중입니다.
          </div>
        )
      ) : tab === "initial" && isAdmin ? (
        <InitialStockSetup
          items={items.filter((item) => item.item_code)}
          initialized
          onSaved={refresh}
        />
      ) : tab === "stock" ? (
        <StockOverview items={items.filter((item) => item.is_tracked)} />
      ) : tab === "untracked" ? (
        <UntrackedOverview
          items={items.filter((item) => !item.is_tracked && item.is_use)}
          isAdmin={isAdmin}
          onSettings={() => setSettingsOpen(true)}
        />
      ) : tab === "receive" && receiveView === "suppliers" && isAdmin ? (
        <SupplierManagementTab isAdmin={isAdmin} />
      ) : tab === "receive" ? (
        <ReceiptManager
          items={items.filter((item) => item.is_use)}
          isAdmin={isAdmin}
          onSaved={refresh}
          focusOrderId={purchaseOrderTarget}
        />
      ) : (
        <MovementHistory
          movements={movementsQuery.data ?? []}
          loading={movementsQuery.isPending}
          isAdmin={isAdmin}
          onSaved={refresh}
          onOpenPurchaseOrder={(orderId) => {
            pageRouter.push(`/inventory/receive#order-${orderId}`);
          }}
        />
      )}
      {settingsOpen && (
        <TrackingSettingsOverlay
          items={items}
          onClose={() => setSettingsOpen(false)}
          onSaved={async () => {
            setSettingsOpen(false);
            await refresh();
          }}
        />
      )}
    </main>
  );
}

function InitialStockSetup({
  items,
  initialized,
  onSaved,
}: {
  items: InventoryItem[];
  initialized: boolean;
  onSaved: () => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [pasteText, setPasteText] = useState("");
  const [pasteErrors, setPasteErrors] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);
  const mutation = useMutation({
    mutationFn: initialized ? addInitialInventoryEntries : initializeInventory,
    onSuccess: async () => {
      setConfirming(false);
      await onSaved();
      setValues({});
      setPasteText("");
      toast.success(
        initialized
          ? "신규 품목의 기초재고를 추가했습니다."
          : "기초재고 등록을 완료했습니다.",
      );
    },
    onError: (error) =>
      toast.error(error.message || "기초재고 등록에 실패했습니다."),
  });

  const sortedItems = useMemo(
    () =>
      items
        .filter(
          (item) =>
            item.is_tracked && (!initialized || item.updated_at === null),
        )
        .sort(
          (a, b) =>
            a.item_code.localeCompare(b.item_code, "ko-KR", {
              numeric: true,
              sensitivity: "base",
            }) || a.item_name.localeCompare(b.item_name, "ko-KR"),
        ),
    [items, initialized],
  );

  const itemNames = useMemo(
    () =>
      new Map(
        items.map((item) => [
          normalizeInventoryItemName(item.item_name),
          item.item_name,
        ]),
      ),
    [items],
  );
  const duplicateItemNames = useMemo(() => {
    const counts = new Map<string, number>();
    sortedItems.forEach((item) =>
      counts.set(item.item_name, (counts.get(item.item_name) ?? 0) + 1),
    );
    return [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([itemName]) => itemName);
  }, [sortedItems]);
  const filteredItems = sortedItems.filter((item) =>
    `${item.item_name} ${item.item_code}`
      .toLocaleLowerCase("ko-KR")
      .includes(search.toLocaleLowerCase("ko-KR")),
  );
  const entries = sortedItems
    .filter((item) => !initialized || values[item.item_name] !== undefined)
    .map((item) => ({
      item_name: item.item_name,
      quantity: Number(values[item.item_name] || 0),
    }));
  const nonZeroCount = entries.filter((entry) => entry.quantity > 0).length;
  const totalQuantity = entries.reduce((sum, entry) => sum + entry.quantity, 0);

  const downloadExcel = async () => {
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("기초재고 확인", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    sheet.columns = [
      { header: "품목 코드", key: "itemCode", width: 18 },
      { header: "품목 종류", key: "category", width: 18 },
      { header: "품목명", key: "itemName", width: 42 },
      { header: "사용 여부", key: "isUse", width: 12 },
      { header: "기초재고", key: "quantity", width: 14 },
    ];
    sortedItems.forEach((item) =>
      sheet.addRow({
        itemCode: item.item_code,
        category: item.category_name ?? "미분류",
        itemName: item.item_name,
        isUse: item.is_use ? "사용" : "미사용",
        quantity: Number(values[item.item_name] || 0),
      }),
    );
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE85D75" },
    };
    sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
    sheet.getRow(1).height = 24;
    sheet.getColumn(5).numFmt = "#,##0";
    sheet.autoFilter = { from: "A1", to: "E1" };
    sheet.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFD1D5DB" } },
          left: { style: "thin", color: { argb: "FFD1D5DB" } },
          bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
          right: { style: "thin", color: { argb: "FFD1D5DB" } },
        };
        if (rowNumber > 1) cell.alignment = { vertical: "middle" };
      });
    });
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer as ArrayBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `기초재고_확인_${new Date().toISOString().slice(0, 10)}.xlsx`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const applyPaste = () => {
    const nextValues = { ...values };
    const errors: string[] = [];
    const seen = new Set<string>();
    let skippedCount = 0;
    pasteText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line, index) => {
        const parts = line.includes("\t") ? line.split("\t") : line.split(",");
        const rawName = parts
          .slice(0, -1)
          .join(line.includes("\t") ? "\t" : ",");
        const itemName = normalizeInventoryItemName(rawName);
        const quantityText = parts.at(-1)?.trim() ?? "";
        if (["-", "–", "—"].includes(quantityText)) {
          skippedCount += 1;
          return;
        }
        const matchedName = itemNames.get(itemName);
        const quantity =
          quantityText === "품절"
            ? 0
            : Number(quantityText.replaceAll(",", ""));
        if (!matchedName)
          errors.push(
            `${index + 1}행: 품목을 찾을 수 없습니다 - ${itemName || "(빈 품목명)"}`,
          );
        else if (
          !items.find((item) => item.item_name === matchedName)?.is_tracked
        ) {
          skippedCount += 1;
          return;
        } else if (seen.has(matchedName))
          errors.push(`${index + 1}행: 중복된 품목입니다 - ${matchedName}`);
        else if (!Number.isInteger(quantity) || quantity < 0)
          errors.push(
            `${index + 1}행: 수량은 0 이상의 정수여야 합니다 - ${quantityText}`,
          );
        else {
          nextValues[matchedName] = String(quantity);
          seen.add(matchedName);
        }
      });
    setPasteErrors(errors);
    if (!errors.length) {
      setValues(nextValues);
      toast.success(`${seen.size}개 반영 · ${skippedCount}개(-) 제외`);
    }
  };

  const resetAllInventory = async () => {
    const confirmation = window.prompt(
      "현재 재고와 모든 재고 변동 이력이 삭제됩니다. 계속하려면 '재고초기화'를 입력하세요.",
    );
    if (confirmation !== "재고초기화") return;
    setResetting(true);
    try {
      await resetInventoryForReinitialization();
      setValues({});
      setPasteText("");
      toast.success("재고를 초기화했습니다. 기초재고를 다시 등록해 주세요.");
      await onSaved();
    } catch (error) {
      toast.error((error as Error).message || "재고 초기화에 실패했습니다.");
    } finally {
      setResetting(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-brand-100 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-5 py-5 sm:px-7">
        <h1 className="text-lg font-semibold text-gray-900">
          {initialized ? "기초 재고 입고" : "기초재고 등록"}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {initialized
            ? "아직 재고가 등록되지 않은 신규 품목만 표시됩니다. 기존 재고는 덮어쓰지 않습니다."
            : "품목명 내부 띄어쓰기는 그대로 유지됩니다. 빈칸은 재고 0개로 시작합니다."}
        </p>
      </div>
      <div className="grid gap-5 p-5 lg:grid-cols-[360px_1fr] sm:p-7">
        <div className="space-y-3">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-sm font-semibold text-gray-800">
              엑셀 복사·붙여넣기
            </p>
            <p className="mt-1 text-xs text-gray-500">
              품목명과 수량 두 열을 복사해서 붙여넣으세요.
            </p>
            <textarea
              value={pasteText}
              onChange={(event) => setPasteText(event.target.value)}
              placeholder={"입호흡 액상 민트\t10\n폐호흡 액상 망고\t5"}
              className="mt-3 h-36 w-full resize-none rounded-lg border border-gray-200 bg-white p-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
            <Button
              size="sm"
              className="mt-2 w-full"
              onClick={applyPaste}
              disabled={!pasteText.trim()}
            >
              붙여넣기 반영
            </Button>
          </div>
          {duplicateItemNames.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
              <p className="font-bold">
                품목 관리에 중복된 품목명이 있어 기초재고를 확정할 수 없습니다.
              </p>
              {duplicateItemNames.map((itemName) => (
                <p key={itemName}>· {itemName}</p>
              ))}
            </div>
          )}
          {pasteErrors.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
              {pasteErrors.map((error) => (
                <p key={error}>{error}</p>
              ))}
            </div>
          )}
          <div className="rounded-xl border border-brand-100 bg-brand-50 p-4 text-sm">
            <div className="flex justify-between">
              <span>수량 입력 품목</span>
              <strong>{nonZeroCount.toLocaleString()}개</strong>
            </div>
            <div className="mt-2 flex justify-between">
              <span>기초재고 총수량</span>
              <strong>{totalQuantity.toLocaleString()}개</strong>
            </div>
          </div>
          <Button
            size="sm"
            variant="gray"
            className="w-full"
            onClick={downloadExcel}
          >
            기초재고 엑셀 다운로드
          </Button>
        </div>

        <div className="min-w-0">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="품목명 또는 품목 코드 검색"
            className="mb-3 min-h-11 w-full rounded-lg border border-gray-200 px-4 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
          <div className="max-h-[520px] overflow-auto rounded-xl border border-gray-200">
            <table className="w-full min-w-[620px] border-collapse text-sm">
              <thead className="sticky top-0 bg-brand-50 text-brand-700">
                <tr>
                  <th className="border border-brand-200 px-3 py-3 text-left">
                    품목 종류
                  </th>
                  <th className="border border-brand-200 px-3 py-3 text-left">
                    품목 코드
                  </th>
                  <th className="border border-brand-200 px-3 py-3 text-left">
                    품목명
                  </th>
                  <th className="w-32 border border-brand-200 px-3 py-3 text-right">
                    기초재고
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <tr key={item.item_name}>
                    <td className="border border-gray-200 px-3 py-2 text-gray-500">
                      {item.category_name ?? "-"}
                    </td>
                    <td className="border border-gray-200 px-3 py-2 font-mono text-gray-500">
                      {item.item_code}
                    </td>
                    <td className="border border-gray-200 px-3 py-2 font-medium">
                      {item.item_name}
                    </td>
                    <td className="border border-gray-200 p-1.5">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={values[item.item_name] ?? ""}
                        onChange={(event) =>
                          setValues((current) => ({
                            ...current,
                            [item.item_name]: event.target.value,
                          }))
                        }
                        className="h-10 w-full rounded-md border border-gray-200 px-3 text-right font-semibold outline-none focus:border-brand-400"
                        placeholder="0"
                      />
                    </td>
                  </tr>
                ))}
                {filteredItems.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="border border-gray-200 px-4 py-12 text-center text-gray-400"
                    >
                      기초재고를 추가할 신규 품목이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 bg-gray-50 px-5 py-4 sm:px-7">
        {initialized ? (
          <Button
            variant="danger"
            onClick={() => void resetAllInventory()}
            disabled={mutation.isPending || resetting}
          >
            {resetting ? "초기화 중..." : "재고 전체 초기화"}
          </Button>
        ) : (
          <span />
        )}
        <Button
          onClick={() => setConfirming(true)}
          disabled={
            mutation.isPending ||
            duplicateItemNames.length > 0 ||
            entries.length === 0
          }
        >
          기초재고 확인
        </Button>
      </div>
      {confirming && (
        <ConfirmOverlay
          title="기초재고를 확정하시겠습니까?"
          description={`등록 품목 ${entries.length.toLocaleString()}개 · 수량 입력 품목 ${nonZeroCount.toLocaleString()}개 · 총 ${totalQuantity.toLocaleString()}개\n기존 재고는 변경되지 않습니다.`}
          pending={mutation.isPending}
          onCancel={() => setConfirming(false)}
          onConfirm={() => mutation.mutate(entries)}
        />
      )}
    </section>
  );
}

function StockOverview({ items }: { items: InventoryItem[] }) {
  const [nameSearch, setNameSearch] = useState("");
  const [codeSearch, setCodeSearch] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [status, setStatus] = useState<"all" | "normal" | "out" | "negative">(
    "all",
  );
  const [usage, setUsage] = useState<"all" | "active" | "inactive">("active");
  const [dateMode, setDateMode] = useState<"today" | "custom">("today");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [visibleCount, setVisibleCount] = useState(10);
  type SortKey =
    "category" | "code" | "name" | "usage" | "quantity" | "updated";
  const [sort, setSort] = useState<{
    key: SortKey;
    direction: "asc" | "desc";
  } | null>({ key: "code", direction: "asc" });
  const localDate = (value: string) => {
    const date = new Date(value);
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 10);
  };
  const filtered = items.filter((item) => {
    const matchesName = item.item_name
      .toLocaleLowerCase("ko-KR")
      .includes(nameSearch.trim().toLocaleLowerCase("ko-KR"));
    const matchesCode = (item.item_code ?? "")
      .toLocaleLowerCase("ko-KR")
      .includes(codeSearch.trim().toLocaleLowerCase("ko-KR"));
    const matchesCategory = (item.category_name ?? "")
      .toLocaleLowerCase("ko-KR")
      .includes(categorySearch.trim().toLocaleLowerCase("ko-KR"));
    const itemStatus =
      item.quantity < 0 ? "negative" : item.quantity === 0 ? "out" : "normal";
    const date = item.updated_at ? localDate(item.updated_at) : "";
    const matchesDate =
      dateMode === "today" ||
      (Boolean(date) &&
        Boolean(startDate) &&
        (endDate ? date >= startDate && date <= endDate : date === startDate));
    return (
      matchesName &&
      matchesCode &&
      matchesCategory &&
      matchesDate &&
      (usage === "all" || (usage === "active" ? item.is_use : !item.is_use)) &&
      (status === "all" || status === itemStatus)
    );
  });
  const sortedItems = sort
    ? [...filtered].sort((a, b) => {
        const values = {
          category: [a.category_name ?? "", b.category_name ?? ""],
          code: [a.item_code, b.item_code],
          name: [a.item_name, b.item_name],
          usage: [a.is_use ? 1 : 0, b.is_use ? 1 : 0],
          quantity: [a.quantity, b.quantity],
          updated: [a.updated_at ?? "", b.updated_at ?? ""],
        }[sort.key];
        const result =
          typeof values[0] === "number"
            ? (values[0] as number) - (values[1] as number)
            : String(values[0]).localeCompare(String(values[1]), "ko-KR", {
                numeric: true,
                sensitivity: "base",
              });
        return sort.direction === "asc" ? result : -result;
      })
    : filtered;
  const visibleItems = sortedItems.slice(0, visibleCount);
  useEffect(() => {
    setVisibleCount(10);
  }, [
    nameSearch,
    codeSearch,
    categorySearch,
    status,
    usage,
    dateMode,
    startDate,
    endDate,
  ]);
  const changeSort = (key: SortKey) =>
    setSort((current) => {
      if (!current || current.key !== key) return { key, direction: "asc" };
      if (current.direction === "asc") return { key, direction: "desc" };
      return null;
    });
  const copyForKakao = async () => {
    const text = [
      "품목 코드\t품목명\t현재 재고",
      ...sortedItems.map((item) =>
        [
          item.item_code || "-",
          item.item_name,
          item.quantity === 0 ? "품절" : `${item.quantity}개`,
        ].join("\t"),
      ),
    ].join("\n");
    await navigator.clipboard.writeText(text);
    toast.success(`${sortedItems.length}개 품목을 표 순서대로 복사했습니다.`);
  };
  const headings = [
    { label: "사용 상태", key: "usage" },
    { label: "품목 종류", key: "category" },
    { label: "품목 코드", key: "code" },
    { label: "품목명", key: "name" },
    { label: "현재 재고", key: "quantity" },
    { label: "최근 변동", key: "updated" },
  ] as const;
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
        <div className="space-y-3">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-stretch lg:gap-3">
            <div className="flex w-full flex-col rounded-xl border border-gray-200 bg-gray-50/70 p-2.5 sm:w-[120px] sm:shrink-0">
              <p className="mb-1 text-xs font-semibold text-gray-600">
                재고 상태
              </p>
              <Dropdown controlledValue={status}>
                <Dropdown.Trigger compact>
                  {
                    [
                      { value: "all", label: "전체" },
                      { value: "normal", label: "정상" },
                      { value: "out", label: "품절" },
                      { value: "negative", label: "마이너스" },
                    ].find((option) => option.value === status)?.label
                  }
                </Dropdown.Trigger>
                <Dropdown.Content compact>
                  {(
                    [
                      { value: "all", label: "전체" },
                      { value: "normal", label: "정상" },
                      { value: "out", label: "품절" },
                      { value: "negative", label: "마이너스" },
                    ] as const
                  ).map((option) => (
                    <Dropdown.Item
                      key={option.value}
                      option={option}
                      compact
                      onSelect={(selected: DropdownOption) =>
                        setStatus(
                          selected.value as
                            "all" | "normal" | "out" | "negative",
                        )
                      }
                    />
                  ))}
                </Dropdown.Content>
              </Dropdown>
            </div>

            <div className="h-px w-full bg-gray-200 lg:h-auto lg:w-px lg:self-stretch" />

            <div className="flex w-full flex-col rounded-xl border border-gray-200 bg-gray-50/70 p-2.5 sm:w-[120px] sm:shrink-0">
              <p className="mb-1 text-xs font-semibold text-gray-600">
                사용 구분
              </p>
              <Dropdown controlledValue={usage}>
                <Dropdown.Trigger compact>
                  {
                    [
                      { value: "all", label: "전체" },
                      { value: "active", label: "사용" },
                      { value: "inactive", label: "미사용" },
                    ].find((option) => option.value === usage)?.label
                  }
                </Dropdown.Trigger>
                <Dropdown.Content compact>
                  {(
                    [
                      { value: "all", label: "전체" },
                      { value: "active", label: "사용" },
                      { value: "inactive", label: "미사용" },
                    ] as const
                  ).map((option) => (
                    <Dropdown.Item
                      key={option.value}
                      option={option}
                      compact
                      onSelect={(selected: DropdownOption) =>
                        setUsage(
                          selected.value as "all" | "active" | "inactive",
                        )
                      }
                    />
                  ))}
                </Dropdown.Content>
              </Dropdown>
            </div>

            <div className="h-px w-full bg-gray-200 lg:h-auto lg:w-px lg:self-stretch" />

            <div className="flex w-full flex-col rounded-xl border border-gray-200 bg-gray-50/70 p-2.5 sm:w-[120px] sm:shrink-0">
              <p className="mb-1 text-xs font-semibold text-gray-600">
                조회 기간
              </p>
              <Dropdown controlledValue={dateMode}>
                <Dropdown.Trigger compact>
                  {
                    [
                      { value: "today", label: "당일" },
                      { value: "custom", label: "날짜 선택" },
                    ].find((option) => option.value === dateMode)?.label
                  }
                </Dropdown.Trigger>
                <Dropdown.Content compact>
                  {(
                    [
                      { value: "today", label: "당일" },
                      { value: "custom", label: "날짜 선택" },
                    ] as const
                  ).map((option) => (
                    <Dropdown.Item
                      key={option.value}
                      option={option}
                      compact
                      onSelect={(selected: DropdownOption) => {
                        const nextMode = selected.value as "today" | "custom";
                        if (nextMode === "today") {
                          setStartDate("");
                          setEndDate("");
                        }
                        setDateMode(nextMode);
                      }}
                    />
                  ))}
                </Dropdown.Content>
              </Dropdown>
            </div>
            {dateMode === "custom" && (
              <div className="flex w-full flex-col rounded-xl border border-gray-200 bg-gray-50/70 p-2.5 sm:w-[120px] sm:shrink-0">
                <p className="mb-1 text-xs font-semibold text-gray-600">
                  날짜 선택
                </p>
                <KoreanDateRangePicker
                  startDate={startDate}
                  endDate={endDate}
                  iconOnly
                  onApply={(start, end) => {
                    setStartDate(start);
                    setEndDate(end);
                  }}
                />
              </div>
            )}

            <div className="h-px w-full bg-gray-200 lg:h-auto lg:w-px lg:self-stretch" />

            <div className="w-full rounded-xl border border-gray-200 bg-gray-50/70 p-3 lg:flex-1">
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block w-full">
                  <span className="mb-2 block text-xs font-semibold text-gray-500">
                    품목명
                  </span>
                  <span className="relative block">
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
                      value={nameSearch}
                      onChange={(event) => setNameSearch(event.target.value)}
                      placeholder="품목명 입력"
                      className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-10 text-sm font-medium text-gray-900 shadow-sm outline-none transition placeholder:font-normal placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                    />
                    {nameSearch && (
                      <button
                        type="button"
                        onClick={() => setNameSearch("")}
                        aria-label="품목명 검색어 지우기"
                        className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-gray-100 text-base font-medium text-gray-500 transition hover:bg-gray-200 hover:text-gray-700 active:bg-gray-300"
                      >
                        ×
                      </button>
                    )}
                  </span>
                </label>
                <label className="block w-full sm:border-l sm:border-gray-200 sm:pl-3">
                  <span className="mb-2 block text-xs font-semibold text-gray-500">
                    품목 코드
                  </span>
                  <span className="relative block">
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
                      value={codeSearch}
                      onChange={(event) => setCodeSearch(event.target.value)}
                      placeholder="품목 코드 입력"
                      className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-10 text-sm font-medium text-gray-900 shadow-sm outline-none transition placeholder:font-normal placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                    />
                    {codeSearch && (
                      <button
                        type="button"
                        onClick={() => setCodeSearch("")}
                        aria-label="품목 코드 검색어 지우기"
                        className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-gray-100 text-base font-medium text-gray-500 transition hover:bg-gray-200 hover:text-gray-700 active:bg-gray-300"
                      >
                        ×
                      </button>
                    )}
                  </span>
                </label>
                <label className="block w-full sm:border-l sm:border-gray-200 sm:pl-3">
                  <span className="mb-2 block text-xs font-semibold text-gray-500">
                    품목 종류
                  </span>
                  <span className="relative block">
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
                      value={categorySearch}
                      onChange={(event) =>
                        setCategorySearch(event.target.value)
                      }
                      placeholder="품목 종류 입력"
                      className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-10 text-sm font-medium text-gray-900 shadow-sm outline-none transition placeholder:font-normal placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                    />
                    {categorySearch && (
                      <button
                        type="button"
                        onClick={() => setCategorySearch("")}
                        aria-label="품목 종류 검색어 지우기"
                        className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-gray-100 text-base font-medium text-gray-500 transition hover:bg-gray-200 hover:text-gray-700 active:bg-gray-300"
                      >
                        ×
                      </button>
                    )}
                  </span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-gray-600 sm:text-sm">
          <span className="font-semibold text-brand-600">
            {Math.min(visibleCount, filtered.length).toLocaleString()}
          </span>
          <span className="text-gray-400">
            /{filtered.length.toLocaleString()}
          </span>
        </div>
        <div className="shrink-0">
          <Button
            size="sm"
            variant="gray"
            onClick={copyForKakao}
            disabled={!filtered.length}
          >
            카카오톡 복사
          </Button>
        </div>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="overflow-auto rounded-xl border border-gray-200">
          <table className="w-full min-w-[850px] border-collapse text-sm">
            <thead className="bg-brand-50 text-brand-700">
              <tr>
                {headings.map((heading) => (
                  <th
                    key={heading.key}
                    className="border border-brand-200 p-0 text-left"
                  >
                    <button
                      onClick={() => changeSort(heading.key)}
                      className="flex min-h-12 w-full items-center justify-between gap-2 px-4 py-3 font-semibold"
                    >
                      <span>{heading.label}</span>
                      <span
                        className={
                          sort?.key === heading.key
                            ? "text-brand-700"
                            : "text-gray-300"
                        }
                      >
                        {sort?.key === heading.key
                          ? sort.direction === "asc"
                            ? "▲"
                            : "▼"
                          : "↕"}
                      </span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((item) => {
                const negative = item.quantity < 0;
                const out = item.quantity === 0;
                return (
                  <tr key={item.item_name} className="hover:bg-brand-50/30">
                    <td className="border border-gray-200 px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.is_use ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}
                      >
                        {item.is_use ? "사용" : "미사용"}
                      </span>
                    </td>
                    <td className="border border-gray-200 px-4 py-3">
                      {item.category_name ?? (
                        <span className="text-amber-600">품목 정보 없음</span>
                      )}
                    </td>
                    <td className="border border-gray-200 px-4 py-3 font-mono text-gray-500">
                      {item.item_code || "-"}
                    </td>
                    <td className="border border-gray-200 px-4 py-3 font-semibold">
                      {item.item_name}
                    </td>
                    <td
                      className={`border border-gray-200 px-4 py-3 text-right text-lg font-bold ${negative ? "text-rose-600" : out ? "text-gray-400" : "text-gray-900"}`}
                    >
                      {out ? "품절" : `${item.quantity.toLocaleString()}개`}
                    </td>
                    <td className="border border-gray-200 px-4 py-3 text-gray-500">
                      {item.updated_at
                        ? new Date(item.updated_at).toLocaleString("ko-KR")
                        : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {visibleCount < filtered.length && (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => setVisibleCount((current) => current + 10)}
              className="min-h-10 rounded-lg border border-gray-300 bg-white px-5 text-sm font-semibold text-gray-700 shadow-sm hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
            >
              더 불러오기
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

export default function InventoryPage() {
  return <InventoryPageContent initialSection="stock" />;
}

function UntrackedOverview({
  items,
  isAdmin,
  onSettings,
}: {
  items: InventoryItem[];
  isAdmin: boolean;
  onSettings: () => void;
}) {
  const [nameSearch, setNameSearch] = useState("");
  const [codeSearch, setCodeSearch] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const filteredItems = items.filter((item) => {
    const name = nameSearch.trim().toLocaleLowerCase("ko-KR");
    const code = codeSearch.trim().toLocaleLowerCase("ko-KR");
    const category = categorySearch.trim().toLocaleLowerCase("ko-KR");
    return (
      item.item_name.toLocaleLowerCase("ko-KR").includes(name) &&
      (item.item_code ?? "").toLocaleLowerCase("ko-KR").includes(code) &&
      (item.category_name ?? "").toLocaleLowerCase("ko-KR").includes(category)
    );
  });
  const searchFields = [
    {
      label: "품목명",
      placeholder: "품목명 입력",
      value: nameSearch,
      onChange: setNameSearch,
    },
    {
      label: "품목 코드",
      placeholder: "품목 코드 입력",
      value: codeSearch,
      onChange: setCodeSearch,
    },
    {
      label: "품목 종류",
      placeholder: "품목 종류 입력",
      value: categorySearch,
      onChange: setCategorySearch,
    },
  ];
  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
        <div className="w-full rounded-xl border border-gray-200 bg-gray-50/70 p-3 lg:w-[740px]">
          <div className="grid gap-3 sm:grid-cols-3">
            {searchFields.map((field, index) => (
              <label
                key={field.label}
                className={`block w-full ${index ? "sm:border-l sm:border-gray-200 sm:pl-3" : ""}`}
              >
                <span className="mb-2 block text-xs font-semibold text-gray-500">
                  {field.label}
                </span>
                <span className="relative block">
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
                    value={field.value}
                    onChange={(event) => field.onChange(event.target.value)}
                    placeholder={field.placeholder}
                    className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-10 text-sm font-medium text-gray-900 shadow-sm outline-none transition placeholder:font-normal placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  />
                  {field.value && (
                    <button
                      type="button"
                      onClick={() => field.onChange("")}
                      aria-label={`${field.label} 검색어 지우기`}
                      className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-gray-100 text-base font-medium text-gray-500 transition hover:bg-gray-200 hover:text-gray-700"
                    >
                      ×
                    </button>
                  )}
                </span>
              </label>
            ))}
          </div>
        </div>
      </section>
      <div className="flex justify-end">
        {isAdmin && (
          <button
            type="button"
            onClick={onSettings}
            className="min-h-11 shrink-0 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
          >
            재고 대상 설정
          </button>
        )}
      </div>
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="overflow-auto rounded-xl border border-gray-200">
          <table className="w-full min-w-[620px] border-collapse text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                {["품목 종류", "품목 코드", "품목명"].map((label) => (
                  <th
                    key={label}
                    className="border border-gray-200 px-4 py-3 text-left"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredItems.length ? (
                filteredItems.map((item) => (
                  <tr key={item.item_name}>
                    <td className="border border-gray-200 px-4 py-3">
                      {item.category_name ?? "미분류"}
                    </td>
                    <td className="border border-gray-200 px-4 py-3 font-mono text-gray-500">
                      {item.item_code}
                    </td>
                    <td className="border border-gray-200 px-4 py-3 font-medium">
                      {item.item_name}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={3}
                    className="px-4 py-12 text-center text-sm text-gray-400"
                  >
                    조건에 맞는 수량 미관리 품목이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

type TaxInvoiceStatus =
  | ""
  | "오베이프 세금계산서"
  | "이구베이프 세금계산서"
  | "오베이프 현금영수증"
  | "이구베이프 현금영수증"
  | "X";

const TAX_INVOICE_OPTIONS = [
  "오베이프 세금계산서",
  "이구베이프 세금계산서",
  "오베이프 현금영수증",
  "이구베이프 현금영수증",
  "X",
] as const satisfies readonly Exclude<TaxInvoiceStatus, "">[];

const getSupplierDefaultTaxInvoiceStatus = (
  note: string | null | undefined,
): TaxInvoiceStatus => {
  const match = (note ?? "").match(/\[\[default_tax_invoice:(.*?)\]\]/);
  const value = match?.[1] as TaxInvoiceStatus | undefined;
  return value && TAX_INVOICE_OPTIONS.some((option) => option === value)
    ? value
    : "";
};

const splitPurchaseOrderNote = (value: string | null | undefined) => {
  const note = value ?? "";
  const match = note.match(/^\[\[tax_invoice:(.*?)\]\]\r?\n?/);
  return {
    taxInvoiceStatus: (match?.[1] ?? "") as TaxInvoiceStatus,
    note: note.replace(/^\[\[tax_invoice:(.*?)\]\]\r?\n?/, ""),
  };
};

const mergePurchaseOrderNote = (status: TaxInvoiceStatus, note: string) =>
  [`[[tax_invoice:${status}]]`, note.trim()].filter(Boolean).join("\n");

function QuantityEditControl({
  value,
  min,
  disabled,
  onChange,
  onSave,
  onCancel,
}: {
  value: string;
  min: number;
  disabled?: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mx-auto flex h-11 w-full max-w-[92px] items-stretch gap-1">
      <input
        type="number"
        min={min}
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 flex-1 rounded-lg border border-brand-300 px-1 text-center font-semibold outline-none focus:ring-2 focus:ring-brand-100"
      />
      <div className="flex w-9 shrink-0 flex-col">
        <button
          type="button"
          disabled={disabled}
          onClick={onSave}
          className="min-h-0 flex-1 whitespace-nowrap rounded-t-md border border-brand-300 px-0.5 text-[9px] font-bold leading-none text-brand-700 hover:bg-brand-50 disabled:opacity-50"
        >
          저장
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-0 flex-1 whitespace-nowrap rounded-b-md border border-t-0 border-gray-200 px-0.5 text-[9px] font-bold leading-none text-gray-500 hover:bg-gray-50"
        >
          취소
        </button>
      </div>
    </div>
  );
}

function ReceiptManager({
  items: allItems,
  isAdmin,
  onSaved,
  focusOrderId,
}: {
  items: InventoryItem[];
  isAdmin: boolean;
  onSaved: () => Promise<void>;
  focusOrderId?: string | null;
}) {
  const items = allItems.filter((item) => item.is_tracked);
  const [nextId, setNextId] = useState(2);
  const [rows, setRows] = useState<ReceiptRow[]>([
    createEmptyReceiptRow(1, isAdmin),
  ]);
  const [note, setNote] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false);
  const supplierPickerRef = useRef<HTMLDivElement>(null);
  const [taxInvoiceStatus, setTaxInvoiceStatus] =
    useState<TaxInvoiceStatus>("");
  const [taxInvoiceSearch, setTaxInvoiceSearch] = useState("");
  const [taxInvoicePickerOpen, setTaxInvoicePickerOpen] = useState(false);
  const taxInvoicePickerRef = useRef<HTMLDivElement>(null);
  const [activeItemRow, setActiveItemRow] = useState<ReceiptRow["id"] | null>(
    null,
  );
  const [orderedOn, setOrderedOn] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingPurchaseOrder, setEditingPurchaseOrder] =
    useState<PurchaseOrder | null>(null);
  const [createStep, setCreateStep] = useState<1 | 2 | 3>(1);
  const [duplicateConfirmOpen, setDuplicateConfirmOpen] = useState(false);
  const [editingReceiptRow, setEditingReceiptRow] = useState<{
    row: ReceiptRow;
  } | null>(null);
  const [adjustments, setAdjustments] = useState<AdjustmentDraft[]>([]);
  const [reservationCustomerSearch, setReservationCustomerSearch] =
    useState("");
  useEffect(() => {
    if (!supplierPickerOpen) return;
    const closeSupplierPicker = (event: PointerEvent) => {
      if (!supplierPickerRef.current?.contains(event.target as Node)) {
        setSupplierPickerOpen(false);
      }
    };
    const closeSupplierPickerWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSupplierPickerOpen(false);
    };
    document.addEventListener("pointerdown", closeSupplierPicker);
    document.addEventListener("keydown", closeSupplierPickerWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeSupplierPicker);
      document.removeEventListener("keydown", closeSupplierPickerWithEscape);
    };
  }, [supplierPickerOpen]);
  useEffect(() => {
    if (!taxInvoicePickerOpen) return;
    const closeTaxInvoicePicker = (event: PointerEvent) => {
      if (!taxInvoicePickerRef.current?.contains(event.target as Node)) {
        setTaxInvoicePickerOpen(false);
      }
    };
    const closeTaxInvoicePickerWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTaxInvoicePickerOpen(false);
    };
    document.addEventListener("pointerdown", closeTaxInvoicePicker);
    document.addEventListener("keydown", closeTaxInvoicePickerWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeTaxInvoicePicker);
      document.removeEventListener("keydown", closeTaxInvoicePickerWithEscape);
    };
  }, [taxInvoicePickerOpen]);
  const suppliersQuery = useQuery({
    queryKey: [...inventoryKeys.suppliers, isAdmin],
    queryFn: () => getInventorySuppliers(isAdmin),
  });
  const ordersQuery = useQuery({
    queryKey: [...inventoryKeys.purchaseOrders, isAdmin],
    queryFn: () => getPurchaseOrders(isAdmin),
  });
  const adjustmentCategoriesQuery = useQuery({
    queryKey: inventoryKeys.purchaseAdjustmentCategories,
    queryFn: () => getPurchaseAdjustmentCategories(false),
    enabled: isAdmin,
  });
  const receiveMutation = useMutation({
    mutationFn: async () => {
      const normalizedLines = rows
        .slice(0, -1)
        .filter((row) => row.itemName && Number(row.quantity) > 0)
        .map((row) => ({
          id: row.id,
          item_name: row.itemName,
          quantity: Number(row.quantity),
          unit_price: row.unitPrice ? Number(row.unitPrice) : null,
          note: row.note,
          handling_type: row.handlingType,
          handling_note: row.handlingNote.trim() || null,
          customer_id: row.customerId || null,
          reservation_log_id: row.reservationLogId || null,
        }));
      const normalizedAdjustments = adjustments
        .filter((row) => row.categoryName.trim() && Number(row.amount) >= 0)
        .map((row) => ({
          category_id: row.categoryId || null,
          category_name: row.categoryName,
          kind: row.kind,
          amount: Math.floor(Number(row.amount)),
          note: row.note.trim() || null,
        }));

      if (editingPurchaseOrder) {
        await updatePurchaseOrderDetails({
          orderId: editingPurchaseOrder.id,
          supplierId,
          orderedOn,
          note: mergePurchaseOrderNote(taxInvoiceStatus, note),
          lines: normalizedLines.map((line) => ({
            id: typeof line.id === "string" ? line.id : null,
            item_name: line.item_name,
            ordered_quantity: line.quantity,
            unit_price: line.unit_price,
            note: line.note,
            handling_type: line.handling_type,
            handling_note: line.handling_note,
            customer_id: line.customer_id,
            reservation_log_id: line.reservation_log_id,
          })),
          receipts: editingPurchaseOrder.inventory_purchase_receipts.map(
            (receipt) => ({
              id: receipt.id,
              arrived_on: receipt.arrived_on,
              note: receipt.note ?? "",
            }),
          ),
        });
        if (isAdmin) {
          await savePurchaseOrderAdjustments(
            editingPurchaseOrder.id,
            normalizedAdjustments,
          );
        }
        return editingPurchaseOrder.id;
      }

      return createPurchaseOrder(
        supplierId,
        orderedOn,
        mergePurchaseOrderNote(taxInvoiceStatus, note),
        normalizedLines,
        normalizedAdjustments,
      );
    },
    onSuccess: async () => {
      toast.success(
        editingPurchaseOrder
          ? "입고 예정 내용을 수정했습니다."
          : "입고 예정으로 등록했습니다.",
      );
      setRows([createEmptyReceiptRow(nextId, isAdmin)]);
      setNextId((id) => id + 1);
      setNote("");
      setAdjustments([]);
      setReservationCustomerSearch("");
      setTaxInvoiceStatus("");
      setTaxInvoiceSearch("");
      setTaxInvoicePickerOpen(false);
      setCreateOpen(false);
      setEditingPurchaseOrder(null);
      setCreateStep(1);
      await ordersQuery.refetch();
      await onSaved();
    },
    onError: (error) =>
      toast.error(error.message || "입고 예정 등록에 실패했습니다."),
  });
  const draftRow = rows[rows.length - 1];
  const reservationCustomersQuery = useQuery({
    queryKey: ["inventory", "reservation-customers", reservationCustomerSearch],
    queryFn: () => searchReservationCustomers(reservationCustomerSearch),
    enabled:
      createOpen &&
      draftRow?.handlingType === "reservation" &&
      !draftRow?.customerId &&
      reservationCustomerSearch.trim().length > 0,
  });
  const reservationHistoriesQuery = useQuery({
    queryKey: ["inventory", "customer-reservations", draftRow?.customerId],
    queryFn: () => getCustomerReservationHistories(draftRow?.customerId ?? ""),
    enabled:
      createOpen &&
      draftRow?.handlingType === "reservation" &&
      Boolean(draftRow?.customerId),
  });
  const committedRows = rows.slice(0, -1);
  const validRows = committedRows.filter(
    (row) =>
      items.some((item) => item.item_name === row.itemName) &&
      Number(row.quantity) > 0,
  );
  const hasDuplicateItems =
    new Set(validRows.map((row) => row.itemName)).size !== validRows.length;
  const hasInvalidAdjustments = adjustments.some(
    (row) =>
      !row.categoryId ||
      !Number.isInteger(Number(row.amount)) ||
      Number(row.amount) < 0,
  );
  const selectedSupplier = (suppliersQuery.data ?? []).find(
    (supplier) => supplier.id === supplierId,
  );
  const supplierSuggestions = (suppliersQuery.data ?? [])
    .filter((supplier) => supplier.is_use)
    .filter((supplier) =>
      supplier.name
        .toLocaleLowerCase("ko-KR")
        .includes(supplierSearch.trim().toLocaleLowerCase("ko-KR")),
    );
  const taxInvoiceSuggestions = TAX_INVOICE_OPTIONS.filter((option) =>
    option
      .toLocaleLowerCase("ko-KR")
      .includes(taxInvoiceSearch.trim().toLocaleLowerCase("ko-KR")),
  );

  const selectSupplier = (supplier: InventorySupplier) => {
    setSupplierId(supplier.id);
    setSupplierSearch(supplier.name);
    setSupplierPickerOpen(false);

    const savedTaxInvoiceStatus = getSupplierDefaultTaxInvoiceStatus(
      supplier.note,
    );
    if (!savedTaxInvoiceStatus) return;

    const shouldLoad = window.confirm(
      `저장된 발행 종류(${savedTaxInvoiceStatus})를 불러오시겠습니까?\n\nA/S 입고나 스티커 처리 시 아니오를 클릭하고 발행 종류를 X로 선택해 주세요.`,
    );
    if (shouldLoad) {
      setTaxInvoiceStatus(savedTaxInvoiceStatus);
      setTaxInvoiceSearch(savedTaxInvoiceStatus);
      setTaxInvoicePickerOpen(false);
      return;
    }

    setTaxInvoiceStatus("");
    setTaxInvoiceSearch("");
    setTaxInvoicePickerOpen(true);
  };

  const commitDraftRow = () => {
    setRows((current) => {
      if (!editingReceiptRow) {
        return [...current, createEmptyReceiptRow(nextId, isAdmin)];
      }
      const draft = current[current.length - 1];
      return [
        ...current
          .slice(0, -1)
          .map((row) =>
            row.id === editingReceiptRow.row.id ? { ...draft } : row,
          ),
        createEmptyReceiptRow(nextId, isAdmin),
      ];
    });
    setNextId((id) => id + 1);
    setReservationCustomerSearch("");
    setEditingReceiptRow(null);
  };

  const addRow = () => {
    if (
      !draftRow ||
      !items.some((item) => item.item_name === draftRow.itemName) ||
      Number(draftRow.quantity) < 1
    ) {
      toast.error("품목명과 수량을 확인해 주세요.");
      return;
    }
    if (
      committedRows.some(
        (row) =>
          row.itemName === draftRow.itemName &&
          row.id !== editingReceiptRow?.row.id,
      )
    ) {
      setDuplicateConfirmOpen(true);
      return;
    }
    if (
      draftRow.handlingType === "reservation" &&
      (!draftRow.customerId || !draftRow.reservationLogId)
    ) {
      toast.error("예약 고객과 예약 이력을 선택해 주세요.");
      return;
    }
    if (draftRow.handlingType === "memo" && !draftRow.handlingNote.trim()) {
      toast.error("품목 메모를 입력해 주세요.");
      return;
    }
    commitDraftRow();
  };

  const addAdjustment = (kind: PurchaseAdjustmentKind) => {
    const usedIds = new Set(adjustments.map((row) => row.categoryId));
    const category = (adjustmentCategoriesQuery.data ?? []).find(
      (item) => item.kind === kind && item.is_active && !usedIds.has(item.id),
    );
    if (!category) {
      toast.error("추가할 수 있는 거래 항목이 없습니다.");
      return;
    }
    setAdjustments((current) => [
      ...current,
      {
        key: `create-${kind}-${Date.now()}`,
        categoryId: category.id,
        categoryName: category.name,
        kind,
        amount: "0",
        note: "",
      },
    ]);
  };

  const updateAdjustment = (key: string, values: Partial<AdjustmentDraft>) =>
    setAdjustments((current) =>
      current.map((row) => (row.key === key ? { ...row, ...values } : row)),
    );

  const editReceiptRow = (target: ReceiptRow) => {
    setEditingReceiptRow({ row: { ...target } });
    setRows((current) => [...current.slice(0, -1), { ...target }]);
    setReservationCustomerSearch(target.customerName || "");
    setActiveItemRow(null);
  };

  const cancelReceiptRowEdit = () => {
    if (!editingReceiptRow) return;
    setRows((current) => {
      const committed = current.slice(0, -1);
      return [...committed, createEmptyReceiptRow(nextId, isAdmin)];
    });
    setNextId((id) => id + 1);
    setEditingReceiptRow(null);
    setReservationCustomerSearch("");
    setActiveItemRow(null);
  };

  const moveReceiptRow = (index: number, direction: -1 | 1) => {
    setRows((current) => {
      const draft = current[current.length - 1];
      const committed = current.slice(0, -1);
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= committed.length) return current;
      const nextCommitted = [...committed];
      [nextCommitted[index], nextCommitted[nextIndex]] = [
        nextCommitted[nextIndex],
        nextCommitted[index],
      ];
      return [...nextCommitted, draft];
    });
  };

  const openCreate = () => {
    setEditingPurchaseOrder(null);
    setSupplierId("");
    setSupplierSearch("");
    setSupplierPickerOpen(false);
    setTaxInvoiceStatus("");
    setTaxInvoiceSearch("");
    setTaxInvoicePickerOpen(false);
    setRows([createEmptyReceiptRow(nextId, isAdmin)]);
    setNextId((id) => id + 1);
    setNote("");
    setAdjustments([]);
    setReservationCustomerSearch("");
    setActiveItemRow(null);
    setDuplicateConfirmOpen(false);
    setEditingReceiptRow(null);
    setCreateStep(1);
    setCreateOpen(true);
  };

  const openEditPurchaseOrder = (order: PurchaseOrder) => {
    const parsedNote = splitPurchaseOrderNote(order.note);
    const supplier = (suppliersQuery.data ?? []).find(
      (item) => item.id === order.supplier_id,
    );
    setEditingPurchaseOrder(order);
    setSupplierId(order.supplier_id);
    setSupplierSearch(supplier?.name ?? order.inventory_suppliers?.name ?? "");
    setSupplierPickerOpen(false);
    setOrderedOn(order.ordered_on);
    setTaxInvoiceStatus(parsedNote.taxInvoiceStatus);
    setTaxInvoiceSearch(parsedNote.taxInvoiceStatus);
    setTaxInvoicePickerOpen(false);
    setNote(parsedNote.note);
    setRows([
      ...order.inventory_purchase_order_lines.map((line) => {
        const legacyDemoSource = isLegacyDemoMemo(line.note) ? line.note : null;
        const isLegacyDemo =
          line.handling_type === "none" && Boolean(legacyDemoSource);
        return {
          id: line.id,
          itemName: line.item_name,
          quantity: String(line.ordered_quantity),
          unitPrice: line.unit_price == null ? "" : String(line.unit_price),
          note: line.note ?? "",
          handlingType: isLegacyDemo ? "demo" : (line.handling_type ?? "none"),
          handlingNote:
            line.handling_note ??
            (isLegacyDemo ? getLegacyDemoNote(legacyDemoSource) : ""),
          customerId: line.customer_id ?? "",
          customerName: "",
          reservationLogId: line.reservation_log_id ?? "",
        };
      }),
      createEmptyReceiptRow(nextId, isAdmin),
    ]);
    setNextId((id) => id + 1);
    setAdjustments(
      (order.inventory_purchase_order_adjustments ?? []).map((item) => ({
        key: item.id,
        categoryId: item.category_id ?? "",
        categoryName: item.category_name,
        kind: item.kind,
        amount: String(item.amount),
        note: item.note ?? "",
      })),
    );
    setReservationCustomerSearch("");
    setActiveItemRow(null);
    setDuplicateConfirmOpen(false);
    setEditingReceiptRow(null);
    setCreateStep(2);
    setCreateOpen(true);
  };

  return (
    <div>
      {createOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-gray-950/45 p-3 sm:p-6">
          <section
            className={`flex h-[min(780px,calc(100vh-24px))] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl transition-[max-width] ${createStep === 2 ? "max-w-6xl" : "max-w-3xl"}`}
          >
            <header className="flex items-center justify-between border-b border-gray-100 px-5 py-4 sm:px-7">
              <h2 className="text-xl font-bold text-gray-950">
                {editingPurchaseOrder ? "입고 예정 수정" : "입고 예정 등록"}
              </h2>
              <button
                type="button"
                aria-label="닫기"
                onClick={() => setCreateOpen(false)}
                className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-2xl text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                ×
              </button>
            </header>
            <div
              className={`flex-1 px-5 py-5 sm:px-7 sm:py-6 ${createStep === 1 ? "overflow-visible" : "overflow-y-auto"}`}
            >
              <div className="mx-auto mb-7 flex max-w-md items-start">
                {([1, 2, 3] as const).map((step, index) => (
                  <div
                    key={step}
                    className="flex flex-1 items-start last:flex-none"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-bold ${createStep >= step ? "border-brand-500 bg-brand-500 text-white" : "border-gray-200 bg-gray-100 text-gray-400"}`}
                      >
                        {createStep > step ? "✓" : step}
                      </div>
                      <span
                        className={`whitespace-nowrap text-xs font-semibold ${createStep >= step ? "text-brand-600" : "text-gray-400"}`}
                      >
                        {step === 1
                          ? "기본 정보"
                          : step === 2
                            ? "품목 · 수량"
                            : "최종 확인"}
                      </span>
                    </div>
                    {index < 2 && (
                      <div
                        className={`mt-5 h-0.5 flex-1 ${createStep > step ? "bg-brand-500" : "bg-gray-200"}`}
                      />
                    )}
                  </div>
                ))}
              </div>

              {createStep === 1 && (
                <div className="mx-auto max-w-3xl rounded-2xl border border-gray-200 bg-gray-50 p-5 sm:p-6">
                  <h3 className="font-bold text-gray-900">주문 기본 정보</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    주문일, 거래처와 발행 종류를 선택해 주세요.
                  </p>
                  <div className="mt-5 grid max-w-md gap-4">
                    <label className="order-2 text-sm font-medium text-gray-700">
                      거래처 <span className="text-brand-500">*</span>
                      <div ref={supplierPickerRef} className="relative mt-1">
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
                          onChange={(event) => {
                            setSupplierSearch(event.target.value);
                            setSupplierId("");
                            setSupplierPickerOpen(true);
                          }}
                          placeholder="거래처명을 검색하세요"
                          className="min-h-11 w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-9 pr-10 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                        />
                        {supplierSearch && (
                          <button
                            type="button"
                            onClick={() => {
                              setSupplierSearch("");
                              setSupplierId("");
                              setSupplierPickerOpen(false);
                            }}
                            aria-label="거래처명 지우기"
                            className="absolute right-2 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-gray-100 text-base font-medium text-gray-500 transition hover:bg-gray-200 hover:text-gray-700"
                          >
                            ×
                          </button>
                        )}
                        {supplierPickerOpen && (
                          <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-xl">
                            {supplierSuggestions.length ? (
                              supplierSuggestions.map((supplier) => (
                                <button
                                  type="button"
                                  key={supplier.id}
                                  onPointerDown={(event) => {
                                    event.preventDefault();
                                    selectSupplier(supplier);
                                  }}
                                  onKeyDown={(event) => {
                                    if (
                                      event.key === "Enter" ||
                                      event.key === " "
                                    ) {
                                      event.preventDefault();
                                      selectSupplier(supplier);
                                    }
                                  }}
                                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 text-left text-sm hover:bg-brand-50"
                                >
                                  <span className="font-semibold text-gray-900">
                                    {supplier.name}
                                  </span>
                                  <span className="shrink-0 text-xs text-gray-400">
                                    {supplier.courier_company ||
                                      "택배사 미등록"}
                                  </span>
                                </button>
                              ))
                            ) : (
                              <p className="px-3 py-4 text-center text-sm text-gray-400">
                                검색 결과가 없습니다.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      <select
                        value={supplierId}
                        onChange={(event) => setSupplierId(event.target.value)}
                        className="hidden"
                      >
                        <option value="">거래처 선택</option>
                        {(suppliersQuery.data ?? [])
                          .filter((supplier) => supplier.is_use)
                          .map((supplier) => (
                            <option key={supplier.id} value={supplier.id}>
                              {supplier.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="order-1 text-sm font-medium text-gray-700">
                      주문일 <span className="text-brand-500">*</span>
                      <div className="mt-1">
                        <KoreanDatePicker
                          value={orderedOn}
                          onChange={setOrderedOn}
                          selectedLabel="주문일"
                        />
                      </div>
                    </label>
                    <div className="order-3 text-sm font-medium text-gray-700">
                      발행 종류 <span className="text-brand-500">*</span>
                      <div
                        ref={taxInvoicePickerRef}
                        className="relative mt-1 w-full"
                      >
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
                          value={taxInvoiceSearch}
                          onFocus={() => setTaxInvoicePickerOpen(true)}
                          onChange={(event) => {
                            setTaxInvoiceSearch(event.target.value);
                            setTaxInvoiceStatus("");
                            setTaxInvoicePickerOpen(true);
                          }}
                          placeholder="발행 종류를 검색하세요"
                          className="min-h-11 w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-9 pr-10 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                        />
                        {taxInvoiceSearch && (
                          <button
                            type="button"
                            onClick={() => {
                              setTaxInvoiceSearch("");
                              setTaxInvoiceStatus("");
                              setTaxInvoicePickerOpen(false);
                            }}
                            aria-label="발행 종류 선택 지우기"
                            className="absolute right-2 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-gray-100 text-base font-medium text-gray-500 transition hover:bg-gray-200 hover:text-gray-700"
                          >
                            ×
                          </button>
                        )}
                        {taxInvoicePickerOpen && (
                          <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-xl">
                            {taxInvoiceSuggestions.length ? (
                              taxInvoiceSuggestions.map((option) => (
                                <button
                                  type="button"
                                  key={option}
                                  onClick={() => {
                                    setTaxInvoiceStatus(option);
                                    setTaxInvoiceSearch(option);
                                    setTaxInvoicePickerOpen(false);
                                  }}
                                  className="flex min-h-11 w-full items-center justify-between rounded-lg px-3 text-left text-sm font-semibold text-gray-900 hover:bg-brand-50"
                                >
                                  {option}
                                  {taxInvoiceStatus === option && (
                                    <span className="text-brand-500">✓</span>
                                  )}
                                </button>
                              ))
                            ) : (
                              <p className="px-3 py-4 text-center text-sm text-gray-400">
                                검색 결과가 없습니다.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {createStep === 2 && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-gray-200 bg-gray-50/70 px-4 py-3 text-sm text-gray-700">
                    <strong>{selectedSupplier?.name}</strong>
                    <span className="mx-2 text-gray-300">|</span>주문일{" "}
                    {orderedOn}
                  </div>
                  <div className="overflow-visible">
                    {rows.slice(-1).map((row) => (
                      <div
                        key={row.id}
                        className="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 lg:grid-cols-2 lg:items-stretch"
                      >
                        <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(270px,1fr)]">
                          <div className="block min-w-0">
                            <span className="mb-1 block text-sm font-medium text-gray-700">
                              품목 선택 <span className="text-rose-600">*</span>
                            </span>
                            <div className="relative">
                              <svg
                                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
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
                                value={row.itemName}
                                onFocus={() => setActiveItemRow(row.id)}
                                onChange={(event) => {
                                  setRows((current) =>
                                    current.map((item) =>
                                      item.id === row.id
                                        ? {
                                            ...item,
                                            itemName: event.target.value,
                                          }
                                        : item,
                                    ),
                                  );
                                  setActiveItemRow(row.id);
                                }}
                                placeholder="품목명을 검색하세요"
                                className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-10 text-sm font-medium text-gray-900 shadow-sm outline-none transition placeholder:font-normal placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                              />
                              {activeItemRow === row.id &&
                                row.itemName.trim() && (
                                  <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-xl">
                                    {items
                                      .filter((item) => {
                                        const keyword = row.itemName
                                          .trim()
                                          .toLocaleLowerCase("ko-KR");
                                        return item.item_name
                                          .toLocaleLowerCase("ko-KR")
                                          .includes(keyword);
                                      })
                                      .slice(0, 30)
                                      .map((item) => (
                                        <button
                                          type="button"
                                          key={item.item_name}
                                          onPointerDown={(event) => {
                                            event.preventDefault();
                                            setRows((current) =>
                                              current.map((currentRow) =>
                                                currentRow.id === row.id
                                                  ? {
                                                      ...currentRow,
                                                      itemName: item.item_name,
                                                    }
                                                  : currentRow,
                                              ),
                                            );
                                            setActiveItemRow(null);
                                          }}
                                          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 text-left text-sm hover:bg-brand-50"
                                        >
                                          <span>
                                            <strong className="text-gray-900">
                                              {item.item_name}
                                            </strong>
                                          </span>
                                          <span className="shrink-0 text-xs font-semibold text-gray-500">
                                            현재 {item.quantity}개
                                          </span>
                                        </button>
                                      ))}
                                  </div>
                                )}
                            </div>
                          </div>
                          <div>
                            <span className="mb-1 block text-sm font-medium text-gray-700">
                              수량
                            </span>
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                inputMode="numeric"
                                aria-label="주문 수량"
                                value={row.quantity}
                                onChange={(event) =>
                                  setRows((current) =>
                                    current.map((item) =>
                                      item.id === row.id
                                        ? {
                                            ...item,
                                            quantity:
                                              event.target.value === ""
                                                ? "1"
                                                : event.target.value
                                                    .replace(/\D/g, "")
                                                    .slice(0, 3),
                                          }
                                        : item,
                                    ),
                                  )
                                }
                                className="h-10 w-16 rounded-lg border border-gray-300 px-3 text-center text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-500"
                              />
                              <button
                                type="button"
                                aria-label="수량 감소"
                                onClick={() =>
                                  setRows((current) =>
                                    current.map((item) =>
                                      item.id === row.id
                                        ? {
                                            ...item,
                                            quantity: String(
                                              Math.max(
                                                1,
                                                Number(item.quantity || 1) - 1,
                                              ),
                                            ),
                                          }
                                        : item,
                                    ),
                                  )
                                }
                                className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 bg-white text-lg leading-none text-gray-600 transition-colors hover:bg-gray-50 active:bg-gray-100"
                              >
                                −
                              </button>
                              <button
                                type="button"
                                aria-label="수량 증가"
                                onClick={() =>
                                  setRows((current) =>
                                    current.map((item) =>
                                      item.id === row.id
                                        ? {
                                            ...item,
                                            quantity: String(
                                              Math.min(
                                                999,
                                                Number(item.quantity || 0) + 1,
                                              ),
                                            ),
                                          }
                                        : item,
                                    ),
                                  )
                                }
                                className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500 text-lg leading-none text-white transition-colors hover:bg-brand-600 active:bg-brand-700"
                              >
                                +
                              </button>
                              {editingReceiptRow && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="gray"
                                  onClick={cancelReceiptRowEdit}
                                  className="h-10"
                                >
                                  취소
                                </Button>
                              )}
                              <Button
                                type="button"
                                size="sm"
                                onClick={addRow}
                                className="h-10"
                              >
                                {editingReceiptRow ? "저장" : "추가"}
                              </Button>
                            </div>
                          </div>
                        </div>

                        <div
                          className={`relative space-y-3 lg:col-start-2 lg:flex lg:flex-col lg:justify-center lg:pl-3 lg:before:absolute lg:before:left-0 lg:before:top-1/4 lg:before:h-1/2 lg:before:w-px lg:before:bg-gray-200 ${
                            row.handlingType === "none"
                              ? "lg:justify-center"
                              : "lg:justify-start"
                          }`}
                        >
                          <select
                            aria-label="처리 구분"
                            value={row.handlingType}
                            onChange={(event) => {
                              const handlingType = event.target
                                .value as ReceiptRow["handlingType"];
                              setRows((current) =>
                                current.map((item) =>
                                  item.id === row.id
                                    ? {
                                        ...item,
                                        handlingType,
                                        handlingNote: "",
                                        note:
                                          handlingType === "none"
                                            ? clearLegacyDemoMemo(item.note)
                                            : item.note,
                                        customerId: "",
                                        customerName: "",
                                        reservationLogId: "",
                                      }
                                    : item,
                                ),
                              );
                              setReservationCustomerSearch("");
                            }}
                            className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold sm:hidden"
                          >
                            {PURCHASE_HANDLING_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <div className="hidden grid-cols-6 gap-1.5 sm:grid">
                            {PURCHASE_HANDLING_OPTIONS.map((option) => (
                              <Button
                                key={option.value}
                                type="button"
                                size="xs"
                                variant={
                                  row.handlingType === option.value
                                    ? "primary"
                                    : "gray"
                                }
                                onClick={() => {
                                  setRows((current) =>
                                    current.map((item) =>
                                      item.id === row.id
                                        ? {
                                            ...item,
                                            handlingType: option.value,
                                            handlingNote: "",
                                            note:
                                              option.value === "none"
                                                ? clearLegacyDemoMemo(item.note)
                                                : item.note,
                                            customerId: "",
                                            customerName: "",
                                            reservationLogId: "",
                                          }
                                        : item,
                                    ),
                                  );
                                  setReservationCustomerSearch("");
                                }}
                                className="h-8 py-1"
                              >
                                {option.label}
                              </Button>
                            ))}
                          </div>

                          {(row.handlingType === "demo" ||
                            row.handlingType === "memo") && (
                            <div className="mt-3 max-w-xl">
                              <input
                                aria-label={
                                  row.handlingType === "demo"
                                    ? "시연용 처리 메모"
                                    : "품목 메모"
                                }
                                value={row.handlingNote}
                                onChange={(event) =>
                                  setRows((current) =>
                                    current.map((item) =>
                                      item.id === row.id
                                        ? {
                                            ...item,
                                            handlingNote: event.target.value,
                                          }
                                        : item,
                                    ),
                                  )
                                }
                                placeholder={
                                  row.handlingType === "demo"
                                    ? "시연용 처리 내용을 입력하세요. (선택)"
                                    : "품목 메모를 입력하세요."
                                }
                                className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm shadow-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                              />
                            </div>
                          )}

                          {row.handlingType === "reservation" && (
                            <div className="mt-3 grid gap-3 rounded-xl border border-gray-200 bg-white p-3 lg:grid-cols-2">
                              <div>
                                <div>
                                  <input
                                    aria-label="고객 검색"
                                    value={reservationCustomerSearch}
                                    onChange={(event) => {
                                      setReservationCustomerSearch(
                                        event.target.value,
                                      );
                                      setRows((current) =>
                                        current.map((item) =>
                                          item.id === row.id
                                            ? {
                                                ...item,
                                                customerId: "",
                                                customerName: "",
                                                reservationLogId: "",
                                              }
                                            : item,
                                        ),
                                      );
                                    }}
                                    placeholder="고객명 또는 전화번호"
                                    className="mt-1.5 h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                                  />
                                </div>
                                {reservationCustomerSearch.trim() &&
                                  !row.customerId && (
                                    <div className="mt-1 max-h-36 overflow-y-auto rounded-lg border border-gray-200 p-1">
                                      {(
                                        reservationCustomersQuery.data ?? []
                                      ).map((customer) => (
                                        <button
                                          key={customer.id}
                                          type="button"
                                          onClick={() => {
                                            setRows((current) =>
                                              current.map((item) =>
                                                item.id === row.id
                                                  ? {
                                                      ...item,
                                                      customerId: customer.id,
                                                      customerName:
                                                        customer.name,
                                                      reservationLogId: "",
                                                    }
                                                  : item,
                                              ),
                                            );
                                            setReservationCustomerSearch(
                                              `${customer.name} · ${customer.phone}`,
                                            );
                                          }}
                                          className="flex min-h-10 w-full items-center justify-between rounded-md px-2 text-left text-xs hover:bg-brand-50"
                                        >
                                          <strong>{customer.name}</strong>
                                          <span className="text-gray-500">
                                            {customer.phone}
                                          </span>
                                        </button>
                                      ))}
                                    </div>
                                  )}
                              </div>
                              <div>
                                <div className="mt-1.5 max-h-44 overflow-y-auto rounded-lg border border-gray-200 p-1">
                                  {row.customerId ? (
                                    (reservationHistoriesQuery.data ?? [])
                                      .length ? (
                                      (
                                        reservationHistoriesQuery.data ?? []
                                      ).map((history) => (
                                        <button
                                          key={history.id}
                                          type="button"
                                          onClick={() =>
                                            setRows((current) =>
                                              current.map((item) =>
                                                item.id === row.id
                                                  ? {
                                                      ...item,
                                                      reservationLogId:
                                                        history.id,
                                                    }
                                                  : item,
                                              ),
                                            )
                                          }
                                          className={`block min-h-11 w-full rounded-md px-2 py-1.5 text-left text-xs ${
                                            row.reservationLogId === history.id
                                              ? "bg-brand-50 text-brand-700 ring-1 ring-brand-300"
                                              : "hover:bg-gray-50"
                                          }`}
                                        >
                                          <strong>
                                            {new Date(
                                              history.created_at,
                                            ).toLocaleDateString("ko-KR")}
                                          </strong>
                                          <span className="ml-2 text-gray-500">
                                            {history.note || "예약 메모 없음"}
                                          </span>
                                        </button>
                                      ))
                                    ) : (
                                      <p className="p-3 text-center text-xs text-gray-400">
                                        연결할 예약 이력이 없습니다.
                                      </p>
                                    )
                                  ) : (
                                    <p className="p-3 text-center text-xs text-gray-400">
                                      고객을 먼저 선택해 주세요.
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="lg:col-span-2">
                                <input
                                  aria-label="예약 연결 메모"
                                  value={row.handlingNote}
                                  onChange={(event) =>
                                    setRows((current) =>
                                      current.map((item) =>
                                        item.id === row.id
                                          ? {
                                              ...item,
                                              handlingNote: event.target.value,
                                            }
                                          : item,
                                      ),
                                    )
                                  }
                                  placeholder="예약 연결 관련 메모를 입력하세요. (선택)"
                                  className="mt-1.5 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <div className="mb-2 flex items-center gap-3">
                        <span className="text-sm font-medium text-gray-700">
                          품목 목록 <span className="text-rose-600">*</span>
                        </span>
                        {validRows.length > 0 && (
                          <span className="text-xs text-gray-500">
                            {new Set(validRows.map((row) => row.itemName)).size}
                            종 · 총{" "}
                            {validRows.reduce(
                              (sum, row) => sum + Number(row.quantity),
                              0,
                            )}
                            개
                          </span>
                        )}
                      </div>
                      <div className="min-h-24">
                        {validRows.length === 0 ? (
                          <p className="text-sm text-gray-400">
                            추가된 품목이 없습니다.
                          </p>
                        ) : (
                          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                            <table className="w-full min-w-[650px] table-fixed text-sm">
                              <thead className="bg-gray-50 text-xs font-semibold text-gray-600">
                                <tr className="border-b border-gray-200">
                                  <th className="w-[7%] px-2 py-2 text-center">
                                    번호
                                  </th>
                                  <th className="w-[43%] px-2 py-2 text-left">
                                    품목명
                                  </th>
                                  <th className="w-[13%] px-2 py-2 text-center">
                                    품목종류
                                  </th>
                                  <th className="w-[12%] px-2 py-2 text-center">
                                    처리 유형
                                  </th>
                                  <th className="w-[8%] px-2 py-2 text-center">
                                    수량
                                  </th>
                                  <th className="w-[17%] px-3 py-2 text-center">
                                    작업
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {validRows.map((row, index) => {
                                  const handlingLabel =
                                    PURCHASE_HANDLING_OPTIONS.find(
                                      (option) =>
                                        option.value === row.handlingType,
                                    )?.label ?? "미입력";
                                  const categoryName =
                                    items.find(
                                      (item) => item.item_name === row.itemName,
                                    )?.category_name ?? "미분류";
                                  return (
                                    <tr
                                      key={row.id}
                                      className="border-b border-gray-200 last:border-b-0"
                                    >
                                      <td className="px-2 py-2">
                                        <span className="mx-auto flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-xs font-semibold leading-none text-white">
                                          {index + 1}
                                        </span>
                                      </td>
                                      <td className="px-2 py-2 font-medium text-gray-900">
                                        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                                          <span className="break-words">
                                            {row.itemName}
                                          </span>
                                          {(row.handlingNote ||
                                            row.customerName) && (
                                            <span className="break-words text-xs font-normal text-gray-500">
                                              (
                                              {[
                                                row.customerName,
                                                row.handlingNote,
                                              ]
                                                .filter(Boolean)
                                                .join(", ")}
                                              )
                                            </span>
                                          )}
                                        </div>
                                      </td>
                                      <td className="px-2 py-2 text-center text-xs font-medium text-gray-600">
                                        {categoryName}
                                      </td>
                                      <td className="px-2 py-2 text-center">
                                        <span
                                          className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ${
                                            row.handlingType === "demo"
                                              ? "bg-brand-50 text-brand-700"
                                              : row.handlingType ===
                                                  "reservation"
                                                ? "bg-sky-50 text-sky-700"
                                                : "bg-gray-100 text-gray-600"
                                          }`}
                                        >
                                          {handlingLabel}
                                        </span>
                                      </td>
                                      <td className="px-2 py-2 text-center font-medium text-gray-800">
                                        {Number(row.quantity).toLocaleString()}
                                        개
                                      </td>
                                      <td className="px-3 py-2">
                                        <div className="flex items-center justify-center gap-1">
                                          <Button
                                            type="button"
                                            variant="secondary"
                                            size="xs"
                                            onClick={() => editReceiptRow(row)}
                                          >
                                            ✏️
                                          </Button>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              moveReceiptRow(index, -1)
                                            }
                                            disabled={index === 0}
                                            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-gray-200 bg-white text-xs font-semibold text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-35"
                                            aria-label={`${row.itemName} 위로 이동`}
                                          >
                                            ↑
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              moveReceiptRow(index, 1)
                                            }
                                            disabled={
                                              index === validRows.length - 1
                                            }
                                            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-gray-200 bg-white text-xs font-semibold text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-35"
                                            aria-label={`${row.itemName} 아래로 이동`}
                                          >
                                            ↓
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setRows((current) =>
                                                current.filter(
                                                  (item) => item.id !== row.id,
                                                ),
                                              )
                                            }
                                            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-xs font-semibold text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                                            aria-label={`${row.itemName} 삭제`}
                                          >
                                            X
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    {(["discount", "payment"] as const).map((kind) => (
                      <section
                        key={kind}
                        className="rounded-xl border border-gray-200 bg-gray-50/70 p-4"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-sm font-bold text-gray-900">
                            {kind === "discount" ? "할인 항목" : "지불 항목"}
                          </h3>
                          <Button
                            size="xs"
                            variant="gray"
                            disabled={!isAdmin}
                            onClick={() => addAdjustment(kind)}
                          >
                            {kind === "discount"
                              ? "할인 항목 추가"
                              : "지불 항목 추가"}
                          </Button>
                        </div>
                        <div className="mt-3 space-y-2">
                          {adjustments
                            .filter((row) => row.kind === kind)
                            .map((adjustment) => (
                              <div
                                key={adjustment.key}
                                className="space-y-2 rounded-lg border border-gray-200 bg-white p-2"
                              >
                                <Dropdown
                                  controlledValue={adjustment.categoryId}
                                >
                                  <Dropdown.Trigger compact>
                                    {adjustment.categoryName || "항목 선택"}
                                  </Dropdown.Trigger>
                                  <Dropdown.Content compact>
                                    {(adjustmentCategoriesQuery.data ?? [])
                                      .filter(
                                        (category) =>
                                          category.kind === kind &&
                                          category.is_active &&
                                          (category.id ===
                                            adjustment.categoryId ||
                                            !adjustments.some(
                                              (row) =>
                                                row.key !== adjustment.key &&
                                                row.categoryId === category.id,
                                            )),
                                      )
                                      .map((category) => (
                                        <Dropdown.Item
                                          key={category.id}
                                          compact
                                          option={{
                                            value: category.id,
                                            label: category.name,
                                          }}
                                          onSelect={() =>
                                            updateAdjustment(adjustment.key, {
                                              categoryId: category.id,
                                              categoryName: category.name,
                                            })
                                          }
                                        />
                                      ))}
                                  </Dropdown.Content>
                                </Dropdown>
                                <div className="flex gap-2">
                                  <div className="relative min-w-0 flex-1">
                                    <input
                                      type="number"
                                      min="0"
                                      value={adjustment.amount}
                                      onChange={(event) =>
                                        updateAdjustment(adjustment.key, {
                                          amount: event.target.value,
                                        })
                                      }
                                      className="h-10 w-full rounded-lg border border-gray-300 px-3 pr-7 text-right text-sm font-semibold outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                                    />
                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                                      원
                                    </span>
                                  </div>
                                  <Button
                                    size="xs"
                                    variant="danger"
                                    onClick={() =>
                                      setAdjustments((current) =>
                                        current.filter(
                                          (row) => row.key !== adjustment.key,
                                        ),
                                      )
                                    }
                                  >
                                    삭제
                                  </Button>
                                </div>
                                <input
                                  value={adjustment.note}
                                  onChange={(event) =>
                                    updateAdjustment(adjustment.key, {
                                      note: event.target.value,
                                    })
                                  }
                                  placeholder="항목 메모 (선택)"
                                  className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                                />
                              </div>
                            ))}
                          {!adjustments.some((row) => row.kind === kind) && (
                            <p className="py-5 text-center text-xs text-gray-400">
                              추가된 항목이 없습니다.
                            </p>
                          )}
                        </div>
                      </section>
                    ))}
                    <label className="block rounded-xl border border-gray-200 bg-gray-50/70 p-4">
                      <span className="text-sm font-bold text-gray-900">
                        전체 입고 메모
                      </span>
                      <textarea
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        placeholder="특이사항을 입력하세요. (선택)"
                        className="mt-2 h-28 w-full resize-none rounded-lg border border-gray-300 bg-white p-3 text-sm shadow-sm outline-none placeholder:text-gray-500 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                      />
                    </label>
                  </div>
                </div>
              )}

              {createStep === 3 && (
                <div className="mx-auto max-w-4xl space-y-4">
                  <div className="rounded-2xl bg-gray-50 p-5">
                    <p className="text-xs font-semibold text-gray-500">
                      거래처 · 주문일
                    </p>
                    <p className="mt-2 font-bold text-gray-950">
                      {selectedSupplier?.name}
                      <span className="mx-2 font-normal text-gray-300">|</span>
                      <span className="font-medium">{orderedOn}</span>
                    </p>
                  </div>
                  <div className="overflow-hidden rounded-2xl border border-gray-200">
                    <div className="grid grid-cols-[1fr_90px] bg-gray-50 px-4 py-3 text-xs font-semibold text-gray-500">
                      <span>품목명</span>
                      <span className="text-right">주문 수량</span>
                    </div>
                    {validRows.map((row) => (
                      <div
                        key={row.id}
                        className="grid grid-cols-[1fr_90px] border-t border-gray-100 px-4 py-3 text-sm"
                      >
                        <div>
                          <p className="font-medium text-gray-900">
                            {row.itemName}
                          </p>
                          {row.note && (
                            <p className="mt-1 text-xs text-gray-500">
                              {row.note}
                            </p>
                          )}
                          {row.handlingType !== "none" && (
                            <p className="mt-1 text-xs text-brand-600">
                              {
                                PURCHASE_HANDLING_OPTIONS.find(
                                  (option) => option.value === row.handlingType,
                                )?.label
                              }
                              {row.customerName ? ` · ${row.customerName}` : ""}
                              {row.handlingNote ? ` · ${row.handlingNote}` : ""}
                            </p>
                          )}
                        </div>
                        <span className="text-right font-bold">
                          {Number(row.quantity).toLocaleString()}개
                        </span>
                      </div>
                    ))}
                  </div>
                  {adjustments.length > 0 && (
                    <div className="grid gap-3 rounded-xl border border-gray-200 p-4 text-sm sm:grid-cols-2">
                      {(["discount", "payment"] as const).map((kind) => (
                        <div key={kind}>
                          <strong>
                            {kind === "discount" ? "할인 항목" : "지불 항목"}
                          </strong>
                          <div className="mt-2 space-y-1 text-gray-600">
                            {adjustments
                              .filter((row) => row.kind === kind)
                              .map((row) => (
                                <p key={row.key}>
                                  {row.categoryName} ·{" "}
                                  {Number(row.amount).toLocaleString("ko-KR")}원
                                  {row.note ? ` · ${row.note}` : ""}
                                </p>
                              ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {note && (
                    <div className="rounded-xl border border-gray-200 p-4 text-sm text-gray-700">
                      <strong>전체 입고 메모</strong>
                      <p className="mt-1 whitespace-pre-wrap">{note}</p>
                    </div>
                  )}
                  <div className="rounded-xl border border-gray-200 p-4 text-sm text-gray-700">
                    <strong>발행 종류</strong>
                    <p className="mt-1">{taxInvoiceStatus}</p>
                  </div>
                  <p className="text-xs text-gray-500">
                    등록만으로 재고는 증가하지 않습니다. 도착 후 수량 확인과
                    입고 처리가 필요합니다.
                  </p>
                </div>
              )}
            </div>

            <footer className="mt-auto flex shrink-0 items-center justify-between border-t border-gray-100 bg-white px-5 py-4 sm:px-7">
              <Button
                variant="gray"
                onClick={() =>
                  createStep === 1
                    ? setCreateOpen(false)
                    : setCreateStep((createStep - 1) as 1 | 2)
                }
              >
                {createStep === 1 ? "취소" : "이전"}
              </Button>
              {createStep < 3 ? (
                <Button
                  onClick={() => setCreateStep((createStep + 1) as 2 | 3)}
                  disabled={
                    createStep === 1
                      ? !supplierId || !orderedOn || !taxInvoiceStatus
                      : !validRows.length || hasInvalidAdjustments
                  }
                >
                  다음
                </Button>
              ) : (
                <Button
                  onClick={() => receiveMutation.mutate()}
                  disabled={receiveMutation.isPending}
                >
                  {receiveMutation.isPending
                    ? "저장 중..."
                    : editingPurchaseOrder
                      ? "입고 예정 내용 저장"
                      : `${validRows.length}개 품목 입고 예정 등록`}
                </Button>
              )}
            </footer>
          </section>
          {duplicateConfirmOpen && (
            <div className="fixed inset-0 z-[140] flex items-center justify-center bg-gray-950/35 p-4">
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="duplicate-item-confirm-title"
                className="w-full max-w-sm rounded-2xl border border-brand-100 bg-white p-5 shadow-2xl"
              >
                <h3
                  id="duplicate-item-confirm-title"
                  className="text-base font-bold text-gray-900"
                >
                  이미 추가된 품목입니다.
                </h3>
                <p className="mt-2 text-sm text-gray-600">추가하시겠습니까?</p>
                <div className="mt-5 flex justify-end gap-2">
                  <Button
                    variant="gray"
                    onClick={() => setDuplicateConfirmOpen(false)}
                  >
                    아니오
                  </Button>
                  <Button
                    onClick={() => {
                      setDuplicateConfirmOpen(false);
                      commitDraftRow();
                    }}
                  >
                    네
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <PurchaseOrderList
        orders={ordersQuery.data ?? []}
        suppliers={suppliersQuery.data ?? []}
        loading={ordersQuery.isPending}
        isAdmin={isAdmin}
        focusOrderId={focusOrderId}
        onCreate={openCreate}
        onEdit={openEditPurchaseOrder}
        onSaved={async () => {
          await Promise.all([ordersQuery.refetch(), onSaved()]);
        }}
      />
      {supplierOpen && (
        <SupplierManageOverlay
          suppliers={suppliersQuery.data ?? []}
          onClose={() => setSupplierOpen(false)}
          onSaved={async () => {
            await suppliersQuery.refetch();
          }}
        />
      )}
    </div>
  );

  /* Legacy inline form retained temporarily below for safe comparison during rollout. */
  return (
    <div>
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              입고 예정 등록
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              예정 등록만으로는 재고가 증가하지 않습니다.
            </p>
          </div>
          {isAdmin && (
            <Button
              size="sm"
              variant="gray"
              onClick={() => setSupplierOpen(true)}
            >
              거래처 관리
            </Button>
          )}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-gray-700">
            거래처
            <select
              value={supplierId}
              onChange={(event) => setSupplierId(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-lg border border-gray-200 bg-white px-3"
            >
              <option value="">거래처 선택</option>
              {(suppliersQuery.data ?? [])
                .filter((supplier) => supplier.is_use)
                .map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700">
            주문일
            <div className="mt-1">
              <KoreanDatePicker
                value={orderedOn}
                onChange={setOrderedOn}
                selectedLabel="주문일"
              />
            </div>
          </label>
        </div>
        <div className="mt-4 space-y-2">
          {rows.map((row) => (
            <div
              key={row.id}
              className={`grid gap-2 rounded-xl border border-gray-200 bg-white p-3 shadow-sm ${isAdmin ? "lg:grid-cols-[minmax(220px,1fr)_100px_130px_minmax(180px,1fr)_44px]" : "lg:grid-cols-[minmax(220px,1fr)_100px_minmax(180px,1fr)_44px]"}`}
            >
              <select
                value={row.itemName}
                onChange={(event) =>
                  setRows((current) =>
                    current.map((item) =>
                      item.id === row.id
                        ? { ...item, itemName: event.target.value }
                        : item,
                    ),
                  )
                }
                className="min-h-11 rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-brand-400"
              >
                <option value="">품목 선택</option>
                {items
                  .filter((item) => item.item_code)
                  .map((item) => (
                    <option key={item.item_name} value={item.item_name}>
                      {item.item_name} ({item.quantity}개)
                    </option>
                  ))}
              </select>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={row.quantity}
                onChange={(event) =>
                  setRows((current) =>
                    current.map((item) =>
                      item.id === row.id
                        ? { ...item, quantity: event.target.value }
                        : item,
                    ),
                  )
                }
                className="min-h-11 rounded-lg border border-gray-200 bg-white px-3 text-right text-sm"
                placeholder="수량"
              />
              {isAdmin && (
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={row.unitPrice}
                  onChange={(event) =>
                    setRows((current) =>
                      current.map((item) =>
                        item.id === row.id
                          ? { ...item, unitPrice: event.target.value }
                          : item,
                      ),
                    )
                  }
                  className="min-h-11 rounded-lg border border-gray-200 bg-white px-3 text-right text-sm"
                  placeholder="입고 단가(선택)"
                />
              )}
              <input
                value={row.note}
                onChange={(event) =>
                  setRows((current) =>
                    current.map((item) =>
                      item.id === row.id
                        ? { ...item, note: event.target.value }
                        : item,
                    ),
                  )
                }
                className="min-h-11 rounded-lg border border-gray-200 bg-white px-3 text-sm"
                placeholder="품목별 메모"
              />
              <button
                type="button"
                onClick={() =>
                  setRows((current) =>
                    current.length === 1
                      ? current
                      : current.filter((item) => item.id !== row.id),
                  )
                }
                className="min-h-11 rounded-lg text-xl text-gray-400 hover:bg-rose-50 hover:text-rose-600"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            setRows((current) => [
              ...current,
              createEmptyReceiptRow(nextId, isAdmin),
            ]);
            setNextId((id) => id + 1);
          }}
          className="mt-3 min-h-11 w-full rounded-xl border border-dashed border-brand-300 text-sm font-semibold text-brand-700 hover:bg-brand-50"
        >
          품목 추가
        </button>
        {hasDuplicateItems && (
          <p className="mt-2 text-xs font-medium text-rose-600">
            같은 품목이 중복 선택되었습니다. 한 행으로 합쳐 주세요.
          </p>
        )}
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="주문 전체 메모 (선택)"
          className="mt-3 h-20 w-full resize-none rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-brand-400"
        />
        <div className="mt-4 flex justify-end">
          <Button
            onClick={() => receiveMutation.mutate()}
            disabled={
              !supplierId ||
              !orderedOn ||
              !validRows.length ||
              hasDuplicateItems ||
              receiveMutation.isPending
            }
          >
            {receiveMutation.isPending
              ? "등록 중..."
              : `${validRows.length}개 품목 예정 등록`}
          </Button>
        </div>
      </section>
      <PurchaseOrderList
        orders={ordersQuery.data ?? []}
        suppliers={suppliersQuery.data ?? []}
        loading={ordersQuery.isPending}
        isAdmin={isAdmin}
        onSaved={async () => {
          await Promise.all([ordersQuery.refetch(), onSaved()]);
        }}
      />
      {supplierOpen && (
        <SupplierManageOverlay
          suppliers={suppliersQuery.data ?? []}
          onClose={() => setSupplierOpen(false)}
          onSaved={async () => {
            await suppliersQuery.refetch();
          }}
        />
      )}
    </div>
  );
}

function PurchaseOrderList({
  orders,
  suppliers,
  loading,
  isAdmin,
  onSaved,
  focusOrderId,
  onCreate,
  onEdit,
}: {
  orders: PurchaseOrder[];
  suppliers: InventorySupplier[];
  loading: boolean;
  isAdmin: boolean;
  onSaved: () => Promise<void>;
  focusOrderId?: string | null;
  onCreate?: () => void;
  onEdit?: (order: PurchaseOrder) => void;
}) {
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [arrivalDates, setArrivalDates] = useState<Record<string, string>>({});
  const [arrivalNotes, setArrivalNotes] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [adjustmentOrder, setAdjustmentOrder] = useState<PurchaseOrder | null>(
    null,
  );
  const [editingOrder, setEditingOrder] = useState<PurchaseOrder | null>(null);
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const adjustmentCategoriesQuery = useQuery({
    queryKey: inventoryKeys.purchaseAdjustmentCategories,
    queryFn: () => getPurchaseAdjustmentCategories(true),
    enabled: isAdmin,
  });
  const [listTab, setListTab] = useState<
    "waiting" | "partial" | "completed" | "closed"
  >("waiting");
  useEffect(() => {
    setQuantities({});
    setEditingQuantities({});
    setSavedQuantities({});
    setArrivalDates({});
    setArrivalNotes({});
  }, [listTab]);
  useEffect(() => {
    if (!focusOrderId || loading) return;
    const target = orders.find((order) => order.id === focusOrderId);
    if (!target) return;
    setListTab(
      target.status === "pending"
        ? "waiting"
        : target.status === "partial"
          ? "partial"
          : target.status === "closed"
            ? "closed"
            : "completed",
    );
    window.setTimeout(() => {
      document
        .getElementById(`purchase-order-${focusOrderId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }, [focusOrderId, loading, orders]);
  const [historySupplierSearch, setHistorySupplierSearch] = useState("");
  const [historyItemSearch, setHistoryItemSearch] = useState("");
  const [historyDateMode, setHistoryDateMode] = useState<"all" | "custom">(
    "all",
  );
  const [historyStartDate, setHistoryStartDate] = useState("");
  const [historyEndDate, setHistoryEndDate] = useState("");
  const [expandedClosedOrders, setExpandedClosedOrders] = useState<
    Record<string, boolean>
  >({});
  const [editingQuantities, setEditingQuantities] = useState<
    Record<string, boolean>
  >({});
  const [savedQuantities, setSavedQuantities] = useState<
    Record<string, boolean>
  >({});
  const [purchaseNoteWidth, setPurchaseNoteWidth] = useState(() => {
    if (typeof window === "undefined") return 280;
    return (
      Number(window.localStorage.getItem("purchase-note-column-width")) || 280
    );
  });
  const statusLabels: Record<PurchaseOrder["status"], string> = {
    pending: "입고 대기",
    partial: "부분 입고",
    completed: "입고 완료",
    closed: "미입고 종료",
    cancelled: "주문 취소",
  };
  const run = async (task: () => Promise<void>, message: string) => {
    setPending(true);
    try {
      await task();
      toast.success(message);
      await onSaved();
      return true;
    } catch (error) {
      toast.error((error as Error).message);
      return false;
    } finally {
      setPending(false);
    }
  };
  const waitingOrders = orders.filter((order) => order.status === "pending");
  const partialOrders = orders.filter((order) => order.status === "partial");
  const draftBaselineRef = useRef(
    new Map<string, { orderedQuantity: number; pendingQuantity: number }>(),
  );
  useEffect(() => {
    if (
      (listTab !== "waiting" && listTab !== "partial") ||
      draftBaselineRef.current.size > 0
    )
      return;
    const currentOrders = orders.filter((order) =>
      listTab === "waiting"
        ? order.status === "pending"
        : order.status === "partial",
    );
    currentOrders.forEach((order) =>
      order.inventory_purchase_order_lines.forEach((line) => {
        draftBaselineRef.current.set(line.id, {
          orderedQuantity: line.ordered_quantity,
          pendingQuantity: line.pending_quantity,
        });
      }),
    );
  }, [listTab, orders]);
  const clearDraftState = () => {
    setQuantities({});
    setEditingQuantities({});
    setSavedQuantities({});
    setArrivalDates({});
    setArrivalNotes({});
  };
  const changeListTab = async (
    nextTab: "waiting" | "partial" | "completed" | "closed",
  ) => {
    if (nextTab === listTab || pending) return;
    if (listTab === "waiting" || listTab === "partial") {
      const currentOrders =
        listTab === "waiting" ? waitingOrders : partialOrders;
      setPending(true);
      try {
        for (const order of currentOrders) {
          for (const line of order.inventory_purchase_order_lines) {
            const baseline = draftBaselineRef.current.get(line.id);
            if (!baseline) continue;
            if (
              order.status === "pending" &&
              line.ordered_quantity !== baseline.orderedQuantity
            ) {
              await updatePurchaseOrderQuantity(
                line.id,
                baseline.orderedQuantity,
              );
            }
            await setPurchaseArrivalQuantity(line.id, baseline.pendingQuantity);
          }
        }
        await onSaved();
      } catch (error) {
        toast.error(
          `입고대기 작업을 초기화하지 못했습니다: ${(error as Error).message}`,
        );
      } finally {
        setPending(false);
      }
    }
    draftBaselineRef.current.clear();
    clearDraftState();
    setListTab(nextTab);
  };
  const completedOrders = orders.filter(
    (order) =>
      order.status !== "pending" &&
      order.status !== "partial" &&
      order.status !== "closed",
  );
  const closedOrders = orders.filter((order) => order.status === "closed");
  const filterHistoryOrders = (targetOrders: PurchaseOrder[]) =>
    targetOrders.filter((order) => {
      const matchesSupplier = (order.inventory_suppliers?.name ?? "")
        .toLocaleLowerCase("ko-KR")
        .includes(historySupplierSearch.trim().toLocaleLowerCase("ko-KR"));
      const normalizedItemSearch = historyItemSearch
        .trim()
        .toLocaleLowerCase("ko-KR");
      const matchesItem =
        !normalizedItemSearch ||
        order.inventory_purchase_order_lines.some((line) =>
          line.item_name
            .toLocaleLowerCase("ko-KR")
            .includes(normalizedItemSearch),
        );
      const receiptDates = order.inventory_purchase_receipts.map(
        (receipt) => receipt.arrived_on,
      );
      const matchesDate =
        historyDateMode === "all" ||
        (Boolean(historyStartDate) &&
          receiptDates.some((date) =>
            historyEndDate
              ? date >= historyStartDate && date <= historyEndDate
              : date === historyStartDate,
          ));
      return matchesSupplier && matchesItem && matchesDate;
    });
  const filteredCompletedOrders = filterHistoryOrders(completedOrders);
  const filteredClosedOrders = filterHistoryOrders(closedOrders);
  const visibleOrders =
    listTab === "waiting"
      ? waitingOrders
      : listTab === "partial"
        ? partialOrders
        : listTab === "completed"
          ? filteredCompletedOrders
          : filteredClosedOrders;
  const formatKoreanDate = (value: string) =>
    new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
      timeZone: "Asia/Seoul",
    }).format(new Date(`${value}T00:00:00+09:00`));
  const cleanQuantityMemo = (value: string | null | undefined) =>
    value?.replace(/\[자동 수량 확인\]\s*/g, "").trim() ?? "";
  const copyOrderForExcel = async (order: PurchaseOrder) => {
    const orderNote = splitPurchaseOrderNote(order.note);
    const supplierName = order.inventory_suppliers?.name ?? "";
    const commonColumns = [supplierName, formatKoreanDate(order.ordered_on)];
    const itemRows = order.inventory_purchase_order_lines.map((line) =>
      [
        ...commonColumns,
        line.item_name,
        line.ordered_quantity,
        "",
        "=[@수량]*[@매입가]",
        cleanQuantityMemo(line.note),
        orderNote.note,
        orderNote.taxInvoiceStatus,
        "",
      ].join("\t"),
    );
    const adjustmentRows = (
      order.inventory_purchase_order_adjustments ?? []
    ).map((adjustment) => {
      const signedAmount =
        adjustment.kind === "discount"
          ? -Math.abs(Number(adjustment.amount))
          : Math.abs(Number(adjustment.amount));
      return [
        ...commonColumns,
        adjustment.category_name,
        1,
        signedAmount,
        "=[@수량]*[@매입가]",
        adjustment.note ?? "",
        orderNote.note,
        orderNote.taxInvoiceStatus,
        "",
      ].join("\t");
    });
    const text = [...itemRows, ...adjustmentRows].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("엑셀 붙여넣기 형식으로 복사했습니다.");
    } catch {
      toast.error("복사하지 못했습니다. 다시 시도해 주세요.");
    }
  };
  if (loading)
    return <Loading size="sm" text="입고 예정 목록을 불러오는 중..." />;
  return (
    <section className="mt-4 space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1 sm:w-[720px] sm:grid-cols-4">
          <button
            type="button"
            onClick={() => void changeListTab("waiting")}
            disabled={pending}
            className={`min-h-11 rounded-lg px-4 text-sm font-bold transition ${listTab === "waiting" ? "bg-white text-brand-700 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
          >
            입고 대기{" "}
            <span className="ml-1 text-xs">{waitingOrders.length}건</span>
          </button>
          <button
            type="button"
            onClick={() => void changeListTab("partial")}
            disabled={pending}
            className={`min-h-11 rounded-lg px-4 text-sm font-bold transition ${listTab === "partial" ? "bg-white text-brand-700 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
          >
            부분 입고{" "}
            <span className="ml-1 text-xs">{partialOrders.length}건</span>
          </button>
          <button
            type="button"
            onClick={() => void changeListTab("completed")}
            disabled={pending}
            className={`min-h-11 rounded-lg px-4 text-sm font-bold transition ${listTab === "completed" ? "bg-white text-brand-700 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
          >
            입고 완료{" "}
            <span className="ml-1 text-xs">{completedOrders.length}건</span>
          </button>
          <button
            type="button"
            onClick={() => void changeListTab("closed")}
            disabled={pending}
            className={`min-h-11 rounded-lg px-4 text-sm font-bold transition ${listTab === "closed" ? "bg-white text-brand-700 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
          >
            미입고 종료{" "}
            <span className="ml-1 text-xs">{closedOrders.length}건</span>
          </button>
        </div>
        {onCreate ? (
          <Button size="sm" onClick={onCreate}>
            입고 예정 등록
          </Button>
        ) : (
          <span className="px-3 text-sm text-gray-500">
            {visibleOrders.length.toLocaleString()}건
          </span>
        )}
      </div>
      {(listTab === "waiting" || listTab === "partial") &&
        visibleOrders.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
            <span className="shrink-0 text-xs font-bold text-gray-500">
              거래처 바로가기
            </span>
            {visibleOrders.map((order) => (
              <button
                type="button"
                key={order.id}
                onClick={() =>
                  document
                    .getElementById(`purchase-order-${order.id}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
                className="shrink-0 rounded-full border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
              >
                {order.inventory_suppliers?.name ?? "거래처 정보 없음"}
              </button>
            ))}
          </div>
        )}
      {(listTab === "completed" || listTab === "closed") && (
        <div className="flex flex-col gap-2 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm lg:flex-row lg:items-stretch lg:gap-3">
          <div className="flex w-full flex-col rounded-xl border border-gray-200 bg-gray-50/70 p-2.5 sm:w-[120px] sm:shrink-0">
            <p className="mb-1 text-xs font-semibold text-gray-600">
              조회 기간
            </p>
            <Dropdown controlledValue={historyDateMode}>
              <Dropdown.Trigger compact>
                {historyDateMode === "all" ? "전체" : "날짜 선택"}
              </Dropdown.Trigger>
              <Dropdown.Content compact>
                {(
                  [
                    { value: "all", label: "전체" },
                    { value: "custom", label: "날짜 선택" },
                  ] as const
                ).map((option) => (
                  <Dropdown.Item
                    key={option.value}
                    option={option}
                    compact
                    onSelect={(selected: DropdownOption) => {
                      const nextMode = selected.value as "all" | "custom";
                      if (nextMode === "all") {
                        setHistoryStartDate("");
                        setHistoryEndDate("");
                      }
                      setHistoryDateMode(nextMode);
                    }}
                  />
                ))}
              </Dropdown.Content>
            </Dropdown>
          </div>
          {historyDateMode === "custom" && (
            <div className="flex w-full flex-col rounded-xl border border-gray-200 bg-gray-50/70 p-2.5 sm:w-[120px] sm:shrink-0">
              <p className="mb-1 text-xs font-semibold text-gray-600">
                날짜 선택
              </p>
              <KoreanDateRangePicker
                startDate={historyStartDate}
                endDate={historyEndDate}
                iconOnly
                onApply={(start, end) => {
                  setHistoryStartDate(start);
                  setHistoryEndDate(end);
                }}
              />
            </div>
          )}
          <div className="h-px w-full bg-gray-200 lg:h-auto lg:w-px lg:self-stretch" />
          <div className="w-full rounded-xl border border-gray-200 bg-gray-50/70 p-3 sm:w-[260px] sm:shrink-0">
            <label className="block w-full">
              <span className="mb-2 block text-xs font-semibold text-gray-500">
                거래처명
              </span>
              <span className="relative block">
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
                  value={historySupplierSearch}
                  onChange={(event) =>
                    setHistorySupplierSearch(event.target.value)
                  }
                  placeholder="거래처명 입력"
                  className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-10 text-sm font-medium text-gray-900 shadow-sm outline-none transition placeholder:font-normal placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
                {historySupplierSearch && (
                  <button
                    type="button"
                    onClick={() => setHistorySupplierSearch("")}
                    aria-label="거래처명 검색어 지우기"
                    className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-gray-100 text-base font-medium text-gray-500 transition hover:bg-gray-200 hover:text-gray-700"
                  >
                    ×
                  </button>
                )}
              </span>
            </label>
          </div>
          <div className="w-full rounded-xl border border-gray-200 bg-gray-50/70 p-3 sm:w-[260px] sm:shrink-0">
            <label className="block w-full">
              <span className="mb-2 block text-xs font-semibold text-gray-500">
                품목명
              </span>
              <span className="relative block">
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
                  value={historyItemSearch}
                  onChange={(event) => setHistoryItemSearch(event.target.value)}
                  placeholder="품목명 입력"
                  className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-10 text-sm font-medium text-gray-900 shadow-sm outline-none transition placeholder:font-normal placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
                {historyItemSearch && (
                  <button
                    type="button"
                    onClick={() => setHistoryItemSearch("")}
                    aria-label="품목명 검색어 지우기"
                    className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-gray-100 text-base font-medium text-gray-500 transition hover:bg-gray-200 hover:text-gray-700"
                  >
                    ×
                  </button>
                )}
              </span>
            </label>
          </div>
        </div>
      )}
      <div className="hidden items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          입고 대기 및 처리 이력
        </h2>
        <span className="text-sm text-gray-500">{orders.length}건</span>
      </div>
      {visibleOrders.map((order) => {
        const open = order.status === "pending" || order.status === "partial";
        const closedMissingLines = order.inventory_purchase_order_lines.filter(
          (line) => line.ordered_quantity > line.received_quantity,
        );
        const closedCompletedLineCount =
          order.inventory_purchase_order_lines.length -
          closedMissingLines.length;
        const isEntirelyUnreceived =
          order.status === "closed" &&
          order.inventory_purchase_order_lines.every(
            (line) => line.received_quantity === 0,
          );
        const visibleClosedLines = expandedClosedOrders[order.id]
          ? order.inventory_purchase_order_lines
          : closedMissingLines;
        const orderNote = splitPurchaseOrderNote(order.note);
        const showPartialDetails = order.status === "partial";
        const hasCheckedItems = order.inventory_purchase_order_lines.some(
          (line) => line.quantity_checked_at,
        );
        const sortedReceipts = [...order.inventory_purchase_receipts].sort(
          (a, b) => a.created_at.localeCompare(b.created_at),
        );
        const showCompletedCumulativeDetails =
          sortedReceipts.filter((receipt) => !receipt.reversed_at).length > 1;
        const adjustments = order.inventory_purchase_order_adjustments ?? [];
        return (
          <article
            id={`purchase-order-${order.id}`}
            key={order.id}
            className="overflow-visible rounded-2xl border border-gray-200 bg-gray-50 shadow-sm"
          >
            <header className="flex flex-col rounded-t-[15px] bg-gray-50 sm:min-h-[112px] sm:flex-row sm:items-stretch">
              <div className="flex w-full shrink-0 flex-col justify-center gap-2 border-b border-gray-200 px-3 py-3 sm:w-[180px] sm:border-b-0 sm:border-r">
                <div className="flex min-h-9 items-center justify-center">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-bold ${order.status === "completed" ? "bg-emerald-100 text-emerald-700" : order.status === "partial" ? "bg-blue-100 text-blue-700" : order.status === "closed" || order.status === "cancelled" ? "bg-gray-200 text-gray-600" : "bg-amber-100 text-amber-700"}`}
                  >
                    {order.status === "closed"
                      ? isEntirelyUnreceived
                        ? "전체 미입고 종료"
                        : "일부 미입고 종료"
                      : statusLabels[order.status]}
                  </span>
                </div>
                <div className="flex min-h-7 items-center justify-center">
                  <strong className="text-center">
                    {order.inventory_suppliers?.name ?? "거래처 정보 없음"}
                  </strong>
                </div>
              </div>
              <div className="grid min-w-0 flex-1 grid-cols-1 gap-x-3 gap-y-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                <div className="flex w-full flex-wrap items-center gap-3">
                  <div className="flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 text-sm">
                    <span className="leading-none text-xs font-bold text-brand-600">
                      주문일
                    </span>
                    <span className="leading-none font-medium text-gray-700">
                      {formatKoreanDate(order.ordered_on)}
                    </span>
                  </div>
                  {order.inventory_purchase_receipts.map((receipt) => (
                    <div
                      key={receipt.id}
                      className="flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 text-sm"
                    >
                      <span className="leading-none text-xs font-bold text-emerald-700">
                        도착일
                      </span>
                      <span className="leading-none font-medium text-gray-700">
                        {formatKoreanDate(receipt.arrived_on)}
                      </span>
                      {receipt.reversed_at ? (
                        <span className="text-xs font-semibold text-rose-600">
                          취소됨
                        </span>
                      ) : (
                        isAdmin && (
                          <Button
                            size="xs"
                            variant="danger"
                            onClick={() => {
                              const reason =
                                window.prompt("입고 취소 사유를 입력하세요.");
                              if (reason?.trim())
                                void run(
                                  () =>
                                    reversePurchaseReceipt(receipt.id, reason),
                                  "입고를 취소하고 재고를 복구했습니다.",
                                );
                            }}
                            disabled={pending}
                          >
                            입고 취소
                          </Button>
                        )
                      )}
                    </div>
                  ))}
                  {orderNote.note && (
                    <span className="text-sm text-gray-500">
                      전체 메모: {orderNote.note}
                    </span>
                  )}
                  {order.status === "closed" && order.closed_reason && (
                    <span className="rounded-lg bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-700">
                      미입고 종료 사유: {order.closed_reason}
                    </span>
                  )}
                </div>
                <div className="flex min-h-7 w-full flex-wrap items-center gap-1.5">
                  {orderNote.taxInvoiceStatus && (
                    <span className="rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
                      발행 종류: {orderNote.taxInvoiceStatus}
                    </span>
                  )}
                  {isAdmin &&
                    adjustments.map((adjustment) => (
                      <span
                        key={adjustment.id}
                        className={`rounded-full px-2.5 py-1 text-xs font-bold ${adjustment.kind === "discount" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"}`}
                      >
                        {adjustment.category_name}{" "}
                        {adjustment.kind === "discount" ? "-" : "+"}
                        {Number(adjustment.amount).toLocaleString("ko-KR")}원
                      </span>
                    ))}
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:self-center">
                  {(order.status === "pending" ||
                    order.status === "completed") && (
                    <Button
                      size="xs"
                      variant="secondary"
                      onClick={() => void copyOrderForExcel(order)}
                    >
                      엑셀 복사
                    </Button>
                  )}
                  {isAdmin && (
                    <>
                      <Button
                        size="xs"
                        variant="gray"
                        onClick={() =>
                          onEdit ? onEdit(order) : setEditingOrder(order)
                        }
                      >
                        입고 수정
                      </Button>
                      <Button
                        size="xs"
                        variant="gray"
                        onClick={() => setAdjustmentOrder(order)}
                      >
                        거래 조정
                      </Button>
                    </>
                  )}
                  {!open && isAdmin && (
                    <Button
                      size="xs"
                      variant="danger"
                      onClick={() => {
                        if (
                          window.confirm(
                            "이 입고 이력을 삭제할까요? 반영된 입고 재고와 관련 변동 이력도 함께 되돌아갑니다.",
                          )
                        )
                          void run(
                            () => deletePurchaseOrderHistory(order.id),
                            "입고 이력을 삭제했습니다.",
                          );
                      }}
                      disabled={pending}
                    >
                      이력 삭제
                    </Button>
                  )}
                </div>
              </div>
            </header>
            <div
              className={`${open ? "block" : "hidden"} overflow-auto bg-gray-50 px-4 sm:px-5`}
            >
              <div className="min-w-[820px] overflow-hidden rounded-xl border border-brand-200 bg-white">
                <table className="purchase-order-table purchase-order-table--clean-edges w-full table-fixed border-collapse bg-white text-sm">
                  <colgroup>
                    <col className="w-[240px]" />
                    <col className="w-[84px]" />
                    {showPartialDetails && <col className="w-[90px]" />}
                    {showPartialDetails && <col className="w-[90px]" />}
                    {showPartialDetails && <col className="w-[100px]" />}
                    <col className="w-[84px]" />
                    <col className="w-[280px]" />
                    <col className="w-[120px]" />
                  </colgroup>
                  <thead className="bg-brand-50 text-brand-700">
                    <tr>
                      {[
                        "품목명",
                        "주문 수량",
                        "누적 입고",
                        "남은 수량",
                        "입고 차이",
                        "입고 수량",
                        "개별 메모",
                        "수량 확인",
                      ]
                        .filter(
                          (label) =>
                            showPartialDetails ||
                            (label !== "누적 입고" &&
                              label !== "남은 수량" &&
                              label !== "입고 차이"),
                        )
                        .map((label) => (
                          <th
                            key={label}
                            className="border border-brand-200 px-3 py-3 text-left"
                          >
                            {label}
                            {false && label === "개별 메모" && (
                              <button
                                type="button"
                                aria-label="개별 메모 열 너비 조절"
                                title="좌우로 드래그해 너비 조절"
                                onPointerDown={(event) => {
                                  const startX = event.clientX;
                                  const startWidth = purchaseNoteWidth;
                                  const handleMove = (
                                    moveEvent: PointerEvent,
                                  ) => {
                                    const nextWidth = Math.max(
                                      140,
                                      startWidth + moveEvent.clientX - startX,
                                    );
                                    setPurchaseNoteWidth(nextWidth);
                                    window.localStorage.setItem(
                                      "purchase-note-column-width",
                                      String(Math.round(nextWidth)),
                                    );
                                  };
                                  const handleUp = () => {
                                    document.removeEventListener(
                                      "pointermove",
                                      handleMove,
                                    );
                                    document.removeEventListener(
                                      "pointerup",
                                      handleUp,
                                    );
                                  };
                                  document.addEventListener(
                                    "pointermove",
                                    handleMove,
                                  );
                                  document.addEventListener(
                                    "pointerup",
                                    handleUp,
                                  );
                                }}
                                className="absolute -right-1 top-0 z-20 h-full w-4 cursor-col-resize touch-none after:absolute after:bottom-2 after:left-1/2 after:top-2 after:w-0.5 after:-translate-x-1/2 after:bg-brand-300 hover:after:bg-brand-600"
                              />
                            )}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody>
                    {order.inventory_purchase_order_lines.map((line) => {
                      const lineRemaining = Math.max(
                        0,
                        line.ordered_quantity - line.received_quantity,
                      );
                      const arrivalDifference =
                        line.pending_quantity - lineRemaining;
                      const quantityCheckLabel =
                        arrivalDifference === 0
                          ? "수량 일치 체크"
                          : arrivalDifference > 0
                            ? `${arrivalDifference}개 추가입고 체크`
                            : `${Math.abs(arrivalDifference)}개 미입고 체크`;
                      const value =
                        quantities[line.id] ?? String(line.pending_quantity);
                      const editingQuantity =
                        editingQuantities[line.id] ||
                        (!savedQuantities[line.id] &&
                          line.pending_quantity === 0);
                      return (
                        <tr key={line.id}>
                          <td className="border border-gray-200 px-3 py-3 font-semibold">
                            <p>{line.item_name}</p>
                            {line.handling_type &&
                              line.handling_type !== "none" && (
                                <div className="mt-1 flex flex-wrap items-center gap-1 text-xs font-medium">
                                  <span className="rounded-full bg-brand-50 px-2 py-0.5 text-brand-700">
                                    {
                                      PURCHASE_HANDLING_OPTIONS.find(
                                        (option) =>
                                          option.value === line.handling_type,
                                      )?.label
                                    }
                                  </span>
                                  {line.customer_id && (
                                    <a
                                      href={`/customers/${line.customer_id}`}
                                      className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-700 hover:bg-sky-100"
                                    >
                                      예약 고객 보기
                                    </a>
                                  )}
                                  {line.handling_note && (
                                    <span className="font-normal text-gray-500">
                                      {line.handling_note}
                                    </span>
                                  )}
                                </div>
                              )}
                          </td>
                          <td className="border border-gray-200 px-3 py-3 text-right">
                            <strong className="text-gray-900">
                              {line.ordered_quantity}개
                            </strong>
                          </td>
                          {showPartialDetails && (
                            <td className="border border-gray-200 px-3 py-3 text-right">
                              {line.received_quantity}개
                            </td>
                          )}
                          {showPartialDetails && (
                            <td className="border border-gray-200 px-3 py-3 text-right font-bold text-gray-900">
                              {lineRemaining}개
                            </td>
                          )}
                          {showPartialDetails && (
                            <td className="border border-gray-200 px-3 py-3 text-right font-bold">
                              {line.pending_quantity > 0 &&
                              arrivalDifference === 0 ? (
                                <span className="inline-flex rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
                                  수량 일치
                                </span>
                              ) : line.pending_quantity > 0 &&
                                arrivalDifference > 0 ? (
                                <span className="inline-flex rounded-full bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">
                                  {arrivalDifference}개 추가 입고
                                </span>
                              ) : line.pending_quantity > 0 ? (
                                <span className="inline-flex rounded-full bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700">
                                  {Math.abs(arrivalDifference)}개 미입고
                                </span>
                              ) : (
                                "-"
                              )}
                            </td>
                          )}
                          <td className="border border-gray-200 p-2">
                            {open && editingQuantity ? (
                              <QuantityEditControl
                                min={0}
                                disabled={
                                  pending ||
                                  !Number.isInteger(Number(value)) ||
                                  Number(value) < 0
                                }
                                value={value}
                                onChange={(nextValue) =>
                                  setQuantities((current) => ({
                                    ...current,
                                    [line.id]: nextValue,
                                  }))
                                }
                                onSave={() => {
                                  const qty = Number(value);
                                  if (
                                    qty > lineRemaining &&
                                    !window.confirm(
                                      `주문 잔량은 ${lineRemaining}개입니다. ${qty}개로 저장할까요?`,
                                    )
                                  )
                                    return;
                                  void (async () => {
                                    const saved = await run(
                                      () =>
                                        setPurchaseArrivalQuantity(
                                          line.id,
                                          qty,
                                        ),
                                      "도착 수량을 저장했습니다.",
                                    );
                                    if (saved) {
                                      setSavedQuantities((current) => ({
                                        ...current,
                                        [line.id]: true,
                                      }));
                                      setEditingQuantities((current) => ({
                                        ...current,
                                        [line.id]: false,
                                      }));
                                    }
                                  })();
                                }}
                                onCancel={() => {
                                  setQuantities((current) => ({
                                    ...current,
                                    [line.id]: String(line.pending_quantity),
                                  }));
                                  setEditingQuantities((current) => ({
                                    ...current,
                                    [line.id]: false,
                                  }));
                                }}
                              />
                            ) : open ? (
                              <div className="flex w-full items-center justify-start gap-1">
                                <Button
                                  size="icon-xs"
                                  variant="secondary"
                                  aria-label="입고 수량 수정"
                                  onClick={() => {
                                    setQuantities((current) => ({
                                      ...current,
                                      [line.id]: String(line.pending_quantity),
                                    }));
                                    setEditingQuantities((current) => ({
                                      ...current,
                                      [line.id]: true,
                                    }));
                                  }}
                                >
                                  ✏️
                                </Button>
                                <strong className="text-gray-900">
                                  {line.pending_quantity}개
                                </strong>
                              </div>
                            ) : (
                              <strong className="block text-right text-gray-900">
                                {line.received_quantity}개
                              </strong>
                            )}
                          </td>
                          <td className="border border-gray-200 px-3 py-3 text-gray-500">
                            <div className="flex items-start gap-2">
                              {line.note || line.quantity_check_note ? (
                                <div className="min-w-0 space-y-1">
                                  {line.note && (
                                    <p>{cleanQuantityMemo(line.note)}</p>
                                  )}
                                  {line.quantity_check_note && (
                                    <p className="font-semibold text-brand-700">
                                      {line.quantity_check_note}
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <span>-</span>
                              )}
                            </div>
                          </td>
                          <td className="border border-gray-200 px-3 py-3">
                            {!open ? (
                              <span
                                className={`rounded-full px-2 py-1 text-xs font-bold ${order.status === "completed" && line.received_quantity === line.ordered_quantity ? "bg-emerald-100 text-emerald-700" : order.status === "completed" && line.received_quantity > line.ordered_quantity ? "bg-blue-100 text-blue-700" : (order.status === "completed" || order.status === "closed") && line.received_quantity < line.ordered_quantity ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"}`}
                              >
                                {order.status === "completed"
                                  ? line.received_quantity ===
                                    line.ordered_quantity
                                    ? "전체 입고 완료"
                                    : line.received_quantity >
                                        line.ordered_quantity
                                      ? `${line.received_quantity - line.ordered_quantity}개 추가 입고`
                                      : `${line.ordered_quantity - line.received_quantity}개 미입고`
                                  : order.status === "closed" &&
                                      line.received_quantity <
                                        line.ordered_quantity
                                    ? `${line.ordered_quantity - line.received_quantity}개 미입고`
                                    : "처리 종료"}
                              </span>
                            ) : line.quantity_checked_at ? (
                              <span
                                className={`rounded-full px-2 py-1 text-xs font-bold ${arrivalDifference < 0 ? "bg-amber-100 text-amber-700" : arrivalDifference > 0 ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}
                              >
                                {quantityCheckLabel}
                              </span>
                            ) : open ? (
                              <Button
                                size="xs"
                                onClick={() =>
                                  void run(
                                    () => checkPurchaseArrivalQuantity(line.id),
                                    "수량 체크를 완료했습니다.",
                                  )
                                }
                                disabled={pending}
                              >
                                {quantityCheckLabel}
                              </Button>
                            ) : (
                              <span className="text-gray-400">대기</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            {!open &&
              listTab !== "closed" &&
              order.inventory_purchase_receipts.length > 0 && (
                <div className="overflow-auto bg-gray-50 px-4 pb-4 sm:px-5 sm:pb-5">
                  <div className="min-w-[1080px] overflow-hidden rounded-xl border border-brand-200 bg-white">
                    <table className="purchase-order-table purchase-order-table--clean-edges w-full table-fixed border-collapse bg-white text-sm">
                      <colgroup>
                        <col className="w-[190px]" />
                        <col className="w-[220px]" />
                        <col className="w-[90px]" />
                        {showCompletedCumulativeDetails && (
                          <col className="w-[120px]" />
                        )}
                        {showCompletedCumulativeDetails && (
                          <col className="w-[100px]" />
                        )}
                        <col className="w-[100px]" />
                        <col className="w-[140px]" />
                        <col className="w-[260px]" />
                      </colgroup>
                      <thead className="bg-brand-50 text-brand-700">
                        <tr>
                          {[
                            "도착일",
                            "품목명",
                            "주문 수량",
                            "이전 입고 수량",
                            "남은 수량",
                            "입고 수량",
                            "입고 차이",
                            "개별 메모",
                          ]
                            .filter(
                              (label) =>
                                showCompletedCumulativeDetails ||
                                (label !== "이전 입고 수량" &&
                                  label !== "남은 수량"),
                            )
                            .map((label) => (
                              <th
                                key={label}
                                className="whitespace-nowrap border border-brand-200 px-3 py-3 text-left"
                              >
                                {label}
                              </th>
                            ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sortedReceipts.flatMap((receipt, receiptIndex) =>
                          receipt.inventory_purchase_receipt_lines.map(
                            (receiptLine) => {
                              const orderLine =
                                order.inventory_purchase_order_lines.find(
                                  (line) =>
                                    line.id === receiptLine.order_line_id,
                                );
                              const previousReceived = sortedReceipts
                                .slice(0, receiptIndex)
                                .filter((previous) => !previous.reversed_at)
                                .flatMap(
                                  (previous) =>
                                    previous.inventory_purchase_receipt_lines,
                                )
                                .filter(
                                  (previousLine) =>
                                    previousLine.order_line_id ===
                                    receiptLine.order_line_id,
                                )
                                .reduce(
                                  (sum, previousLine) =>
                                    sum + previousLine.quantity,
                                  0,
                                );
                              const orderedQuantity =
                                orderLine?.ordered_quantity ?? 0;
                              const remainingBefore = Math.max(
                                0,
                                orderedQuantity - previousReceived,
                              );
                              const difference =
                                receiptLine.quantity - remainingBefore;
                              return (
                                <tr
                                  key={receiptLine.id}
                                  className={
                                    receipt.reversed_at
                                      ? "bg-gray-50 opacity-60"
                                      : ""
                                  }
                                >
                                  <td className="border border-gray-200 px-3 py-3">
                                    {formatKoreanDate(receipt.arrived_on)}
                                    {receipt.note && (
                                      <p className="mt-1 text-xs text-gray-500">
                                        입고 메모: {receipt.note}
                                      </p>
                                    )}
                                    {receipt.reversed_at && (
                                      <span className="ml-2 text-xs font-bold text-rose-600">
                                        취소됨
                                      </span>
                                    )}
                                  </td>
                                  <td className="border border-gray-200 px-3 py-3 font-semibold">
                                    {receiptLine.item_name}
                                  </td>
                                  <td className="border border-gray-200 px-3 py-3 text-right">
                                    {orderedQuantity}개
                                  </td>
                                  {showCompletedCumulativeDetails && (
                                    <td className="border border-gray-200 px-3 py-3 text-right">
                                      {previousReceived}개
                                    </td>
                                  )}
                                  {showCompletedCumulativeDetails && (
                                    <td className="border border-gray-200 px-3 py-3 text-right font-bold">
                                      {remainingBefore}개
                                    </td>
                                  )}
                                  <td className="border border-gray-200 px-3 py-3 text-right font-bold">
                                    {receiptLine.quantity}개
                                  </td>
                                  <td className="border border-gray-200 px-3 py-3 text-right">
                                    <span
                                      className={`inline-flex rounded-full px-2 py-1 text-xs font-bold ${difference === 0 ? "bg-emerald-50 text-emerald-700" : difference > 0 ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"}`}
                                    >
                                      {difference === 0
                                        ? "수량 일치"
                                        : difference > 0
                                          ? `${difference}개 추가 입고`
                                          : `${Math.abs(difference)}개 미입고`}
                                    </span>
                                  </td>
                                  <td className="border border-gray-200 px-3 py-3 text-gray-600">
                                    {receiptLine.note ||
                                    receiptLine.quantity_check_note ||
                                    orderLine?.note ? (
                                      <div className="space-y-1">
                                        {(receiptLine.note ||
                                          orderLine?.note) && (
                                          <p>
                                            {cleanQuantityMemo(
                                              receiptLine.note ||
                                                orderLine?.note,
                                            )}
                                          </p>
                                        )}
                                        {receiptLine.quantity_check_note && (
                                          <p className="font-semibold text-brand-700">
                                            {receiptLine.quantity_check_note}
                                          </p>
                                        )}
                                      </div>
                                    ) : (
                                      "-"
                                    )}
                                  </td>
                                </tr>
                              );
                            },
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            {!open && order.status === "closed" && (
              <div className="bg-gray-50 px-4 pb-4 sm:px-5 sm:pb-5">
                <div className="mb-3 flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold text-gray-800">
                      전체{" "}
                      {order.inventory_purchase_order_lines.length.toLocaleString()}
                      개 품목
                    </span>
                    <span className="text-gray-300">·</span>
                    <span className="font-semibold text-emerald-700">
                      입고 완료 {closedCompletedLineCount.toLocaleString()}개
                    </span>
                    <span className="text-gray-300">·</span>
                    <span className="font-semibold text-amber-700">
                      미입고 종료 {closedMissingLines.length.toLocaleString()}개
                    </span>
                  </div>
                  {closedCompletedLineCount > 0 && (
                    <Button
                      size="xs"
                      variant="secondary"
                      onClick={() =>
                        setExpandedClosedOrders((current) => ({
                          ...current,
                          [order.id]: !current[order.id],
                        }))
                      }
                    >
                      {expandedClosedOrders[order.id]
                        ? "미입고 품목만 보기"
                        : "전체 품목 보기"}
                    </Button>
                  )}
                </div>
                <div className="overflow-auto">
                  <div className="min-w-[760px] overflow-hidden rounded-xl border border-amber-200 bg-white">
                    <table className="purchase-order-table purchase-order-table--clean-edges w-full table-fixed border-collapse bg-white text-sm">
                      <thead className="bg-amber-50 text-amber-800">
                        <tr>
                          <th className="border border-amber-200 px-3 py-3 text-left">
                            품목명
                          </th>
                          <th className="w-28 border border-amber-200 px-3 py-3 text-right">
                            주문 수량
                          </th>
                          <th className="w-28 border border-amber-200 px-3 py-3 text-right">
                            입고 수량
                          </th>
                          <th className="w-28 border border-amber-200 px-3 py-3 text-right">
                            미입고 수량
                          </th>
                          <th className="w-72 border border-amber-200 px-3 py-3 text-left">
                            종료 내용
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleClosedLines.map((line) => {
                          const missingQuantity = Math.max(
                            0,
                            line.ordered_quantity - line.received_quantity,
                          );
                          return (
                            <tr key={`closed-${line.id}`}>
                              <td className="border border-gray-200 px-3 py-3 break-words font-semibold">
                                {line.item_name}
                              </td>
                              <td className="border border-gray-200 px-3 py-3 text-right">
                                {line.ordered_quantity}개
                              </td>
                              <td className="border border-gray-200 px-3 py-3 text-right">
                                {line.received_quantity}개
                              </td>
                              <td
                                className={`border border-gray-200 px-3 py-3 text-right font-bold ${missingQuantity > 0 ? "text-amber-700" : "text-emerald-700"}`}
                              >
                                {missingQuantity}개
                              </td>
                              <td className="border border-gray-200 px-3 py-3 break-words text-gray-600">
                                {missingQuantity > 0 ? (
                                  order.closed_reason || "미입고 종료"
                                ) : (
                                  <span className="font-semibold text-emerald-700">
                                    입고 완료
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
            {open && (
              <footer className="rounded-b-[15px] bg-gray-50 p-4 sm:p-5">
                <div className="grid gap-3 lg:grid-cols-[280px_minmax(260px,1fr)_auto] lg:items-end">
                  <label className="block text-xs font-semibold text-gray-600">
                    도착일 <span className="text-brand-500">*</span>
                    <div className="mt-1.5">
                      <KoreanDatePicker
                        value={arrivalDates[order.id] ?? ""}
                        onChange={(value) =>
                          setArrivalDates((current) => ({
                            ...current,
                            [order.id]: value,
                          }))
                        }
                        selectedLabel="도착일"
                        placement="top"
                      />
                    </div>
                  </label>
                  <label className="block text-xs font-semibold text-gray-600">
                    이번 입고 메모
                    <input
                      value={arrivalNotes[order.id] ?? ""}
                      onChange={(event) =>
                        setArrivalNotes((current) => ({
                          ...current,
                          [order.id]: event.target.value,
                        }))
                      }
                      placeholder="이번 입고 전체 메모 (선택)"
                      className="mt-1.5 min-h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-normal outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                    />
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row lg:justify-end">
                    <Button
                      onClick={() =>
                        void run(
                          () =>
                            processPurchaseArrival(
                              order.id,
                              arrivalDates[order.id] ?? "",
                              arrivalNotes[order.id] ?? "",
                            ),
                          "재고에 입고 처리했습니다.",
                        )
                      }
                      disabled={
                        pending || !arrivalDates[order.id] || !hasCheckedItems
                      }
                    >
                      체크 품목 입고
                    </Button>
                    {isAdmin && (
                      <Button
                        variant="gray"
                        onClick={() => {
                          const reason =
                            window.prompt("미입고 종료 사유를 입력하세요.");
                          if (reason?.trim())
                            void run(
                              () =>
                                closePurchaseOrderRemainder(order.id, reason),
                              "미입고 잔량을 종료했습니다.",
                            );
                        }}
                        disabled={pending}
                      >
                        미입고 종료
                      </Button>
                    )}
                  </div>
                </div>
              </footer>
            )}
            {order.inventory_purchase_receipts.length > 0 && (
              <div className="hidden border-t border-gray-200 p-4">
                <p className="mb-2 text-sm font-semibold">도착 이력</p>
                <div className="flex flex-wrap gap-2">
                  {order.inventory_purchase_receipts.map((receipt) => (
                    <div
                      key={receipt.id}
                      className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    >
                      <span>{receipt.arrived_on}</span>
                      {receipt.reversed_at ? (
                        <span className="text-rose-600">취소됨</span>
                      ) : isAdmin ? (
                        <Button
                          size="xs"
                          variant="danger"
                          onClick={() => {
                            const reason =
                              window.prompt("입고 취소 사유를 입력하세요.");
                            if (reason?.trim())
                              void run(
                                () =>
                                  reversePurchaseReceipt(receipt.id, reason),
                                "입고를 취소하고 재고를 복구했습니다.",
                              );
                          }}
                          disabled={pending}
                        >
                          입고 취소
                        </Button>
                      ) : (
                        <span className="text-emerald-600">입고 완료</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </article>
        );
      })}
      {!visibleOrders.length && (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white py-12 text-center text-gray-400">
          등록된 입고 예정이 없습니다.
        </div>
      )}
      {adjustmentOrder && (
        <PurchaseAdjustmentOverlay
          order={adjustmentOrder}
          categories={adjustmentCategoriesQuery.data ?? []}
          categoriesError={adjustmentCategoriesQuery.isError}
          isAdmin={isAdmin}
          onClose={() => setAdjustmentOrder(null)}
          onManageCategories={() => setCategoryManagerOpen(true)}
          onSaved={async () => {
            setAdjustmentOrder(null);
            await onSaved();
          }}
        />
      )}
      {editingOrder && (
        <PurchaseOrderEditOverlay
          order={editingOrder}
          suppliers={suppliers}
          isAdmin={isAdmin}
          onClose={() => setEditingOrder(null)}
          onSaved={async () => {
            setEditingOrder(null);
            await onSaved();
          }}
        />
      )}
      {categoryManagerOpen && (
        <PurchaseAdjustmentCategoryOverlay
          categories={adjustmentCategoriesQuery.data ?? []}
          onClose={() => setCategoryManagerOpen(false)}
          onSaved={async () => {
            await adjustmentCategoriesQuery.refetch();
          }}
        />
      )}
    </section>
  );
}

type AdjustmentDraft = {
  key: string;
  categoryId: string;
  categoryName: string;
  kind: PurchaseAdjustmentKind;
  amount: string;
  note: string;
};

const formatPurchaseAdjustmentDate = (value: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(`${value}T00:00:00`));

function PurchaseOrderEditOverlay({
  order,
  suppliers,
  isAdmin,
  onClose,
  onSaved,
}: {
  order: PurchaseOrder;
  suppliers: InventorySupplier[];
  isAdmin: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const parsedNote = splitPurchaseOrderNote(order.note);
  const [supplierId, setSupplierId] = useState(order.supplier_id);
  const [orderedOn, setOrderedOn] = useState(order.ordered_on);
  const [taxInvoiceStatus, setTaxInvoiceStatus] = useState<TaxInvoiceStatus>(
    parsedNote.taxInvoiceStatus,
  );
  const [overallNote, setOverallNote] = useState(parsedNote.note);
  const [lines, setLines] = useState(() =>
    order.inventory_purchase_order_lines.map((line) => ({
      id: line.id,
      itemName: line.item_name,
      orderedQuantity: String(line.ordered_quantity),
      receivedQuantity: line.received_quantity,
      unitPrice: line.unit_price == null ? "" : String(line.unit_price),
      note: line.note ?? "",
    })),
  );
  const [receipts, setReceipts] = useState(() =>
    order.inventory_purchase_receipts.map((receipt) => ({
      id: receipt.id,
      arrivedOn: receipt.arrived_on,
      note: receipt.note ?? "",
      reversed: Boolean(receipt.reversed_at),
    })),
  );
  const [saving, setSaving] = useState(false);
  const selectedSupplier = suppliers.find((item) => item.id === supplierId);

  const save = async () => {
    if (!supplierId || !orderedOn) {
      toast.error("거래처와 주문일을 확인해 주세요.");
      return;
    }
    if (
      lines.some(
        (line) =>
          !line.itemName.trim() ||
          !Number.isInteger(Number(line.orderedQuantity)) ||
          Number(line.orderedQuantity) < Math.max(1, line.receivedQuantity),
      )
    ) {
      toast.error("품목명과 주문수량을 확인해 주세요.");
      return;
    }
    if (
      new Set(lines.map((line) => line.itemName.trim())).size !== lines.length
    ) {
      toast.error("같은 품목을 중복으로 저장할 수 없습니다.");
      return;
    }

    setSaving(true);
    try {
      await updatePurchaseOrderDetails({
        orderId: order.id,
        supplierId,
        orderedOn,
        note: mergePurchaseOrderNote(taxInvoiceStatus, overallNote),
        lines: lines.map((line) => ({
          id: line.id,
          item_name: line.itemName.trim(),
          ordered_quantity: Number(line.orderedQuantity),
          unit_price:
            isAdmin && line.unitPrice !== ""
              ? Math.max(0, Math.floor(Number(line.unitPrice)))
              : (order.inventory_purchase_order_lines.find(
                  (item) => item.id === line.id,
                )?.unit_price ?? null),
          note: line.note.trim(),
          handling_type:
            order.inventory_purchase_order_lines.find(
              (item) => item.id === line.id,
            )?.handling_type ?? "none",
          handling_note:
            order.inventory_purchase_order_lines.find(
              (item) => item.id === line.id,
            )?.handling_note ?? null,
          customer_id:
            order.inventory_purchase_order_lines.find(
              (item) => item.id === line.id,
            )?.customer_id ?? null,
          reservation_log_id:
            order.inventory_purchase_order_lines.find(
              (item) => item.id === line.id,
            )?.reservation_log_id ?? null,
        })),
        receipts: receipts.map((receipt) => ({
          id: receipt.id,
          arrived_on: receipt.arrivedOn,
          note: receipt.note.trim(),
        })),
      });
      toast.success("입고 내용을 수정했습니다.");
      await onSaved();
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes("RECEIVED_ITEM_NAME_IMMUTABLE")) {
        toast.error(
          "입고 처리된 품목명은 재고 이력 보호를 위해 변경할 수 없습니다.",
        );
      } else if (message.includes("ORDERED_QUANTITY_BELOW_RECEIVED")) {
        toast.error("주문수량은 이미 입고된 수량보다 작게 변경할 수 없습니다.");
      } else {
        toast.error(message || "입고 내용 수정에 실패했습니다.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-gray-950/50 p-4 backdrop-blur-[2px]">
      <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-bold text-gray-900">입고 내용 수정</h2>
          <p className="mt-1 text-xs text-gray-500">
            입고 상태와 관계없이 원본 정보를 수정할 수 있습니다. 실제 입고수량은
            재고 이력과 연결되어 수정 대상에서 제외됩니다.
          </p>
        </div>
        <div className="space-y-5 p-5">
          <section className="grid gap-4 rounded-xl border border-gray-200 bg-gray-50/70 p-4 md:grid-cols-2">
            <label className="text-xs font-semibold text-gray-600">
              거래처
              <div className="mt-1.5">
                <Dropdown controlledValue={supplierId}>
                  <Dropdown.Trigger>
                    {selectedSupplier?.name ?? "거래처 선택"}
                  </Dropdown.Trigger>
                  <Dropdown.Content>
                    {suppliers
                      .filter(
                        (supplier) =>
                          supplier.is_use || supplier.id === supplierId,
                      )
                      .map((supplier) => (
                        <Dropdown.Item
                          key={supplier.id}
                          option={{
                            value: supplier.id,
                            label: supplier.name,
                          }}
                          onSelect={(selected: DropdownOption) =>
                            setSupplierId(String(selected.value))
                          }
                        />
                      ))}
                  </Dropdown.Content>
                </Dropdown>
              </div>
            </label>
            <label className="text-xs font-semibold text-gray-600">
              주문일
              <input
                type="date"
                value={orderedOn}
                onChange={(event) => setOrderedOn(event.target.value)}
                className="mt-1.5 h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </label>
            <div className="text-xs font-semibold text-gray-600">
              발행 종류
              <div className="mt-1.5">
                <Dropdown controlledValue={taxInvoiceStatus}>
                  <Dropdown.Trigger>
                    {taxInvoiceStatus || "발행 종류 선택"}
                  </Dropdown.Trigger>
                  <Dropdown.Content>
                    {TAX_INVOICE_OPTIONS.map((option) => (
                      <Dropdown.Item
                        key={option}
                        option={{ value: option, label: option }}
                        onSelect={(selected: DropdownOption) =>
                          setTaxInvoiceStatus(
                            selected.value as TaxInvoiceStatus,
                          )
                        }
                      />
                    ))}
                  </Dropdown.Content>
                </Dropdown>
              </div>
            </div>
            <label className="text-xs font-semibold text-gray-600 md:col-span-2">
              전체 메모
              <textarea
                value={overallNote}
                onChange={(event) => setOverallNote(event.target.value)}
                placeholder="입고 전체 메모"
                className="mt-1.5 h-24 w-full resize-none rounded-lg border border-gray-300 bg-white p-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </label>
          </section>

          <section>
            <h3 className="mb-3 font-bold text-gray-900">입고 품목</h3>
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="min-w-[900px] w-full border-collapse text-sm">
                <thead className="bg-gray-50 text-xs font-semibold text-gray-600">
                  <tr>
                    <th className="px-3 py-3 text-left">품목명</th>
                    <th className="w-28 px-3 py-3 text-right">주문수량</th>
                    <th className="w-28 px-3 py-3 text-right">입고수량</th>
                    {isAdmin && (
                      <th className="w-36 px-3 py-3 text-right">단가</th>
                    )}
                    <th className="w-[280px] px-3 py-3 text-left">품목 메모</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.id} className="border-t border-gray-200">
                      <td className="p-2">
                        <input
                          value={line.itemName}
                          disabled={line.receivedQuantity > 0}
                          title={
                            line.receivedQuantity > 0
                              ? "입고 처리된 품목명은 재고 이력 보호를 위해 변경할 수 없습니다."
                              : undefined
                          }
                          onChange={(event) =>
                            setLines((current) =>
                              current.map((item) =>
                                item.id === line.id
                                  ? { ...item, itemName: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          className="h-10 w-full rounded-lg border border-gray-300 px-3 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-gray-100 disabled:text-gray-500"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          min={Math.max(1, line.receivedQuantity)}
                          value={line.orderedQuantity}
                          onChange={(event) =>
                            setLines((current) =>
                              current.map((item) =>
                                item.id === line.id
                                  ? {
                                      ...item,
                                      orderedQuantity: event.target.value,
                                    }
                                  : item,
                              ),
                            )
                          }
                          className="h-10 w-full rounded-lg border border-gray-300 px-3 text-right outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                        />
                      </td>
                      <td className="p-2 text-right font-semibold text-gray-600">
                        {line.receivedQuantity.toLocaleString("ko-KR")}개
                      </td>
                      {isAdmin && (
                        <td className="p-2">
                          <input
                            type="number"
                            min="0"
                            value={line.unitPrice}
                            onChange={(event) =>
                              setLines((current) =>
                                current.map((item) =>
                                  item.id === line.id
                                    ? { ...item, unitPrice: event.target.value }
                                    : item,
                                ),
                              )
                            }
                            className="h-10 w-full rounded-lg border border-gray-300 px-3 text-right outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                          />
                        </td>
                      )}
                      <td className="p-2">
                        <input
                          value={line.note}
                          onChange={(event) =>
                            setLines((current) =>
                              current.map((item) =>
                                item.id === line.id
                                  ? { ...item, note: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          placeholder="품목 메모"
                          className="h-10 w-full rounded-lg border border-gray-300 px-3 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {receipts.length > 0 && (
            <section>
              <h3 className="mb-3 font-bold text-gray-900">입고 처리 이력</h3>
              <div className="grid gap-3 md:grid-cols-2">
                {receipts.map((receipt) => (
                  <div
                    key={receipt.id}
                    className="rounded-xl border border-gray-200 bg-gray-50/70 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-emerald-700">
                        입고일
                      </span>
                      {receipt.reversed && (
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-600">
                          취소됨
                        </span>
                      )}
                    </div>
                    <input
                      type="date"
                      value={receipt.arrivedOn}
                      disabled={receipt.reversed}
                      onChange={(event) =>
                        setReceipts((current) =>
                          current.map((item) =>
                            item.id === receipt.id
                              ? { ...item, arrivedOn: event.target.value }
                              : item,
                          ),
                        )
                      }
                      className="mt-2 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-gray-100"
                    />
                    <input
                      value={receipt.note}
                      disabled={receipt.reversed}
                      onChange={(event) =>
                        setReceipts((current) =>
                          current.map((item) =>
                            item.id === receipt.id
                              ? { ...item, note: event.target.value }
                              : item,
                          ),
                        )
                      }
                      placeholder="입고 처리 메모"
                      className="mt-2 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-gray-100"
                    />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-200 bg-gray-50 px-5 py-4">
          <Button variant="gray" onClick={onClose} disabled={saving}>
            취소
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "저장 중..." : "입고 내용 저장"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PurchaseAdjustmentOverlay({
  order,
  categories,
  categoriesError,
  isAdmin,
  onClose,
  onManageCategories,
  onSaved,
}: {
  order: PurchaseOrder;
  categories: PurchaseAdjustmentCategory[];
  categoriesError: boolean;
  isAdmin: boolean;
  onClose: () => void;
  onManageCategories: () => void;
  onSaved: () => Promise<void>;
}) {
  const [rows, setRows] = useState<AdjustmentDraft[]>(() =>
    (order.inventory_purchase_order_adjustments ?? []).map((item) => ({
      key: item.id,
      categoryId: item.category_id ?? "",
      categoryName: item.category_name,
      kind: item.kind,
      amount: String(item.amount),
      note: item.note ?? "",
    })),
  );
  const [saving, setSaving] = useState(false);

  const addRow = (kind: PurchaseAdjustmentKind) => {
    const usedIds = new Set(rows.map((row) => row.categoryId));
    const category = categories.find(
      (item) => item.kind === kind && item.is_active && !usedIds.has(item.id),
    );
    if (!category) {
      toast.error(
        isAdmin
          ? "추가할 수 있는 항목이 없습니다. 거래 항목 관리에서 항목을 등록해 주세요."
          : "관리자에게 거래 항목 등록을 요청해 주세요.",
      );
      return;
    }
    setRows((current) => [
      ...current,
      {
        key: `draft-${kind}-${Date.now()}`,
        categoryId: category.id,
        categoryName: category.name,
        kind,
        amount: "",
        note: "",
      },
    ]);
  };

  const updateRow = (key: string, values: Partial<AdjustmentDraft>) =>
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...values } : row)),
    );

  const save = async () => {
    const normalized = rows
      .filter((row) => row.categoryName && Number(row.amount) > 0)
      .map((row) => ({
        category_id: row.categoryId || null,
        category_name: row.categoryName,
        kind: row.kind,
        amount: Math.floor(Number(row.amount)),
        note: row.note.trim() || null,
      })) satisfies Array<
      Pick<
        PurchaseOrderAdjustment,
        "category_id" | "category_name" | "kind" | "amount" | "note"
      >
    >;
    setSaving(true);
    try {
      await savePurchaseOrderAdjustments(order.id, normalized);
      toast.success("입고 거래 조정 내역을 저장했습니다.");
      await onSaved();
    } catch (error) {
      toast.error((error as Error).message || "거래 조정 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const totals = {
    discount: rows
      .filter((row) => row.kind === "discount")
      .reduce((sum, row) => sum + (Number(row.amount) || 0), 0),
    payment: rows
      .filter((row) => row.kind === "payment")
      .reduce((sum, row) => sum + (Number(row.amount) || 0), 0),
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-gray-950/50 p-4 backdrop-blur-[2px]">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">입고 거래 조정</h2>
            <p className="mt-1 text-xs text-gray-500">
              {order.inventory_suppliers?.name ?? "거래처 정보 없음"} ·{" "}
              {formatPurchaseAdjustmentDate(order.ordered_on)}
            </p>
          </div>
          {isAdmin && (
            <Button size="sm" variant="gray" onClick={onManageCategories}>
              거래 항목 관리
            </Button>
          )}
        </div>
        <div className="p-5">
          {categoriesError && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              거래 조정 SQL이 필요합니다.{" "}
              <code className="font-semibold">
                docs/inventory_purchase_adjustments.sql
              </code>
              을 실행해 주세요.
            </div>
          )}
          <p className="mb-4 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
            참고 기록이며 현재 입고금액이나 정산에는 자동 반영되지 않습니다.
          </p>
          <div className="grid gap-5 lg:grid-cols-2">
            {(["discount", "payment"] as const).map((kind) => (
              <section
                key={kind}
                className="rounded-xl border border-gray-200 bg-gray-50/70 p-4"
              >
                <div className="flex items-center justify-between">
                  <h3
                    className={`font-bold ${
                      kind === "discount" ? "text-blue-700" : "text-orange-700"
                    }`}
                  >
                    {kind === "discount" ? "할인된 항목" : "지불한 항목"}
                  </h3>
                  <strong className="text-sm text-gray-800">
                    {kind === "discount" ? "-" : "+"}
                    {totals[kind].toLocaleString("ko-KR")}원
                  </strong>
                </div>
                <div className="mt-3 space-y-3">
                  {rows
                    .filter((row) => row.kind === kind)
                    .map((row) => {
                      const options = categories.filter(
                        (item) =>
                          item.kind === kind &&
                          (item.is_active || item.id === row.categoryId) &&
                          (item.id === row.categoryId ||
                            !rows.some(
                              (candidate) =>
                                candidate.key !== row.key &&
                                candidate.categoryId === item.id,
                            )),
                      );
                      return (
                        <div
                          key={row.key}
                          className="space-y-2 rounded-xl border border-gray-200 bg-white p-3"
                        >
                          <div className="grid gap-2 sm:grid-cols-[minmax(140px,1fr)_140px_auto]">
                            <Dropdown controlledValue={row.categoryId}>
                              <Dropdown.Trigger>
                                {row.categoryName || "항목 선택"}
                              </Dropdown.Trigger>
                              <Dropdown.Content>
                                {options.map((option) => (
                                  <Dropdown.Item
                                    key={option.id}
                                    option={{
                                      value: option.id,
                                      label: option.name,
                                    }}
                                    onSelect={(selected: DropdownOption) => {
                                      const category = categories.find(
                                        (item) => item.id === selected.value,
                                      );
                                      if (category)
                                        updateRow(row.key, {
                                          categoryId: category.id,
                                          categoryName: category.name,
                                        });
                                    }}
                                  />
                                ))}
                              </Dropdown.Content>
                            </Dropdown>
                            <div className="relative">
                              <input
                                type="number"
                                min="0"
                                value={row.amount}
                                onChange={(event) =>
                                  updateRow(row.key, {
                                    amount: event.target.value,
                                  })
                                }
                                placeholder="0"
                                className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 pr-8 text-right text-sm font-semibold outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                                원
                              </span>
                            </div>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() =>
                                setRows((current) =>
                                  current.filter(
                                    (item) => item.key !== row.key,
                                  ),
                                )
                              }
                            >
                              삭제
                            </Button>
                          </div>
                          <input
                            value={row.note}
                            onChange={(event) =>
                              updateRow(row.key, { note: event.target.value })
                            }
                            placeholder="항목 메모"
                            className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                          />
                        </div>
                      );
                    })}
                  <Button
                    variant="gray"
                    className="w-full"
                    onClick={() => addRow(kind)}
                  >
                    {kind === "discount" ? "할인 항목 추가" : "지불 항목 추가"}
                  </Button>
                </div>
              </section>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-200 bg-gray-50 px-5 py-4">
          <Button variant="gray" onClick={onClose} disabled={saving}>
            취소
          </Button>
          <Button onClick={save} disabled={saving || categoriesError}>
            {saving ? "저장 중..." : "조정 내역 저장"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PurchaseAdjustmentCategoryOverlay({
  categories,
  onClose,
  onSaved,
}: {
  categories: PurchaseAdjustmentCategory[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [names, setNames] = useState<Record<string, string>>(() =>
    Object.fromEntries(categories.map((item) => [item.id, item.name])),
  );
  const [newNames, setNewNames] = useState<
    Record<PurchaseAdjustmentKind, string>
  >({ discount: "", payment: "" });
  const [pending, setPending] = useState(false);

  const run = async (task: () => Promise<void>, message: string) => {
    setPending(true);
    try {
      await task();
      toast.success(message);
      await onSaved();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-950/60 p-4 backdrop-blur-[2px]">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-bold text-gray-900">거래 항목 관리</h2>
          <p className="mt-1 text-xs text-gray-500">
            삭제한 항목은 새 입고에서 숨겨지고 기존 입고 기록에는 유지됩니다.
          </p>
        </div>
        <div className="grid gap-5 p-5 md:grid-cols-2">
          {(["discount", "payment"] as const).map((kind) => (
            <section
              key={kind}
              className="rounded-xl border border-gray-200 bg-gray-50/70 p-4"
            >
              <h3 className="font-bold text-gray-900">
                {kind === "discount" ? "할인 항목" : "지불 항목"}
              </h3>
              <div className="mt-3 space-y-2">
                {categories
                  .filter((item) => item.kind === kind && item.is_active)
                  .map((item) => (
                    <div key={item.id} className="flex gap-2">
                      <input
                        value={names[item.id] ?? item.name}
                        onChange={(event) =>
                          setNames((current) => ({
                            ...current,
                            [item.id]: event.target.value,
                          }))
                        }
                        className="h-10 min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                      />
                      <Button
                        size="sm"
                        variant="gray"
                        disabled={pending}
                        onClick={() =>
                          void run(
                            () =>
                              savePurchaseAdjustmentCategory({
                                id: item.id,
                                name: names[item.id] ?? item.name,
                                kind,
                              }),
                            "항목 이름을 수정했습니다.",
                          )
                        }
                      >
                        저장
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={pending}
                        onClick={() => {
                          if (
                            window.confirm(`‘${item.name}’ 항목을 삭제할까요?`)
                          )
                            void run(
                              () =>
                                deactivatePurchaseAdjustmentCategory(item.id),
                              "항목을 삭제했습니다.",
                            );
                        }}
                      >
                        삭제
                      </Button>
                    </div>
                  ))}
                <div className="flex gap-2 border-t border-gray-200 pt-3">
                  <input
                    value={newNames[kind]}
                    onChange={(event) =>
                      setNewNames((current) => ({
                        ...current,
                        [kind]: event.target.value,
                      }))
                    }
                    placeholder="새 항목 이름"
                    className="h-10 min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  />
                  <Button
                    size="sm"
                    disabled={pending || !newNames[kind].trim()}
                    onClick={() =>
                      void run(async () => {
                        await savePurchaseAdjustmentCategory({
                          name: newNames[kind],
                          kind,
                        });
                        setNewNames((current) => ({ ...current, [kind]: "" }));
                      }, "새 항목을 등록했습니다.")
                    }
                  >
                    항목 등록
                  </Button>
                </div>
              </div>
            </section>
          ))}
        </div>
        <div className="flex justify-end border-t border-gray-200 bg-gray-50 px-5 py-4">
          <Button onClick={onClose}>완료</Button>
        </div>
      </div>
    </div>
  );
}

function SupplierManagementTab({ isAdmin }: { isAdmin: boolean }) {
  const suppliersQuery = useQuery({
    queryKey: [...inventoryKeys.suppliers, isAdmin],
    queryFn: () => getInventorySuppliers(isAdmin),
  });
  if (suppliersQuery.isPending) {
    return <Loading size="sm" text="거래처를 불러오는 중..." />;
  }
  return (
    <SupplierManageOverlay
      suppliers={suppliersQuery.data ?? []}
      embedded
      onSaved={async () => {
        await suppliersQuery.refetch();
      }}
    />
  );
}

function SupplierManageOverlay({
  suppliers,
  onClose,
  onSaved,
  embedded = false,
}: {
  suppliers: InventorySupplier[];
  onClose?: () => void;
  onSaved: () => Promise<void>;
  embedded?: boolean;
}) {
  const homepageNotePattern = /\[\[homepage_url:(.*?)\]\]/;
  const defaultTaxInvoicePattern = /\[\[default_tax_invoice:(.*?)\]\]/;
  const splitSupplierNote = (note: string | null | undefined) => {
    const value = note ?? "";
    const homepageMatch = value.match(homepageNotePattern);
    return {
      homepage_url: homepageMatch?.[1] ?? "",
      default_tax_invoice_status: getSupplierDefaultTaxInvoiceStatus(value),
      note: value
        .replace(homepageNotePattern, "")
        .replace(defaultTaxInvoicePattern, "")
        .trim(),
    };
  };
  const mergeSupplierNote = (
    homepageUrl: string,
    defaultTaxInvoiceStatus: TaxInvoiceStatus,
    note: string,
  ) => {
    const cleanUrl = homepageUrl.trim();
    const cleanNote = note.trim();
    return [
      cleanUrl ? `[[homepage_url:${cleanUrl}]]` : "",
      defaultTaxInvoiceStatus
        ? `[[default_tax_invoice:${defaultTaxInvoiceStatus}]]`
        : "",
      cleanNote,
    ]
      .filter(Boolean)
      .join("\n");
  };
  const getHomepageHref = (homepageUrl: string) => {
    const cleanUrl = homepageUrl.trim();
    if (!cleanUrl) return "";
    return /^https?:\/\//i.test(cleanUrl) ? cleanUrl : `https://${cleanUrl}`;
  };
  const empty = {
    name: "",
    customer_service_phone: "",
    as_center_phone: "",
    courier_company: "",
    order_cutoff_time: "",
    homepage_url: "",
    default_tax_invoice_status: "" as TaxInvoiceStatus,
    note: "",
    is_use: true,
  };
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [defaultTaxInvoiceSearch, setDefaultTaxInvoiceSearch] = useState("");
  const [defaultTaxInvoicePickerOpen, setDefaultTaxInvoicePickerOpen] =
    useState(false);
  const defaultTaxInvoicePickerRef = useRef<HTMLDivElement>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [supplierEditing, setSupplierEditing] = useState(false);
  const [returnSupplierId, setReturnSupplierId] = useState<string | null>(null);
  useEffect(() => {
    if (!defaultTaxInvoicePickerOpen) return;
    const closePicker = (event: PointerEvent) => {
      if (!defaultTaxInvoicePickerRef.current?.contains(event.target as Node)) {
        setDefaultTaxInvoicePickerOpen(false);
      }
    };
    const closePickerWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDefaultTaxInvoicePickerOpen(false);
    };
    document.addEventListener("pointerdown", closePicker);
    document.addEventListener("keydown", closePickerWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closePicker);
      document.removeEventListener("keydown", closePickerWithEscape);
    };
  }, [defaultTaxInvoicePickerOpen]);
  const edit = (supplier: InventorySupplier) => {
    const supplierNote = splitSupplierNote(supplier.note);
    setEditorOpen(true);
    setSupplierEditing(false);
    setReturnSupplierId(null);
    setSelectedId(supplier.id);
    setDefaultTaxInvoiceSearch(supplierNote.default_tax_invoice_status);
    setDefaultTaxInvoicePickerOpen(false);
    setForm({
      name: supplier.name,
      customer_service_phone: supplier.customer_service_phone ?? "",
      as_center_phone: supplier.as_center_phone ?? "",
      courier_company: supplier.courier_company ?? "",
      order_cutoff_time: (supplier.order_cutoff_time ?? "").slice(0, 5),
      homepage_url: supplierNote.homepage_url,
      default_tax_invoice_status: supplierNote.default_tax_invoice_status,
      note: supplierNote.note,
      is_use: supplier.is_use,
    });
  };
  const save = async () => {
    setSaving(true);
    try {
      const { homepage_url, default_tax_invoice_status, ...supplierData } =
        form;
      const savedId = await saveInventorySupplier(selectedId, {
        ...supplierData,
        note: mergeSupplierNote(
          homepage_url,
          default_tax_invoice_status,
          supplierData.note,
        ),
      });
      toast.success("거래처를 저장했습니다.");
      await onSaved();
      setSelectedId(savedId);
      setEditorOpen(true);
      setSupplierEditing(false);
      setReturnSupplierId(null);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const startNew = () => {
    if (selectedId) setReturnSupplierId(selectedId);
    setSelectedId(null);
    setForm(empty);
    setDefaultTaxInvoiceSearch("");
    setDefaultTaxInvoicePickerOpen(false);
    setEditorOpen(true);
    setSupplierEditing(true);
  };
  const cancelEditing = () => {
    if (selectedId) {
      const selectedSupplier = suppliers.find(
        (supplier) => supplier.id === selectedId,
      );
      if (selectedSupplier) {
        edit(selectedSupplier);
        return;
      }
    }
    const previousSupplier = suppliers.find(
      (supplier) => supplier.id === returnSupplierId,
    );
    if (previousSupplier) {
      const supplierNote = splitSupplierNote(previousSupplier.note);
      setSelectedId(previousSupplier.id);
      setDefaultTaxInvoiceSearch(supplierNote.default_tax_invoice_status);
      setDefaultTaxInvoicePickerOpen(false);
      setForm({
        name: previousSupplier.name,
        customer_service_phone: previousSupplier.customer_service_phone ?? "",
        as_center_phone: previousSupplier.as_center_phone ?? "",
        courier_company: previousSupplier.courier_company ?? "",
        order_cutoff_time: (previousSupplier.order_cutoff_time ?? "").slice(
          0,
          5,
        ),
        homepage_url: supplierNote.homepage_url,
        default_tax_invoice_status: supplierNote.default_tax_invoice_status,
        note: supplierNote.note,
        is_use: previousSupplier.is_use,
      });
      setReturnSupplierId(null);
      setSupplierEditing(false);
      return;
    }
    setSelectedId(null);
    setForm(empty);
    setEditorOpen(false);
    setSupplierEditing(false);
  };
  const filteredSuppliers = suppliers.filter((supplier) =>
    supplier.name
      .toLocaleLowerCase("ko-KR")
      .includes(supplierSearch.trim().toLocaleLowerCase("ko-KR")),
  );
  const defaultTaxInvoiceSuggestions = TAX_INVOICE_OPTIONS.filter((option) =>
    option
      .toLocaleLowerCase("ko-KR")
      .includes(defaultTaxInvoiceSearch.trim().toLocaleLowerCase("ko-KR")),
  );
  return (
    <div
      className={
        embedded
          ? "w-full space-y-3"
          : "fixed inset-0 z-[130] flex items-center justify-center bg-gray-950/45 p-3 sm:p-6"
      }
    >
      {embedded && (
        <div className="flex justify-end">
          <Button size="sm" onClick={startNew}>
            거래처 추가
          </Button>
        </div>
      )}
      <section
        className={`flex w-full flex-col overflow-hidden rounded-2xl bg-white ${
          embedded
            ? "min-h-[620px] border border-gray-200 shadow-sm"
            : "max-h-[94vh] max-w-6xl shadow-2xl"
        }`}
      >
        {!embedded && (
          <header className="flex items-center justify-between border-b border-gray-100 px-5 py-4 sm:px-7">
            <div>
              <h2 className="text-xl font-bold text-gray-950">거래처 관리</h2>
              <p className="mt-1 text-sm text-gray-500">
                입고 주문에 사용할 거래처 정보와 주문 마감 시간을 관리합니다.
              </p>
            </div>
            {!embedded && (
              <button
                type="button"
                aria-label="닫기"
                onClick={onClose}
                className="flex h-10 w-10 items-center justify-center rounded-full text-2xl text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                ×
              </button>
            )}
          </header>
        )}

        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[340px_1fr] lg:overflow-hidden">
          <aside className="border-b border-gray-200 bg-gray-50 p-4 sm:p-5 lg:overflow-y-auto lg:border-b-0 lg:border-r">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-baseline gap-2">
                <h3 className="font-bold text-gray-900">거래처 목록</h3>
                <span className="text-xs text-gray-500">
                  총 {suppliers.length}곳
                </span>
              </div>
              {!embedded && (
                <Button size="sm" onClick={startNew}>
                  거래처 추가
                </Button>
              )}
            </div>
            <div className="relative mb-3">
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
                onChange={(event) => setSupplierSearch(event.target.value)}
                placeholder="거래처명 검색"
                className="min-h-11 w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-9 pr-10 text-sm font-medium text-gray-900 shadow-sm outline-none transition placeholder:font-normal placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
              {supplierSearch && (
                <button
                  type="button"
                  onClick={() => setSupplierSearch("")}
                  aria-label="거래처명 검색어 지우기"
                  className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-gray-100 text-base font-medium text-gray-500 transition hover:bg-gray-200 hover:text-gray-700 active:bg-gray-300"
                >
                  ×
                </button>
              )}
            </div>
            <div className="grid max-h-[450px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-1">
              {filteredSuppliers.length ? (
                filteredSuppliers.map((supplier) => (
                  <button
                    type="button"
                    key={supplier.id}
                    onClick={() => edit(supplier)}
                    className={`group w-full rounded-xl border p-4 text-left transition ${selectedId === supplier.id ? "border-brand-400 bg-white shadow-sm ring-1 ring-brand-200" : "border-gray-200 bg-white hover:border-brand-200 hover:shadow-sm"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <strong className="text-sm text-gray-900">
                        {supplier.name}
                      </strong>
                      <span
                        className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${supplier.is_use ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}
                      >
                        {supplier.is_use ? "사용" : "미사용"}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                      <span>택배 {supplier.courier_company || "미등록"}</span>
                      <span>
                        마감{" "}
                        {supplier.order_cutoff_time?.slice(0, 5) || "미등록"}
                      </span>
                    </div>
                  </button>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-10 text-center text-sm text-gray-400 sm:col-span-2 lg:col-span-1">
                  등록된 거래처가 없습니다.
                </div>
              )}
            </div>
          </aside>

          {!editorOpen && (
            <main className="flex min-h-[520px] flex-col items-center justify-center p-6 text-center sm:p-7">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
                <svg
                  className="h-7 w-7"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.6}
                    d="m21 21-4.35-4.35m2.1-5.4a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z"
                  />
                </svg>
              </div>
              <h3 className="mt-4 text-lg font-bold text-gray-900">
                거래처를 선택해 주세요
              </h3>
              <p className="mt-2 max-w-sm text-sm leading-6 text-gray-500">
                거래처명을 검색하고 선택하면 상세 정보를 확인하고 수정할 수
                있습니다.
              </p>
            </main>
          )}
          <main
            className={`${editorOpen ? "block" : "hidden"} p-5 sm:p-7 lg:overflow-y-auto`}
          >
            <div className="mb-6 flex items-center justify-between border-b border-gray-100 pb-4">
              <div>
                <p className="text-xs font-semibold text-brand-600">
                  {selectedId
                    ? supplierEditing
                      ? "거래처 정보 수정"
                      : "거래처 정보"
                    : "신규 거래처 등록"}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <h3 className="text-lg font-bold text-gray-950">
                    {selectedId
                      ? form.name || "거래처 정보"
                      : "새 거래처 정보를 입력해 주세요"}
                  </h3>
                  {!supplierEditing && (
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${form.is_use ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}
                    >
                      {form.is_use ? "사용" : "미사용"}
                    </span>
                  )}
                </div>
              </div>
              {supplierEditing && (
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-gray-700">
                    사용 상태
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={form.is_use}
                    onClick={() => setForm({ ...form, is_use: !form.is_use })}
                    className={`relative h-7 w-12 cursor-pointer rounded-full transition ${form.is_use ? "bg-brand-500" : "bg-gray-300"}`}
                  >
                    <span
                      className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${form.is_use ? "left-6" : "left-1"}`}
                    />
                  </button>
                </div>
              )}
            </div>

            <fieldset
              disabled={!supplierEditing}
              className="grid gap-x-4 gap-y-5 disabled:[&_input]:cursor-default disabled:[&_input]:border-transparent disabled:[&_input]:bg-transparent disabled:[&_input]:px-0 disabled:[&_input]:font-medium disabled:[&_input]:text-gray-900 disabled:[&_textarea]:cursor-default disabled:[&_textarea]:border-transparent disabled:[&_textarea]:bg-transparent disabled:[&_textarea]:p-0 disabled:[&_textarea]:font-medium disabled:[&_textarea]:text-gray-900 sm:grid-cols-2"
            >
              <label className="text-sm font-semibold text-gray-700">
                거래처명 <span className="text-brand-500">*</span>
                <input
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  placeholder="거래처명을 입력하세요"
                  className="mt-2 min-h-11 w-full rounded-xl border border-gray-200 px-3 font-normal outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                />
              </label>
              <label className="text-sm font-semibold text-gray-700">
                택배회사
                <input
                  value={form.courier_company}
                  onChange={(event) =>
                    setForm({ ...form, courier_company: event.target.value })
                  }
                  placeholder="예: CJ대한통운"
                  className="mt-2 min-h-11 w-full rounded-xl border border-gray-200 px-3 font-normal outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                />
              </label>
              <label className="text-sm font-semibold text-gray-700">
                고객센터
                <input
                  inputMode="tel"
                  value={form.customer_service_phone}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      customer_service_phone: event.target.value,
                    })
                  }
                  placeholder="전화번호를 입력하세요"
                  className="mt-2 min-h-11 w-full rounded-xl border border-gray-200 px-3 font-normal outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                />
              </label>
              <label className="text-sm font-semibold text-gray-700">
                A/S센터
                <input
                  inputMode="tel"
                  value={form.as_center_phone}
                  onChange={(event) =>
                    setForm({ ...form, as_center_phone: event.target.value })
                  }
                  placeholder="전화번호를 입력하세요"
                  className="mt-2 min-h-11 w-full rounded-xl border border-gray-200 px-3 font-normal outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                />
              </label>
              <label className="text-sm font-semibold text-gray-700">
                주문 마감 시간
                <input
                  type="time"
                  value={form.order_cutoff_time}
                  onChange={(event) =>
                    setForm({ ...form, order_cutoff_time: event.target.value })
                  }
                  className="mt-2 min-h-11 w-full rounded-xl border border-gray-200 px-3 font-normal outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                />
              </label>
              <div className="text-sm font-semibold text-gray-700">
                기본 발행 종류
                {supplierEditing ? (
                  <div
                    ref={defaultTaxInvoicePickerRef}
                    className="relative mt-2 w-full"
                  >
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
                      value={defaultTaxInvoiceSearch}
                      onFocus={() => setDefaultTaxInvoicePickerOpen(true)}
                      onChange={(event) => {
                        setDefaultTaxInvoiceSearch(event.target.value);
                        setForm({ ...form, default_tax_invoice_status: "" });
                        setDefaultTaxInvoicePickerOpen(true);
                      }}
                      placeholder="발행 종류를 검색하세요"
                      className="min-h-11 w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-9 pr-10 font-normal outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                    />
                    {defaultTaxInvoiceSearch && supplierEditing && (
                      <button
                        type="button"
                        onClick={() => {
                          setDefaultTaxInvoiceSearch("");
                          setForm({ ...form, default_tax_invoice_status: "" });
                          setDefaultTaxInvoicePickerOpen(true);
                        }}
                        aria-label="기본 발행 종류 선택 지우기"
                        className="absolute right-2 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-gray-100 text-base font-medium text-gray-500 transition hover:bg-gray-200 hover:text-gray-700"
                      >
                        ×
                      </button>
                    )}
                    {defaultTaxInvoicePickerOpen && supplierEditing && (
                      <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-xl">
                        {defaultTaxInvoiceSuggestions.length ? (
                          defaultTaxInvoiceSuggestions.map((option) => (
                            <button
                              type="button"
                              key={option}
                              onClick={() => {
                                setForm({
                                  ...form,
                                  default_tax_invoice_status: option,
                                });
                                setDefaultTaxInvoiceSearch(option);
                                setDefaultTaxInvoicePickerOpen(false);
                              }}
                              className="flex min-h-11 w-full cursor-pointer items-center justify-between rounded-lg px-3 text-left text-sm font-semibold text-gray-900 hover:bg-brand-50"
                            >
                              {option}
                              {form.default_tax_invoice_status === option && (
                                <span className="text-brand-500">✓</span>
                              )}
                            </button>
                          ))
                        ) : (
                          <p className="px-3 py-4 text-center text-sm font-normal text-gray-400">
                            검색 결과가 없습니다.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <p
                    className={`mt-2 text-sm font-medium ${form.default_tax_invoice_status ? "text-gray-900" : "text-gray-400"}`}
                  >
                    {form.default_tax_invoice_status || "미지정 상태입니다."}
                  </p>
                )}
              </div>
              <label className="text-sm font-semibold text-gray-700 sm:col-span-2">
                홈페이지 링크
                {supplierEditing ? (
                  <input
                    type="url"
                    inputMode="url"
                    value={form.homepage_url}
                    onChange={(event) =>
                      setForm({ ...form, homepage_url: event.target.value })
                    }
                    placeholder="예: https://example.com"
                    className="mt-2 min-h-11 w-full rounded-xl border border-gray-200 px-3 font-normal outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                  />
                ) : form.homepage_url.trim() ? (
                  <a
                    href={getHomepageHref(form.homepage_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 block w-fit cursor-pointer break-all text-sm font-medium text-brand-600 underline decoration-brand-300 underline-offset-4 hover:text-brand-700"
                  >
                    {form.homepage_url}
                  </a>
                ) : (
                  <p className="mt-2 text-sm font-medium text-gray-400">
                    미등록
                  </p>
                )}
              </label>
              <label className="text-sm font-semibold text-gray-700 sm:col-span-2">
                특이사항
                <textarea
                  value={form.note}
                  onChange={(event) =>
                    setForm({ ...form, note: event.target.value })
                  }
                  placeholder="주문이나 거래 시 참고할 내용을 입력하세요"
                  className="mt-2 h-14 w-full resize-none rounded-xl border border-gray-200 p-3 font-normal outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                />
              </label>
            </fieldset>

            <div className="mt-7 flex flex-col-reverse gap-2 border-t border-gray-100 pt-5 sm:flex-row sm:justify-end">
              {selectedId && !supplierEditing ? (
                <Button onClick={() => setSupplierEditing(true)}>
                  수정하기
                </Button>
              ) : (
                <>
                  <Button variant="gray" onClick={cancelEditing}>
                    취소하기
                  </Button>
                  <Button className="hidden" variant="gray" onClick={startNew}>
                    입력 초기화
                  </Button>
                  <Button onClick={save} disabled={saving || !form.name.trim()}>
                    {saving
                      ? "저장 중..."
                      : selectedId
                        ? "변경사항 저장"
                        : "거래처 등록"}
                  </Button>
                </>
              )}
            </div>
          </main>
        </div>
      </section>
    </div>
  );

  /* Legacy supplier form retained temporarily below for safe comparison. */
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-gray-950/50 p-3">
      <section className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold">거래처 관리</h2>
            <p className="mt-1 text-xs text-gray-500">
              거래처는 공용 재고 창고와 별개의 공급처 정보입니다.
            </p>
          </div>
          <button
            onClick={onClose}
            className="min-h-11 min-w-11 rounded-lg text-2xl text-gray-400 hover:bg-gray-100"
          >
            ×
          </button>
        </header>
        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-5 lg:grid-cols-[320px_1fr]">
          <div className="space-y-2">
            {suppliers.map((supplier) => (
              <button
                key={supplier.id}
                onClick={() => edit(supplier)}
                className={`w-full rounded-xl border p-3 text-left ${selectedId === supplier.id ? "border-brand-300 bg-brand-50" : "border-gray-200"}`}
              >
                <div className="flex justify-between">
                  <strong>{supplier.name}</strong>
                  <span className="text-xs text-gray-400">
                    {supplier.is_use ? "사용" : "미사용"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {supplier.courier_company || "택배회사 미등록"} ·{" "}
                  {supplier.order_cutoff_time?.slice(0, 5) || "마감시간 미등록"}
                </p>
              </button>
            ))}
          </div>
          <div className="grid content-start gap-3 sm:grid-cols-2">
            <label className="text-sm">
              거래처명
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 min-h-11 w-full rounded-lg border border-gray-200 px-3"
              />
            </label>
            <label className="text-sm">
              택배회사
              <input
                value={form.courier_company}
                onChange={(e) =>
                  setForm({ ...form, courier_company: e.target.value })
                }
                className="mt-1 min-h-11 w-full rounded-lg border border-gray-200 px-3"
              />
            </label>
            <label className="text-sm">
              고객센터
              <input
                value={form.customer_service_phone}
                onChange={(e) =>
                  setForm({ ...form, customer_service_phone: e.target.value })
                }
                className="mt-1 min-h-11 w-full rounded-lg border border-gray-200 px-3"
                placeholder="핸드폰번호"
              />
            </label>
            <label className="text-sm">
              A/S센터
              <input
                value={form.as_center_phone}
                onChange={(e) =>
                  setForm({ ...form, as_center_phone: e.target.value })
                }
                className="mt-1 min-h-11 w-full rounded-lg border border-gray-200 px-3"
                placeholder="핸드폰번호"
              />
            </label>
            <label className="text-sm">
              주문 마감 시간
              <input
                type="time"
                value={form.order_cutoff_time}
                onChange={(e) =>
                  setForm({ ...form, order_cutoff_time: e.target.value })
                }
                className="mt-1 min-h-11 w-full rounded-lg border border-gray-200 px-3"
              />
            </label>
            <label className="flex items-end gap-2 pb-3 text-sm">
              <input
                type="checkbox"
                checked={form.is_use}
                onChange={(e) => setForm({ ...form, is_use: e.target.checked })}
              />
              사용 거래처
            </label>
            <label className="text-sm sm:col-span-2">
              특이사항
              <textarea
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                className="mt-1 h-24 w-full rounded-lg border border-gray-200 p-3"
              />
            </label>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button
                variant="gray"
                onClick={() => {
                  setSelectedId(null);
                  setForm(empty);
                }}
              >
                거래처 추가
              </Button>
              <Button onClick={save} disabled={saving || !form.name.trim()}>
                {saving ? "저장 중..." : "거래처 저장"}
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function MovementHistory({
  movements,
  loading,
  isAdmin,
  onSaved,
  onOpenPurchaseOrder,
}: {
  movements: Awaited<ReturnType<typeof getInventoryMovements>>;
  loading: boolean;
  isAdmin: boolean;
  onSaved: () => Promise<void>;
  onOpenPurchaseOrder: (orderId: string) => void;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [dateMode, setDateMode] = useState<"today" | "custom">("today");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [visibleCount, setVisibleCount] = useState(10);
  const [movementToReverse, setMovementToReverse] = useState<
    (typeof movements)[number] | null
  >(null);
  const localDate = (value: string) => {
    const date = new Date(value);
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 10);
  };
  const today = localDate(new Date().toISOString());
  const reversedIds = new Set(
    movements.map((movement) => movement.reversed_movement_id).filter(Boolean),
  );
  const getMovementRoute = (
    movement: Awaited<ReturnType<typeof getInventoryMovements>>[number],
  ) => {
    if (!movement.counterparty_name) return movement.note || "-";

    if (movement.movement_type === "outbound_edit") {
      return `${movement.counterparty_name} 수정`;
    }
    if (movement.movement_type === "outbound_cancel") {
      return `${movement.counterparty_name} 취소`;
    }
    if (
      movement.inventory_action === "adjustment_out" ||
      (movement.counterparty_name.trim() === "재고조정" &&
        movement.movement_type === "sale_out")
    ) {
      return "재고조정 출고";
    }
    if (
      movement.inventory_action === "adjustment_in" ||
      (movement.counterparty_name.trim() === "재고조정" &&
        movement.movement_type === "exchange_in")
    ) {
      return "재고조정 입고";
    }
    if (
      movement.counterparty_name.trim() === "시연용" ||
      movement.item_remark?.trim().startsWith("시연용")
    ) {
      return "시연용 처리";
    }
    if (movement.inventory_action === "exchange_out") {
      return `${movement.counterparty_name} 교환출고`;
    }
    if (
      movement.inventory_action === "exchange_in" ||
      movement.movement_type === "exchange_in"
    ) {
      return `${movement.counterparty_name} 교환입고`;
    }

    if (movement.movement_type === "sale_out") {
      return `${movement.counterparty_name} 구매`;
    }
    if (movement.movement_type === "purchase_in") {
      return `${movement.counterparty_name} 입고`;
    }
    if (
      movement.movement_type === "reversal" &&
      movement.reference_type === "purchase_receipt_reversal"
    ) {
      return `${movement.counterparty_name} 입고 취소`;
    }
    return movement.note || "-";
  };
  const getMovementTypeLabel = (
    movement: Awaited<ReturnType<typeof getInventoryMovements>>[number],
  ) => {
    if (
      movement.movement_type === "outbound_cancel" &&
      (movement.counterparty_name?.trim() === "시연용" ||
        movement.item_remark?.trim().startsWith("시연용"))
    ) {
      return "시연용 처리 취소";
    }
    if (
      movement.movement_type === "outbound_edit" ||
      movement.movement_type === "outbound_cancel" ||
      movement.movement_type === "reversal"
    ) {
      return movementLabels[movement.movement_type];
    }
    if (
      movement.inventory_action === "adjustment_out" ||
      (movement.counterparty_name?.trim() === "재고조정" &&
        movement.movement_type === "sale_out")
    ) {
      return "출고/조정";
    }
    if (
      movement.inventory_action === "adjustment_in" ||
      (movement.counterparty_name?.trim() === "재고조정" &&
        movement.movement_type === "exchange_in")
    ) {
      return "입고/조정";
    }
    if (
      movement.counterparty_name?.trim() === "시연용" ||
      movement.item_remark?.trim().startsWith("시연용")
    ) {
      return "출고/시연용";
    }
    if (movement.inventory_action === "exchange_out") return "출고/교환";
    if (
      movement.inventory_action === "exchange_in" ||
      movement.movement_type === "exchange_in"
    ) {
      return "입고/교환";
    }
    return movementLabels[movement.movement_type] ?? movement.movement_type;
  };
  const automaticNotes = new Set([
    "출고 처리",
    "출고 수정",
    "출고 취소",
    "입고 처리",
  ]);
  const getDetailMemo = (note: string | null) =>
    note && !automaticNotes.has(note.trim()) ? note : "-";
  const dateFilteredMovements = movements.filter((movement) => {
    const date = localDate(movement.created_at);
    return dateMode === "today"
      ? date === today
      : Boolean(startDate) &&
          (endDate ? date >= startDate && date <= endDate : date === startDate);
  });
  const filtered = dateFilteredMovements.filter((movement) => {
    const keyword = search.trim().toLocaleLowerCase("ko-KR");
    return [movement.item_name, movement.counterparty_name ?? ""]
      .join(" ")
      .toLocaleLowerCase("ko-KR")
      .includes(keyword);
  });
  const periodMovementQuantity = dateFilteredMovements.reduce(
    (total, movement) => total + Math.abs(movement.quantity_delta),
    0,
  );
  const visibleMovements = filtered.slice(0, visibleCount);
  useEffect(() => {
    setVisibleCount(10);
  }, [search, dateMode, startDate, endDate]);
  const reverseMutation = useMutation({
    mutationFn: (movement: (typeof movements)[number]) => {
      if (
        movement.reference_type !== "purchase_receipt" ||
        !movement.reference_id
      ) {
        throw new Error("연결된 입고 전표를 찾을 수 없습니다.");
      }
      return reversePurchaseReceipt(
        movement.reference_id,
        "재고 변동 화면에서 입고 취소",
      );
    },
    onSuccess: async () => {
      setMovementToReverse(null);
      toast.success("입고를 취소했습니다.");
      await onSaved();
    },
    onError: (error) =>
      toast.error(error.message || "입고 취소에 실패했습니다."),
  });
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-stretch lg:gap-3">
          <div className="flex w-full flex-col rounded-xl border border-gray-200 bg-gray-50/70 p-2.5 sm:w-[120px] sm:shrink-0">
            <p className="mb-1 text-xs font-semibold text-gray-600">
              조회 기간
            </p>
            <Dropdown controlledValue={dateMode}>
              <Dropdown.Trigger compact>
                {dateMode === "today" ? "당일" : "날짜 선택"}
              </Dropdown.Trigger>
              <Dropdown.Content compact>
                {(
                  [
                    { value: "today", label: "당일" },
                    { value: "custom", label: "날짜 선택" },
                  ] as const
                ).map((option) => (
                  <Dropdown.Item
                    key={option.value}
                    option={option}
                    compact
                    onSelect={(selected: DropdownOption) => {
                      const nextMode = selected.value as "today" | "custom";
                      if (nextMode === "today") {
                        setStartDate("");
                        setEndDate("");
                      }
                      setDateMode(nextMode);
                    }}
                  />
                ))}
              </Dropdown.Content>
            </Dropdown>
          </div>
          {dateMode === "custom" && (
            <div className="flex w-full flex-col rounded-xl border border-gray-200 bg-gray-50/70 p-2.5 sm:w-[120px] sm:shrink-0">
              <p className="mb-1 text-xs font-semibold text-gray-600">
                날짜 선택
              </p>
              <KoreanDateRangePicker
                startDate={startDate}
                endDate={endDate}
                iconOnly
                onApply={(start, end) => {
                  setStartDate(start);
                  setEndDate(end);
                }}
              />
            </div>
          )}
          <div className="h-px w-full bg-gray-200 lg:h-auto lg:w-px lg:self-stretch" />
          <div className="w-full rounded-xl border border-gray-200 bg-gray-50/70 p-3 sm:w-[260px] sm:shrink-0">
            <label className="block w-full">
              <span className="mb-2 block text-xs font-semibold text-gray-500">
                품목명
              </span>
              <span className="relative block">
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
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="품목명 입력"
                  className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-10 text-sm font-medium text-gray-900 shadow-sm outline-none transition placeholder:font-normal placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="품목명 검색어 지우기"
                    className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-gray-100 text-base font-medium text-gray-500 transition hover:bg-gray-200 hover:text-gray-700"
                  >
                    ×
                  </button>
                )}
              </span>
            </label>
          </div>
        </div>
      </section>
      <div className="text-xs text-gray-600 sm:text-sm">
        변동 수량 :{" "}
        <span className="font-semibold text-brand-600">
          {periodMovementQuantity.toLocaleString()}개
        </span>
      </div>
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
        {loading ? (
          <Loading size="sm" text="이력을 불러오는 중..." />
        ) : (
          <div className="mt-3 overflow-auto rounded-xl border border-gray-200">
            <table className="w-full min-w-[850px] border-collapse text-sm">
              <thead className="bg-brand-50 text-brand-700">
                <tr>
                  {[
                    "처리일",
                    "구분",
                    "품목명",
                    "변동",
                    "처리 후",
                    "단가",
                    "이동 경로",
                    "메모",
                    "관리",
                  ].map((label) => (
                    <th
                      key={label}
                      className="border border-brand-200 px-3 py-3 text-left"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleMovements.length ? (
                  visibleMovements.map((movement) => (
                    <tr key={movement.id}>
                      <td className="whitespace-nowrap border border-gray-200 px-3 py-3">
                        {new Date(movement.created_at).toLocaleString("ko-KR")}
                      </td>
                      <td className="border border-gray-200 px-3 py-3">
                        {getMovementTypeLabel(movement)}
                      </td>
                      <td className="border border-gray-200 px-3 py-3 font-semibold">
                        {movement.item_name}
                      </td>
                      <td
                        className={`border border-gray-200 px-3 py-3 text-right font-bold ${movement.quantity_delta > 0 ? "text-blue-600" : "text-rose-600"}`}
                      >
                        {movement.quantity_delta > 0 ? "+" : ""}
                        {movement.quantity_delta}
                      </td>
                      <td className="border border-gray-200 px-3 py-3 text-right">
                        {movement.quantity_after}
                      </td>
                      <td className="border border-gray-200 px-3 py-3 text-right">
                        {movement.unit_price != null
                          ? `${movement.unit_price.toLocaleString()}원`
                          : "-"}
                      </td>
                      <td className="whitespace-nowrap border border-gray-200 px-3 py-3 font-medium">
                        {movement.counterparty_id ? (
                          <button
                            type="button"
                            onClick={() =>
                              router.push(
                                `/customers/${movement.counterparty_id}`,
                              )
                            }
                            className="font-semibold text-brand-700 underline decoration-brand-200 underline-offset-4 hover:text-brand-800 hover:decoration-brand-500"
                          >
                            {getMovementRoute(movement)}
                          </button>
                        ) : movement.purchase_order_id ? (
                          <button
                            type="button"
                            onClick={() =>
                              onOpenPurchaseOrder(movement.purchase_order_id!)
                            }
                            className="font-semibold text-brand-700 underline decoration-brand-200 underline-offset-4 hover:text-brand-800 hover:decoration-brand-500"
                          >
                            {getMovementRoute(movement)}
                          </button>
                        ) : (
                          <span className="text-gray-700">
                            {getMovementRoute(movement)}
                          </span>
                        )}
                      </td>
                      <td className="border border-gray-200 px-3 py-3 text-gray-500">
                        {getDetailMemo(movement.note)}
                      </td>
                      <td className="border border-gray-200 px-3 py-3">
                        {isAdmin &&
                          movement.movement_type === "purchase_in" &&
                          movement.reference_type === "purchase_receipt" &&
                          movement.reference_id &&
                          !reversedIds.has(movement.id) && (
                            <Button
                              size="xs"
                              variant="danger"
                              onClick={() => setMovementToReverse(movement)}
                              disabled={reverseMutation.isPending}
                            >
                              입고 취소
                            </Button>
                          )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-4 py-12 text-center text-gray-400"
                    >
                      조건에 맞는 재고 변동이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {visibleCount < filtered.length && (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => setVisibleCount((current) => current + 10)}
              className="min-h-10 rounded-lg border border-gray-300 bg-white px-5 text-sm font-semibold text-gray-700 shadow-sm hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
            >
              더 불러오기
            </button>
          </div>
        )}
      </section>
      {movementToReverse && (
        <ConfirmOverlay
          title="입고를 취소하시겠습니까?"
          description={`${movementToReverse.item_name} ${movementToReverse.quantity_delta.toLocaleString()}개 입고를 취소합니다.\n재고가 차감되고 입고 관리의 완료 수량과 주문 상태도 함께 되돌아갑니다.`}
          pending={reverseMutation.isPending}
          onCancel={() => setMovementToReverse(null)}
          onConfirm={() => reverseMutation.mutate(movementToReverse)}
        />
      )}
    </div>
  );
}

function TrackingSettingsOverlay({
  items,
  onClose,
  onSaved,
}: {
  items: InventoryItem[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const categories = [
    ...new Set(
      items
        .map((item) => item.category_name)
        .filter((name): name is string => Boolean(name)),
    ),
  ].sort((a, b) => a.localeCompare(b, "ko-KR"));
  const [untrackedCategories, setUntrackedCategories] = useState(
    () =>
      new Set(
        categories.filter((category) =>
          items.some(
            (item) =>
              item.category_name === category &&
              item.tracking_mode === "inherit" &&
              !item.is_tracked,
          ),
        ),
      ),
  );
  const [itemModes, setItemModes] = useState<
    Record<string, "inherit" | "tracked" | "untracked">
  >(() =>
    Object.fromEntries(
      items.map((item) => [item.item_name, item.tracking_mode]),
    ),
  );
  const [search, setSearch] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      saveInventoryTrackingSettings({
        untrackedCategories: [...untrackedCategories],
        itemModes: Object.fromEntries(
          Object.entries(itemModes).filter(([, mode]) => mode !== "inherit"),
        ) as Record<string, "tracked" | "untracked">,
      }),
    onSuccess: async () => {
      toast.success("재고 대상 설정을 저장했습니다.");
      await onSaved();
    },
    onError: (error) =>
      toast.error(error.message || "설정 저장에 실패했습니다."),
  });
  const filteredItems = items.filter((item) =>
    `${item.item_name} ${item.item_code}`
      .toLocaleLowerCase("ko-KR")
      .includes(search.toLocaleLowerCase("ko-KR")),
  );
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-950/50 p-3"
      onPointerDown={(event) =>
        event.target === event.currentTarget && onClose()
      }
    >
      <section className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">재고 대상 설정</h2>
            <p className="mt-1 text-xs text-gray-500">
              기초재고 등록 전과 등록 후 언제든 변경할 수 있습니다. 기존 수량과
              이력은 보존됩니다.
            </p>
          </div>
          <button
            onClick={onClose}
            className="min-h-11 min-w-11 rounded-lg text-2xl text-gray-400 hover:bg-gray-100"
          >
            ×
          </button>
        </header>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <section>
            <h3 className="font-semibold text-gray-900">품목 종류 전체 설정</h3>
            <p className="mt-1 text-xs text-gray-500">
              선택한 종류의 품목은 기본적으로 수량을 관리하지 않고 -로
              표시합니다.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((category) => (
                <label
                  key={category}
                  className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 ${untrackedCategories.has(category) ? "border-brand-300 bg-brand-50" : "border-gray-200"}`}
                >
                  <input
                    type="checkbox"
                    checked={untrackedCategories.has(category)}
                    onChange={() =>
                      setUntrackedCategories((current) => {
                        const next = new Set(current);
                        if (next.has(category)) next.delete(category);
                        else next.add(category);
                        return next;
                      })
                    }
                  />
                  <span className="text-sm font-medium">{category}</span>
                  <span className="ml-auto text-xs text-gray-400">- 적용</span>
                </label>
              ))}
            </div>
          </section>
          <section>
            <h3 className="font-semibold text-gray-900">품목별 예외 설정</h3>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="품목명 또는 코드 검색"
              className="mt-3 min-h-11 w-full rounded-lg border border-gray-200 px-4 text-sm outline-none focus:border-brand-400"
            />
            <div className="mt-3 max-h-80 overflow-auto rounded-xl border border-gray-200">
              <table className="w-full min-w-[620px] border-collapse text-sm">
                <thead className="sticky top-0 bg-brand-50 text-brand-700">
                  <tr>
                    <th className="border border-brand-200 px-3 py-3 text-left">
                      품목 종류
                    </th>
                    <th className="border border-brand-200 px-3 py-3 text-left">
                      품목명
                    </th>
                    <th className="border border-brand-200 px-3 py-3 text-left">
                      적용 방식
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr key={item.item_name}>
                      <td className="border border-gray-200 px-3 py-2 text-gray-500">
                        {item.category_name ?? "미분류"}
                      </td>
                      <td className="border border-gray-200 px-3 py-2 font-medium">
                        {item.item_name}
                      </td>
                      <td className="border border-gray-200 p-2">
                        <select
                          value={itemModes[item.item_name] ?? "inherit"}
                          onChange={(event) =>
                            setItemModes((current) => ({
                              ...current,
                              [item.item_name]: event.target.value as
                                "inherit" | "tracked" | "untracked",
                            }))
                          }
                          className="min-h-10 w-full rounded-lg border border-gray-200 bg-white px-3"
                        >
                          <option value="inherit">품목 종류 설정 따르기</option>
                          <option value="tracked">재고 관리</option>
                          <option value="untracked">수량 미관리 (-)</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
        <footer className="flex justify-end gap-2 border-t border-gray-200 px-5 py-4">
          <Button variant="gray" onClick={onClose}>
            취소
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "저장 중..." : "설정 저장"}
          </Button>
        </footer>
      </section>
    </div>
  );
}

function ConfirmOverlay({
  title,
  description,
  pending,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-950/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-2xl">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <p className="mt-3 whitespace-pre-line text-sm leading-6 text-gray-600">
          {description}
        </p>
        <div className="mt-6 grid grid-cols-2 gap-2">
          <Button variant="gray" onClick={onCancel} disabled={pending}>
            취소
          </Button>
          <Button onClick={onConfirm} disabled={pending}>
            {pending ? "처리 중..." : "확정"}
          </Button>
        </div>
      </div>
    </div>
  );
}
