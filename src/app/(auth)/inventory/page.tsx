"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import Button from "@/app/_components/Button";
import Loading from "@/app/_components/Loading";
import KoreanDatePicker from "@/app/_components/KoreanDatePicker";
import { useUser } from "@/app/_contexts/UserContext";
import {
  adjustInventory,
  getInventoryMovements,
  getInventoryOverview,
  initializeInventory,
  addInitialInventoryEntries,
  resetInventoryForReinitialization,
  inventoryKeys,
  normalizeInventoryItemName,
  reverseInventoryMovement,
  saveInventoryTrackingSettings,
  getInventorySuppliers,
  saveInventorySupplier,
  getPurchaseOrders,
  createPurchaseOrder,
  setPurchaseArrivalQuantity,
  checkPurchaseArrivalQuantity,
  processPurchaseArrival,
  closePurchaseOrderRemainder,
  reversePurchaseReceipt,
  deletePurchaseOrderHistory,
} from "@/app/_domains/_inventory/_services/inventoryService";
import type {
  InventoryItem,
  InventorySupplier,
  PurchaseOrder,
} from "@/app/_domains/_inventory/_types/inventory.types";

type Tab = "stock" | "receive" | "movements" | "initial";
type ReceiptRow = {
  id: number;
  itemName: string;
  quantity: string;
  unitPrice: string;
  note: string;
};

const movementLabels: Record<string, string> = {
  initial: "기초재고",
  purchase_in: "입고",
  adjustment: "재고 조정",
  reversal: "입고 취소",
  sale_out: "출고",
  exchange_in: "교환/입고",
  outbound_edit: "출고 수정",
  outbound_cancel: "출고 취소",
};

export default function InventoryPage() {
  const { isAdmin } = useUser();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("stock");
  const [settingsOpen, setSettingsOpen] = useState(false);
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
      <div className="flex items-end justify-between border-b border-gray-200">
        <div className="flex" role="tablist" aria-label="재고 관리 메뉴">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "stock"}
            onClick={() => setTab("stock")}
            className={`border-b-2 px-5 py-3 text-sm font-semibold transition-colors ${
              tab === "stock"
                ? "border-brand-500 text-brand-700"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
            }`}
          >
            재고 현황
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "movements"}
            onClick={() => setTab("movements")}
            className={`border-b-2 px-5 py-3 text-sm font-semibold transition-colors ${tab === "movements" ? "border-brand-500 text-brand-700" : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"}`}
          >
            재고 변동
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "receive"}
            onClick={() => setTab("receive")}
            className={`border-b-2 px-5 py-3 text-sm font-semibold transition-colors ${
              tab === "receive"
                ? "border-brand-500 text-brand-700"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
            }`}
          >
            입고 관리
          </button>
          {isAdmin && (
            <button
              type="button"
              role="tab"
              aria-selected={tab === "initial"}
              onClick={() => setTab("initial")}
              className={`border-b-2 px-5 py-3 text-sm font-semibold transition-colors ${
                tab === "initial"
                  ? "border-brand-500 text-brand-700"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
              }`}
            >
              기초 재고 입고
            </button>
          )}
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="mb-2 min-h-11 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            재고 대상 설정
          </button>
        )}
      </div>

      {!initializedAt ? (
        isAdmin ? (
          <>
            <InitialStockSetup
              items={items.filter((item) => item.item_code)}
              initialized={false}
              onSaved={refresh}
            />
            <UntrackedOverview
              items={items.filter((item) => !item.is_tracked && item.item_code)}
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
        <>
          <StockOverview
            items={items.filter((item) => item.is_tracked)}
            isAdmin={isAdmin}
            onSaved={refresh}
          />
          <UntrackedOverview
            items={items.filter((item) => !item.is_tracked && item.is_use)}
          />
        </>
      ) : tab === "receive" ? (
        <ReceiptManager
          items={items.filter((item) => item.is_use)}
          isAdmin={isAdmin}
          onSaved={refresh}
        />
      ) : (
        <MovementHistory
          movements={movementsQuery.data ?? []}
          loading={movementsQuery.isPending}
          isAdmin={isAdmin}
          onSaved={refresh}
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

function StockOverview({
  items,
  isAdmin,
  onSaved,
}: {
  items: InventoryItem[];
  isAdmin: boolean;
  onSaved: () => Promise<void>;
}) {
  const [nameSearch, setNameSearch] = useState("");
  const [codeSearch, setCodeSearch] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [status, setStatus] = useState<"all" | "normal" | "out" | "negative">(
    "all",
  );
  const [usage, setUsage] = useState<"all" | "active" | "inactive">("active");
  const [adjusting, setAdjusting] = useState<InventoryItem | null>(null);
  const [dateMode, setDateMode] = useState<"today" | "single" | "range">(
    "today",
  );
  const [singleDate, setSingleDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sort, setSort] = useState<{
    key: "category" | "code" | "name" | "usage" | "quantity" | "updated";
    direction: "asc" | "desc";
  }>({ key: "code", direction: "asc" });
  const localDate = (value: string) => {
    const date = new Date(value);
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 10);
  };
  const filtered = items
    .filter((item) => {
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
        (dateMode === "single"
          ? Boolean(singleDate) && date === singleDate
          : Boolean(date) &&
            (!startDate || date >= startDate) &&
            (!endDate || date <= endDate));
      return (
        matchesName &&
        matchesCode &&
        matchesCategory &&
        matchesDate &&
        (usage === "all" ||
          (usage === "active" ? item.is_use : !item.is_use)) &&
        (status === "all" || status === itemStatus)
      );
    })
    .sort((a, b) => {
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
    });
  const changeSort = (key: typeof sort.key) =>
    setSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  const copyForKakao = async () => {
    const text = [
      "품목코드\t품목명\t현재재고",
      ...filtered.map(
        (item) =>
          `${item.item_code || "-"}\t${item.item_name}\t${item.quantity === 0 ? "품절" : `${item.quantity}개`}`,
      ),
    ].join("\n");
    await navigator.clipboard.writeText(text);
    toast.success(`${filtered.length}개 품목을 복사했습니다.`);
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
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="space-y-3">
        <div className="grid overflow-hidden rounded-xl border border-gray-200 bg-white lg:grid-cols-[minmax(420px,1fr)_320px_240px] lg:items-end">
          <div className="grid min-w-0 grid-cols-3 gap-0">
            <label className="min-w-0 p-2 text-xs font-semibold text-gray-600">
              품목명
              <input
                value={nameSearch}
                onChange={(event) => setNameSearch(event.target.value)}
                placeholder="품목명 입력"
                className="mt-1.5 min-h-11 w-full min-w-0 rounded-lg border border-gray-200 px-2 text-sm font-normal outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
            </label>
            <label className="min-w-0 border-l border-gray-200 p-2 text-xs font-semibold text-gray-600">
              품목 코드
              <input
                value={codeSearch}
                onChange={(event) => setCodeSearch(event.target.value)}
                placeholder="품목 코드 입력"
                className="mt-1.5 min-h-11 w-full min-w-0 rounded-lg border border-gray-200 px-2 text-sm font-normal outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
            </label>
            <label className="min-w-0 border-l border-gray-200 p-2 text-xs font-semibold text-gray-600">
              품목 종류
              <input
                value={categorySearch}
                onChange={(event) => setCategorySearch(event.target.value)}
                placeholder="품목 종류 입력"
                className="mt-1.5 min-h-11 w-full min-w-0 rounded-lg border border-gray-200 px-2 text-sm font-normal outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
            </label>
          </div>
          <div className="border-t border-gray-200 p-3 lg:border-l lg:border-t-0">
            <p className="mb-1.5 text-xs font-semibold text-gray-600">
              재고 상태
            </p>
            <div className="grid w-full grid-cols-4 gap-1 rounded-lg bg-gray-100 p-1">
              {(
                [
                  ["all", "전체"],
                  ["normal", "정상"],
                  ["out", "품절"],
                  ["negative", "마이너스"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setStatus(value)}
                  className={`min-h-10 rounded-md px-3 text-xs font-semibold ${status === value ? "bg-white text-brand-700 shadow-sm" : "text-gray-500"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="border-t border-gray-200 p-3 lg:border-l lg:border-t-0">
            <p className="mb-1.5 text-xs font-semibold text-gray-600">
              사용 구분
            </p>
            <div className="grid w-full grid-cols-3 gap-1 rounded-lg bg-gray-100 p-1">
              {(
                [
                  ["all", "전체"],
                  ["active", "사용"],
                  ["inactive", "미사용"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setUsage(value)}
                  className={`min-h-10 rounded-md px-3 text-xs font-semibold ${usage === value ? "bg-white text-brand-700 shadow-sm" : "text-gray-500"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 lg:flex-row lg:items-end">
          <div className="w-full lg:w-[320px]">
            <p className="mb-1.5 text-xs font-semibold text-gray-600">
              조회 기간
            </p>
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-gray-200 p-1">
              {(
                [
                  ["today", "당일"],
                  ["single", "단일 날짜"],
                  ["range", "기간"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setDateMode(value)}
                  className={`min-h-10 rounded-md px-3 text-xs font-semibold ${dateMode === value ? "bg-white text-brand-700 shadow-sm" : "text-gray-500"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {dateMode === "single" && (
            <div className="min-w-[260px]">
              <KoreanDatePicker
                value={singleDate}
                onChange={setSingleDate}
                selectedLabel="조회 날짜"
              />
            </div>
          )}
          {dateMode === "range" && (
            <div className="grid min-w-0 flex-1 items-center gap-2 sm:grid-cols-[minmax(220px,1fr)_auto_minmax(220px,1fr)] lg:max-w-2xl">
              <KoreanDatePicker
                value={startDate}
                onChange={(value) => {
                  setStartDate(value);
                  if (endDate && endDate < value) setEndDate("");
                }}
                selectedLabel="시작 날짜"
              />
              <span className="text-gray-400">~</span>
              <KoreanDatePicker
                value={endDate}
                onChange={(value) => {
                  if (startDate && value < startDate) {
                    toast.error("종료 날짜는 시작 날짜 이후로 선택해 주세요.");
                    return;
                  }
                  setEndDate(value);
                }}
                selectedLabel="종료 날짜"
              />
            </div>
          )}
          <span className="text-xs text-gray-500">
            {dateMode === "today" ? "현재 재고 기준" : "최근 변동일 기준"} ·{" "}
            {filtered.length}개
          </span>
          <div className="lg:ml-auto">
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
      </div>
      <div className="mt-4 overflow-auto rounded-xl border border-gray-200">
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
                        sort.key === heading.key
                          ? "text-brand-700"
                          : "text-gray-300"
                      }
                    >
                      {sort.key === heading.key
                        ? sort.direction === "asc"
                          ? "▲"
                          : "▼"
                        : "↕"}
                    </span>
                  </button>
                </th>
              ))}
              <th className="border border-brand-200 px-4 py-3 text-left">
                관리
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => {
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
                  <td className="border border-gray-200 px-4 py-3">
                    {isAdmin && (
                      <Button
                        size="xs"
                        variant="gray"
                        onClick={() => setAdjusting(item)}
                      >
                        조정
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {adjusting && (
        <AdjustmentOverlay
          item={adjusting}
          onClose={() => setAdjusting(null)}
          onSaved={async () => {
            setAdjusting(null);
            await onSaved();
          }}
        />
      )}
    </section>
  );
}

function UntrackedOverview({ items }: { items: InventoryItem[] }) {
  if (!items.length) return null;
  return (
    <section className="mt-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
      <h2 className="font-semibold text-gray-900">수량 미관리 품목</h2>
      <p className="mt-1 text-xs text-gray-500">
        기존 재고와 이력은 보존되며 현재 수량은 -로 표시됩니다.
      </p>
      <div className="mt-4 overflow-auto rounded-xl border border-gray-200">
        <table className="w-full min-w-[620px] border-collapse text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              {["품목 종류", "품목 코드", "품목명", "현재 재고"].map(
                (label) => (
                  <th
                    key={label}
                    className="border border-gray-200 px-4 py-3 text-left"
                  >
                    {label}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
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
                <td className="border border-gray-200 px-4 py-3 text-center text-lg font-bold text-gray-400">
                  -
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ReceiptManager({
  items: allItems,
  isAdmin,
  onSaved,
}: {
  items: InventoryItem[];
  isAdmin: boolean;
  onSaved: () => Promise<void>;
}) {
  const items = allItems.filter((item) => item.is_tracked);
  const [nextId, setNextId] = useState(2);
  const [rows, setRows] = useState<ReceiptRow[]>([
    {
      id: 1,
      itemName: "",
      quantity: "1",
      unitPrice: isAdmin ? "0" : "",
      note: "",
    },
  ]);
  const [note, setNote] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false);
  const [activeItemRow, setActiveItemRow] = useState<number | null>(null);
  const [orderedOn, setOrderedOn] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createStep, setCreateStep] = useState<1 | 2 | 3>(1);
  const suppliersQuery = useQuery({
    queryKey: [...inventoryKeys.suppliers, isAdmin],
    queryFn: () => getInventorySuppliers(isAdmin),
  });
  const ordersQuery = useQuery({
    queryKey: [...inventoryKeys.purchaseOrders, isAdmin],
    queryFn: () => getPurchaseOrders(isAdmin),
  });
  const receiveMutation = useMutation({
    mutationFn: () =>
      createPurchaseOrder(
        supplierId,
        orderedOn,
        note,
        rows
          .filter((row) => row.itemName && Number(row.quantity) > 0)
          .map((row) => ({
            item_name: row.itemName,
            quantity: Number(row.quantity),
            unit_price: row.unitPrice ? Number(row.unitPrice) : null,
            note: row.note,
          })),
      ),
    onSuccess: async () => {
      toast.success("입고 예정으로 등록했습니다.");
      setRows([
        {
          id: nextId,
          itemName: "",
          quantity: "1",
          unitPrice: isAdmin ? "0" : "",
          note: "",
        },
      ]);
      setNextId((id) => id + 1);
      setNote("");
      setCreateOpen(false);
      setCreateStep(1);
      await ordersQuery.refetch();
      await onSaved();
    },
    onError: (error) =>
      toast.error(error.message || "입고 예정 등록에 실패했습니다."),
  });
  const validRows = rows.filter(
    (row) =>
      items.some((item) => item.item_name === row.itemName) &&
      Number(row.quantity) > 0,
  );
  const hasDuplicateItems =
    new Set(validRows.map((row) => row.itemName)).size !== validRows.length;
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

  const addRow = () => {
    setRows((current) => [
      ...current,
      {
        id: nextId,
        itemName: "",
        quantity: "1",
        unitPrice: isAdmin ? "0" : "",
        note: "",
      },
    ]);
    setNextId((id) => id + 1);
  };

  return (
    <div>
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">입고 예정</h2>
            <p className="mt-1 text-xs text-gray-500">
              먼저 주문을 등록하고, 상품 도착 후 수량 확인을 거쳐 입고
              처리합니다.
            </p>
          </div>
          <div className="flex gap-2">
            {isAdmin && (
              <Button
                size="sm"
                variant="gray"
                onClick={() => setSupplierOpen(true)}
              >
                거래처 관리
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => {
                setSupplierId("");
                setSupplierSearch("");
                setSupplierPickerOpen(false);
                setRows([
                  {
                    id: nextId,
                    itemName: "",
                    quantity: "1",
                    unitPrice: isAdmin ? "0" : "",
                    note: "",
                  },
                ]);
                setNextId((id) => id + 1);
                setNote("");
                setActiveItemRow(null);
                setCreateStep(1);
                setCreateOpen(true);
              }}
            >
              + 입고 예정 등록
            </Button>
          </div>
        </div>
      </section>

      {createOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-gray-950/45 p-3 sm:p-6">
          <section
            className={`flex h-[min(780px,calc(100vh-24px))] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl transition-[max-width] ${createStep === 2 ? "max-w-6xl" : "max-w-3xl"}`}
          >
            <header className="flex items-center justify-between border-b border-gray-100 px-5 py-4 sm:px-7">
              <h2 className="text-xl font-bold text-gray-950">
                입고 예정 등록
              </h2>
              <button
                type="button"
                aria-label="닫기"
                onClick={() => setCreateOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full text-2xl text-gray-400 hover:bg-gray-100 hover:text-gray-700"
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
                    거래처와 주문일을 선택해 주세요.
                  </p>
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <label className="text-sm font-medium text-gray-700">
                      거래처 <span className="text-brand-500">*</span>
                      <div className="relative mt-1">
                        <input
                          value={supplierSearch}
                          onFocus={() => setSupplierPickerOpen(true)}
                          onChange={(event) => {
                            setSupplierSearch(event.target.value);
                            setSupplierId("");
                            setSupplierPickerOpen(true);
                          }}
                          placeholder="거래처명을 검색하세요"
                          className="min-h-11 w-full rounded-lg border border-gray-200 bg-white px-3 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                        />
                        {supplierPickerOpen && (
                          <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-xl">
                            {supplierSuggestions.length ? (
                              supplierSuggestions.map((supplier) => (
                                <button
                                  type="button"
                                  key={supplier.id}
                                  onClick={() => {
                                    setSupplierId(supplier.id);
                                    setSupplierSearch(supplier.name);
                                    setSupplierPickerOpen(false);
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
                    <label className="text-sm font-medium text-gray-700">
                      주문일 <span className="text-brand-500">*</span>
                      <div className="mt-1">
                        <KoreanDatePicker
                          value={orderedOn}
                          onChange={setOrderedOn}
                          selectedLabel="주문일"
                        />
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {createStep === 2 && (
                <div>
                  <div className="mb-4 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700">
                    <strong>{selectedSupplier?.name}</strong>
                    <span className="mx-2 text-gray-300">|</span>주문일{" "}
                    {orderedOn}
                  </div>
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.8fr)]">
                    <div className="rounded-2xl border border-gray-200 p-4 sm:p-5">
                      <h3 className="mb-3 font-bold text-gray-900">
                        품목 선택
                      </h3>
                      <div className="space-y-2">
                        {rows.map((row) => (
                          <div
                            key={row.id}
                            className="grid items-end gap-3 rounded-xl border border-gray-200 bg-white p-3 md:grid-cols-[minmax(200px,1fr)_80px_minmax(170px,210px)_28px]"
                          >
                            <div className="relative">
                              <span className="mb-1 block text-xs font-semibold text-gray-600">
                                품목명
                              </span>
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
                                className="min-h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
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
                                          onClick={() => {
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
                            <select
                              value={row.itemName}
                              onChange={(event) =>
                                setRows((current) =>
                                  current.map((item) =>
                                    item.id === row.id
                                      ? {
                                          ...item,
                                          itemName: event.target.value,
                                        }
                                      : item,
                                  ),
                                )
                              }
                              className="hidden"
                            >
                              <option value="">품목 선택</option>
                              {items
                                .filter((item) => item.item_code)
                                .map((item) => (
                                  <option
                                    key={item.item_name}
                                    value={item.item_name}
                                  >
                                    {item.item_name} (현재 {item.quantity}개)
                                  </option>
                                ))}
                            </select>
                            <label className="block min-w-0">
                              <span className="mb-1 block text-xs font-semibold text-gray-600">
                                수량
                              </span>
                              <input
                                type="number"
                                inputMode="numeric"
                                aria-label="주문 수량"
                                min={1}
                                max={999}
                                value={row.quantity}
                                onChange={(event) =>
                                  setRows((current) =>
                                    current.map((item) =>
                                      item.id === row.id
                                        ? {
                                            ...item,
                                            quantity: event.target.value
                                              .replace(/\D/g, "")
                                              .slice(0, 3),
                                          }
                                        : item,
                                    ),
                                  )
                                }
                                className="min-h-11 w-full rounded-lg border border-brand-200 bg-brand-50/40 px-2 text-right text-base font-bold text-gray-900 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                                placeholder="수량"
                              />
                            </label>
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
                                        ? {
                                            ...item,
                                            unitPrice: event.target.value,
                                          }
                                        : item,
                                    ),
                                  )
                                }
                                className="hidden"
                                placeholder="매입 단가"
                              />
                            )}
                            <label className="block min-w-0">
                              <span className="mb-1 block text-xs font-semibold text-gray-600">
                                품목별 메모
                              </span>
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
                                className="min-h-11 w-full min-w-0 rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                                aria-label="품목별 메모"
                                placeholder="메모를 입력하세요. (선택)"
                              />
                            </label>
                            <div className="flex h-11 items-center justify-center">
                              <button
                                type="button"
                                onClick={() =>
                                  setRows((current) =>
                                    current.length === 1
                                      ? current.map((item) =>
                                          item.id === row.id
                                            ? {
                                                ...item,
                                                itemName: "",
                                                quantity: "1",
                                                note: "",
                                              }
                                            : item,
                                        )
                                      : current.filter(
                                          (item) => item.id !== row.id,
                                        ),
                                  )
                                }
                                className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white shadow-sm hover:bg-brand-600"
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={addRow}
                        className="mt-3 min-h-11 w-full rounded-xl border border-dashed border-brand-300 text-sm font-semibold text-brand-700 hover:bg-brand-50"
                      >
                        + 품목 추가
                      </button>
                      {hasDuplicateItems && (
                        <p className="mt-2 text-xs font-medium text-rose-600">
                          같은 품목이 중복 선택되었습니다. 한 줄로 합쳐 주세요.
                        </p>
                      )}
                      <textarea
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        placeholder="주문 전체 메모 (선택)"
                        className="mt-3 h-20 w-full resize-none rounded-xl border border-gray-200 p-3 text-sm"
                      />
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 sm:p-5">
                      <h3 className="font-bold text-gray-900">
                        품목 목록{" "}
                        <span className="ml-1 text-sm font-normal text-gray-500">
                          {validRows.length}개
                        </span>
                      </h3>
                      {validRows.length ? (
                        <div className="mt-3 space-y-2">
                          {validRows.map((row) => (
                            <div
                              key={row.id}
                              className="rounded-xl border border-gray-200 bg-white p-3"
                            >
                              <div className="flex justify-between gap-3 text-sm">
                                <span className="font-semibold text-gray-900">
                                  {row.itemName}
                                </span>
                                <span className="shrink-0 font-bold text-brand-600">
                                  {Number(row.quantity).toLocaleString()}개
                                </span>
                              </div>
                              {row.note && (
                                <p className="mt-1 text-xs text-gray-500">
                                  {row.note}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-gray-400">
                          추가된 품목이 없습니다.
                        </p>
                      )}
                    </div>
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
                        </div>
                        <span className="text-right font-bold">
                          {Number(row.quantity).toLocaleString()}개
                        </span>
                      </div>
                    ))}
                  </div>
                  {note && (
                    <div className="rounded-xl border border-gray-200 p-4 text-sm text-gray-700">
                      <strong>전체 메모</strong>
                      <p className="mt-1 whitespace-pre-wrap">{note}</p>
                    </div>
                  )}
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
                      ? !supplierId || !orderedOn
                      : !validRows.length || hasDuplicateItems
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
                    ? "등록 중..."
                    : `${validRows.length}개 품목 입고 예정 등록`}
                </Button>
              )}
            </footer>
          </section>
        </div>
      )}

      <PurchaseOrderList
        orders={ordersQuery.data ?? []}
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
              {
                id: nextId,
                itemName: "",
                quantity: "1",
                unitPrice: isAdmin ? "0" : "",
                note: "",
              },
            ]);
            setNextId((id) => id + 1);
          }}
          className="mt-3 min-h-11 w-full rounded-xl border border-dashed border-brand-300 text-sm font-semibold text-brand-700 hover:bg-brand-50"
        >
          + 품목 추가
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
  loading,
  isAdmin,
  onSaved,
}: {
  orders: PurchaseOrder[];
  loading: boolean;
  isAdmin: boolean;
  onSaved: () => Promise<void>;
}) {
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [arrivalDates, setArrivalDates] = useState<Record<string, string>>({});
  const [arrivalNotes, setArrivalNotes] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [listTab, setListTab] = useState<"waiting" | "history">("waiting");
  const [historySupplierSearch, setHistorySupplierSearch] = useState("");
  const [historyDateMode, setHistoryDateMode] = useState<
    "all" | "single" | "range"
  >("all");
  const [historySingleDate, setHistorySingleDate] = useState("");
  const [historyStartDate, setHistoryStartDate] = useState("");
  const [historyEndDate, setHistoryEndDate] = useState("");
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
  const waitingOrders = orders.filter(
    (order) => order.status === "pending" || order.status === "partial",
  );
  const historyOrders = orders.filter(
    (order) => order.status !== "pending" && order.status !== "partial",
  );
  const filteredHistoryOrders = historyOrders.filter((order) => {
    const matchesSupplier = (order.inventory_suppliers?.name ?? "")
      .toLocaleLowerCase("ko-KR")
      .includes(historySupplierSearch.trim().toLocaleLowerCase("ko-KR"));
    const receiptDates = order.inventory_purchase_receipts.map(
      (receipt) => receipt.arrived_on,
    );
    const matchesDate =
      historyDateMode === "all" ||
      (historyDateMode === "single"
        ? Boolean(historySingleDate) && receiptDates.includes(historySingleDate)
        : receiptDates.some(
            (date) =>
              (!historyStartDate || date >= historyStartDate) &&
              (!historyEndDate || date <= historyEndDate),
          ));
    return matchesSupplier && matchesDate;
  });
  const visibleOrders =
    listTab === "waiting" ? waitingOrders : filteredHistoryOrders;
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
  if (loading)
    return <Loading size="sm" text="입고 예정 목록을 불러오는 중..." />;
  return (
    <section className="mt-4 space-y-3">
      <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-2 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1 sm:w-[360px]">
          <button
            type="button"
            onClick={() => setListTab("waiting")}
            className={`min-h-11 rounded-lg px-4 text-sm font-bold transition ${listTab === "waiting" ? "bg-white text-brand-700 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
          >
            입고 대기{" "}
            <span className="ml-1 text-xs">{waitingOrders.length}</span>
          </button>
          <button
            type="button"
            onClick={() => setListTab("history")}
            className={`min-h-11 rounded-lg px-4 text-sm font-bold transition ${listTab === "history" ? "bg-white text-brand-700 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
          >
            처리 이력{" "}
            <span className="ml-1 text-xs">{historyOrders.length}</span>
          </button>
        </div>
        <span className="px-3 text-sm text-gray-500">
          {visibleOrders.length.toLocaleString()}건
        </span>
      </div>
      {listTab === "waiting" && waitingOrders.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
          <span className="shrink-0 text-xs font-bold text-gray-500">
            거래처 바로가기
          </span>
          {waitingOrders.map((order) => (
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
      {listTab === "history" && (
        <div className="grid gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm lg:grid-cols-[minmax(220px,1fr)_300px_minmax(280px,1fr)] lg:items-end">
          <label className="text-xs font-semibold text-gray-600">
            거래처명 검색
            <input
              value={historySupplierSearch}
              onChange={(event) => setHistorySupplierSearch(event.target.value)}
              placeholder="거래처명을 입력하세요"
              className="mt-1.5 min-h-11 w-full rounded-lg border border-gray-200 px-3 text-sm font-normal outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
          </label>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-gray-600">
              조회 기간
            </p>
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-gray-100 p-1">
              {(
                [
                  ["all", "전체"],
                  ["single", "단일 날짜"],
                  ["range", "기간"],
                ] as const
              ).map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => setHistoryDateMode(value)}
                  className={`min-h-10 rounded-md px-2 text-xs font-semibold ${historyDateMode === value ? "bg-white text-brand-700 shadow-sm" : "text-gray-500"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            {historyDateMode === "all" ? (
              <div className="flex min-h-11 items-center rounded-lg bg-gray-50 px-3 text-sm text-gray-500">
                모든 도착일을 조회합니다.
              </div>
            ) : historyDateMode === "single" ? (
              <KoreanDatePicker
                value={historySingleDate}
                onChange={setHistorySingleDate}
                selectedLabel="조회 도착일"
              />
            ) : (
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <KoreanDatePicker
                  value={historyStartDate}
                  onChange={setHistoryStartDate}
                  selectedLabel="시작 도착일"
                />
                <span className="text-gray-400">~</span>
                <KoreanDatePicker
                  value={historyEndDate}
                  onChange={setHistoryEndDate}
                  selectedLabel="종료 도착일"
                />
              </div>
            )}
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
        const showPartialDetails = order.status === "partial";
        const hasCheckedItems = order.inventory_purchase_order_lines.some(
          (line) => line.quantity_checked_at,
        );
        const sortedReceipts = [...order.inventory_purchase_receipts].sort(
          (a, b) => a.created_at.localeCompare(b.created_at),
        );
        return (
          <article
            id={`purchase-order-${order.id}`}
            key={order.id}
            className="overflow-visible rounded-2xl border border-gray-200 bg-white shadow-sm"
          >
            <header className="flex flex-wrap items-center gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3">
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-bold ${order.status === "completed" ? "bg-emerald-100 text-emerald-700" : order.status === "partial" ? "bg-blue-100 text-blue-700" : order.status === "closed" || order.status === "cancelled" ? "bg-gray-200 text-gray-600" : "bg-amber-100 text-amber-700"}`}
              >
                {statusLabels[order.status]}
              </span>
              <strong>
                {order.inventory_suppliers?.name ?? "거래처 정보 없음"}
              </strong>
              <span className="text-sm text-gray-500">
                주문일: {formatKoreanDate(order.ordered_on)}
              </span>
              {order.inventory_purchase_receipts.map((receipt) => (
                <div
                  key={receipt.id}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm"
                >
                  <span className="text-gray-500">
                    도착일: {formatKoreanDate(receipt.arrived_on)}
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
                              () => reversePurchaseReceipt(receipt.id, reason),
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
              {order.note && (
                <span className="text-sm text-gray-500">
                  전체 메모: {order.note}
                </span>
              )}
              {order.status === "closed" && order.closed_reason && (
                <span className="rounded-lg bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-700">
                  미입고 종료 사유: {order.closed_reason}
                </span>
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
                  className="ml-auto"
                >
                  이력 삭제
                </Button>
              )}
            </header>
            <div className={`${open ? "block" : "hidden"} overflow-auto`}>
              <table className="purchase-order-table w-full min-w-[820px] table-fixed border-collapse text-sm">
                <colgroup>
                  <col className="w-[240px]" />
                  <col className="w-[80px]" />
                  {showPartialDetails && <col className="w-[90px]" />}
                  {showPartialDetails && <col className="w-[90px]" />}
                  {showPartialDetails && <col className="w-[100px]" />}
                  <col className="w-[100px]" />
                  <col className="w-[280px]" />
                  <col className="w-[120px]" />
                </colgroup>
                <thead className="bg-brand-50 text-brand-700">
                  <tr>
                    {[
                      "품목명",
                      "주문",
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
                          {line.item_name}
                        </td>
                        <td className="border border-gray-200 px-3 py-3 text-right">
                          {line.ordered_quantity}개
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
                            <div className="flex flex-col gap-1">
                              <input
                                type="number"
                                min={0}
                                inputMode="numeric"
                                value={value}
                                onChange={(event) =>
                                  setQuantities((current) => ({
                                    ...current,
                                    [line.id]: event.target.value,
                                  }))
                                }
                                className="min-h-10 w-full rounded-lg border border-gray-200 px-2 text-right"
                              />
                              <Button
                                size="xs"
                                variant="gray"
                                disabled={
                                  pending ||
                                  !Number.isInteger(Number(value)) ||
                                  Number(value) < 0
                                }
                                onClick={() => {
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
                              >
                                수량 저장
                              </Button>
                            </div>
                          ) : open ? (
                            <div className="flex items-center justify-end gap-2">
                              <strong className="text-gray-900">
                                {line.pending_quantity}개
                              </strong>
                              <Button
                                size="xs"
                                variant="gray"
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
                                수정
                              </Button>
                            </div>
                          ) : (
                            <strong className="block text-right text-gray-900">
                              {line.received_quantity}개
                            </strong>
                          )}
                        </td>
                        <td className="border border-gray-200 px-3 py-3 text-gray-500">
                          {line.note || line.quantity_check_note ? (
                            <div className="space-y-1">
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
                            "-"
                          )}
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
                          ) : open && line.pending_quantity > 0 ? (
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
            {!open && order.inventory_purchase_receipts.length > 0 && (
              <div className="overflow-auto">
                <table className="purchase-order-table w-full min-w-[1080px] table-fixed border-collapse text-sm">
                  <colgroup>
                    <col className="w-[190px]" />
                    <col className="w-[220px]" />
                    <col className="w-[90px]" />
                    <col className="w-[110px]" />
                    <col className="w-[100px]" />
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
                        "이전 누적 입고",
                        "남은 수량",
                        "입고 수량",
                        "입고 차이",
                        "개별 메모",
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
                    {sortedReceipts.flatMap((receipt, receiptIndex) =>
                      receipt.inventory_purchase_receipt_lines.map(
                        (receiptLine) => {
                          const orderLine =
                            order.inventory_purchase_order_lines.find(
                              (line) => line.id === receiptLine.order_line_id,
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
                              <td className="border border-gray-200 px-3 py-3 text-right">
                                {previousReceived}개
                              </td>
                              <td className="border border-gray-200 px-3 py-3 text-right font-bold">
                                {remainingBefore}개
                              </td>
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
                                    {(receiptLine.note || orderLine?.note) && (
                                      <p>
                                        {cleanQuantityMemo(
                                          receiptLine.note || orderLine?.note,
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
            )}
            {!open && order.status === "closed" && (
              <div className="overflow-auto border-t border-gray-200">
                <table className="w-full min-w-[760px] table-fixed border-collapse text-sm">
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
                    {order.inventory_purchase_order_lines.map((line) => (
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
                        <td className="border border-gray-200 px-3 py-3 text-right font-bold text-amber-700">
                          {Math.max(
                            0,
                            line.ordered_quantity - line.received_quantity,
                          )}
                          개
                        </td>
                        <td className="border border-gray-200 px-3 py-3 break-words text-gray-600">
                          {order.closed_reason || "미입고 종료"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {open && (
              <footer className="border-t border-gray-200 bg-gray-50 p-4 sm:p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">
                      입고 처리
                    </h3>
                    <p className="mt-1 text-xs text-gray-500">
                      수량 확인이 끝난 품목의 도착일을 선택해 주세요.
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-bold ${hasCheckedItems ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-500"}`}
                  >
                    {hasCheckedItems ? "입고 처리 가능" : "수량 확인 필요"}
                  </span>
                </div>
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
    </section>
  );
}

function SupplierManageOverlay({
  suppliers,
  onClose,
  onSaved,
}: {
  suppliers: InventorySupplier[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const empty = {
    name: "",
    customer_service_phone: "",
    as_center_phone: "",
    courier_company: "",
    order_cutoff_time: "",
    note: "",
    is_use: true,
  };
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [returnSupplierId, setReturnSupplierId] = useState<string | null>(null);
  const edit = (supplier: InventorySupplier) => {
    setEditorOpen(true);
    setReturnSupplierId(null);
    setSelectedId(supplier.id);
    setForm({
      name: supplier.name,
      customer_service_phone: supplier.customer_service_phone ?? "",
      as_center_phone: supplier.as_center_phone ?? "",
      courier_company: supplier.courier_company ?? "",
      order_cutoff_time: (supplier.order_cutoff_time ?? "").slice(0, 5),
      note: supplier.note ?? "",
      is_use: supplier.is_use,
    });
  };
  const save = async () => {
    setSaving(true);
    try {
      await saveInventorySupplier(selectedId, form);
      toast.success("거래처를 저장했습니다.");
      await onSaved();
      setSelectedId(null);
      setForm(empty);
      setEditorOpen(false);
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
    setEditorOpen(true);
  };
  const cancelEditing = () => {
    const previousSupplier = suppliers.find(
      (supplier) => supplier.id === returnSupplierId,
    );
    if (previousSupplier) {
      setSelectedId(previousSupplier.id);
      setForm({
        name: previousSupplier.name,
        customer_service_phone: previousSupplier.customer_service_phone ?? "",
        as_center_phone: previousSupplier.as_center_phone ?? "",
        courier_company: previousSupplier.courier_company ?? "",
        order_cutoff_time: (previousSupplier.order_cutoff_time ?? "").slice(
          0,
          5,
        ),
        note: previousSupplier.note ?? "",
        is_use: previousSupplier.is_use,
      });
      setReturnSupplierId(null);
      return;
    }
    setSelectedId(null);
    setForm(empty);
    setEditorOpen(false);
  };
  const filteredSuppliers = suppliers.filter((supplier) =>
    supplier.name
      .toLocaleLowerCase("ko-KR")
      .includes(supplierSearch.trim().toLocaleLowerCase("ko-KR")),
  );

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-gray-950/45 p-3 sm:p-6">
      <section className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-gray-100 px-5 py-4 sm:px-7">
          <div>
            <h2 className="text-xl font-bold text-gray-950">거래처 관리</h2>
            <p className="mt-1 text-sm text-gray-500">
              입고 주문에 사용할 거래처 정보와 주문 마감 시간을 관리합니다.
            </p>
          </div>
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full text-2xl text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            ×
          </button>
        </header>

        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[340px_1fr] lg:overflow-hidden">
          <aside className="border-b border-gray-200 bg-gray-50 p-4 sm:p-5 lg:overflow-y-auto lg:border-b-0 lg:border-r">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900">거래처 목록</h3>
                <p className="mt-0.5 text-xs text-gray-500">
                  총 {suppliers.length}곳
                </p>
              </div>
              <Button size="sm" onClick={startNew}>
                + 새 거래처
              </Button>
            </div>
            <div className="relative mb-3">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                ⌕
              </span>
              <input
                value={supplierSearch}
                onChange={(event) => setSupplierSearch(event.target.value)}
                placeholder="거래처명 검색"
                className="min-h-11 w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
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
            <main className="flex min-h-[430px] flex-col items-center justify-center p-6 text-center sm:p-7">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-2xl text-brand-600">
                ⌕
              </div>
              <h3 className="mt-4 text-lg font-bold text-gray-900">
                거래처를 선택해 주세요
              </h3>
              <p className="mt-2 max-w-sm text-sm leading-6 text-gray-500">
                거래처명을 검색하고 선택하면 상세 정보를 확인하고 수정할 수
                있습니다.
              </p>
              <div className="mt-5">
                <Button size="sm" onClick={startNew}>
                  + 거래처 추가
                </Button>
              </div>
            </main>
          )}
          <main
            className={`${editorOpen ? "block" : "hidden"} p-5 sm:p-7 lg:overflow-y-auto`}
          >
            <div className="mb-6 flex items-center justify-between border-b border-gray-100 pb-4">
              <div>
                <p className="text-xs font-semibold text-brand-600">
                  {selectedId ? "거래처 정보 수정" : "신규 거래처 등록"}
                </p>
                <h3 className="mt-1 text-lg font-bold text-gray-950">
                  {selectedId
                    ? form.name || "거래처 정보"
                    : "새 거래처 정보를 입력해 주세요"}
                </h3>
              </div>
              {selectedId && (
                <Button size="sm" variant="gray" onClick={startNew}>
                  신규 등록으로 전환
                </Button>
              )}
            </div>

            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
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
              <label className="flex min-h-[70px] cursor-pointer items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-gray-800">
                    사용 상태
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    입고 등록 거래처 목록에 표시합니다.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.is_use}
                  onClick={() => setForm({ ...form, is_use: !form.is_use })}
                  className={`relative h-7 w-12 rounded-full transition ${form.is_use ? "bg-brand-500" : "bg-gray-300"}`}
                >
                  <span
                    className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${form.is_use ? "left-6" : "left-1"}`}
                  />
                </button>
              </label>
              <label className="text-sm font-semibold text-gray-700 sm:col-span-2">
                특이사항
                <textarea
                  value={form.note}
                  onChange={(event) =>
                    setForm({ ...form, note: event.target.value })
                  }
                  placeholder="주문이나 거래 시 참고할 내용을 입력하세요"
                  className="mt-2 h-28 w-full resize-none rounded-xl border border-gray-200 p-3 font-normal outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                />
              </label>
            </div>

            <div className="mt-7 flex flex-col-reverse gap-2 border-t border-gray-100 pt-5 sm:flex-row sm:justify-end">
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
                새 거래처
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
}: {
  movements: Awaited<ReturnType<typeof getInventoryMovements>>;
  loading: boolean;
  isAdmin: boolean;
  onSaved: () => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [dateMode, setDateMode] = useState<"today" | "single" | "range">(
    "today",
  );
  const [singleDate, setSingleDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const localDate = (value: string) => {
    const date = new Date(value);
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 10);
  };
  const today = localDate(new Date().toISOString());
  const todayLabel = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date(`${today}T00:00:00`));
  const formatSelectedDate = (value: string) =>
    value
      ? new Intl.DateTimeFormat("ko-KR", {
          year: "numeric",
          month: "long",
          day: "numeric",
          weekday: "long",
        }).format(new Date(`${value}T00:00:00`))
      : "날짜를 선택하세요";
  const reversedIds = new Set(
    movements.map((movement) => movement.reversed_movement_id).filter(Boolean),
  );
  const filtered = movements.filter((movement) => {
    const matchesSearch = movement.item_name
      .toLocaleLowerCase("ko-KR")
      .includes(search.trim().toLocaleLowerCase("ko-KR"));
    const date = localDate(movement.created_at);
    const matchesDate =
      dateMode === "today"
        ? date === today
        : dateMode === "single"
          ? Boolean(singleDate) && date === singleDate
          : (!startDate || date >= startDate) && (!endDate || date <= endDate);
    return matchesSearch && matchesDate;
  });
  const reverseMutation = useMutation({
    mutationFn: reverseInventoryMovement,
    onSuccess: async () => {
      toast.success("입고를 취소했습니다.");
      await onSaved();
    },
    onError: (error) =>
      toast.error(error.message || "입고 취소에 실패했습니다."),
  });
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="grid overflow-visible rounded-xl border border-gray-200 bg-gray-50 lg:grid-cols-[minmax(260px,1fr)_320px_minmax(260px,1fr)]">
        <div className="p-3">
          <label className="mb-1.5 block text-xs font-semibold text-gray-600">
            품목명 검색
          </label>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="품목명을 입력하세요"
            className="min-h-11 w-full rounded-lg border border-gray-200 bg-white px-4 text-sm outline-none focus:border-brand-400"
          />
        </div>
        <div className="border-t border-gray-200 p-3 lg:border-l lg:border-t-0">
          <p className="mb-1.5 text-xs font-semibold text-gray-600">
            조회 기간
          </p>
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-gray-200 p-1">
            {(
              [
                ["today", "당일"],
                ["single", "단일 날짜"],
                ["range", "기간"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setDateMode(value)}
                className={`min-h-10 rounded-md px-3 text-xs font-semibold ${dateMode === value ? "bg-white text-brand-700 shadow-sm" : "text-gray-500"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="border-t border-gray-200 p-3 lg:border-l lg:border-t-0">
          {dateMode === "today" ? (
            <div className="flex h-full min-h-11 flex-col justify-center">
              <p className="text-xs font-semibold text-gray-600">
                오늘 재고 변동
              </p>
              <div className="mt-1 flex items-baseline justify-between gap-3">
                <span className="text-sm text-gray-500">{todayLabel}</span>
                <strong className="text-lg text-brand-700">
                  {filtered.length.toLocaleString()}건
                </strong>
              </div>
            </div>
          ) : dateMode === "single" ? (
            <>
              <p className="mb-1.5 text-xs font-semibold text-gray-600">
                조회 날짜
              </p>
              <KoreanDatePicker
                value={singleDate}
                onChange={setSingleDate}
                selectedLabel="조회 날짜"
              />
              <p className="mt-2 flex items-baseline justify-between gap-3 text-sm text-gray-500">
                <span>{formatSelectedDate(singleDate)}</span>
                <strong className="text-lg text-brand-700">
                  {filtered.length.toLocaleString()}건
                </strong>
              </p>
            </>
          ) : (
            <>
              <p className="mb-1.5 text-xs font-semibold text-gray-600">
                시작일 ~ 종료일
              </p>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr]">
                <KoreanDatePicker
                  value={startDate}
                  onChange={(value) => {
                    setStartDate(value);
                    if (endDate && endDate < value) setEndDate("");
                  }}
                  selectedLabel="시작 날짜"
                />
                <span className="self-center text-gray-400">~</span>
                <KoreanDatePicker
                  value={endDate}
                  onChange={(value) => {
                    if (startDate && value < startDate) {
                      toast.error(
                        "종료 날짜는 시작 날짜 이후로 선택해 주세요.",
                      );
                      return;
                    }
                    setEndDate(value);
                  }}
                  selectedLabel="종료 날짜"
                />
              </div>
              <p className="mt-2 flex items-baseline justify-between gap-3 text-sm text-gray-500">
                <span>
                  {startDate || endDate
                    ? `${formatSelectedDate(startDate)} ~ ${formatSelectedDate(endDate)}`
                    : "기간을 선택하세요"}
                </span>
                <strong className="text-lg text-brand-700">
                  {filtered.length.toLocaleString()}건
                </strong>
              </p>
            </>
          )}
        </div>
      </div>
      <div className="mt-4">
        <h2 className="text-lg font-semibold text-gray-900">재고 변동</h2>
      </div>
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
              {filtered.length ? (
                filtered.map((movement) => (
                  <tr key={movement.id}>
                    <td className="whitespace-nowrap border border-gray-200 px-3 py-3">
                      {new Date(movement.created_at).toLocaleString("ko-KR")}
                    </td>
                    <td className="border border-gray-200 px-3 py-3">
                      {movementLabels[movement.movement_type] ??
                        movement.movement_type}
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
                    <td className="border border-gray-200 px-3 py-3 text-gray-500">
                      {movement.note || "-"}
                    </td>
                    <td className="border border-gray-200 px-3 py-3">
                      {isAdmin &&
                        movement.movement_type === "purchase_in" &&
                        !reversedIds.has(movement.id) && (
                          <Button
                            size="xs"
                            variant="danger"
                            onClick={() => reverseMutation.mutate(movement.id)}
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
                    colSpan={8}
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
    </section>
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

function AdjustmentOverlay({
  item,
  onClose,
  onSaved,
}: {
  item: InventoryItem;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [note, setNote] = useState("");
  const mutation = useMutation({
    mutationFn: () => adjustInventory(item.item_name, Number(quantity), note),
    onSuccess: async () => {
      toast.success("재고를 조정했습니다.");
      await onSaved();
    },
    onError: (error) =>
      toast.error(error.message || "재고 조정에 실패했습니다."),
  });
  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-gray-950/50 p-4"
      onPointerDown={(event) =>
        event.target === event.currentTarget && onClose()
      }
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="text-lg font-semibold">재고 조정</h2>
        <p className="mt-1 text-sm text-gray-500">
          {item.item_name} · 현재 {item.quantity}개
        </p>
        <label className="mt-5 block text-sm font-medium">
          실제 재고 수량
          <input
            type="number"
            inputMode="numeric"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            className="mt-2 min-h-12 w-full rounded-lg border border-gray-200 px-4 text-right text-lg font-bold"
          />
        </label>
        <label className="mt-4 block text-sm font-medium">
          조정 사유
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="mt-2 h-24 w-full resize-none rounded-lg border border-gray-200 p-3 text-sm"
            placeholder="재고 실사, 파손 확인 등"
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="gray" onClick={onClose}>
            취소
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={
              !note.trim() ||
              !Number.isInteger(Number(quantity)) ||
              mutation.isPending
            }
          >
            조정 저장
          </Button>
        </div>
      </div>
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
