"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toBlob } from "html-to-image";
import toast from "react-hot-toast";
import Button from "@/app/_components/Button";
import supabase from "@/libs/supabaseClient";
import { getPurchaseOrders } from "@/app/_domains/_inventory/_services/inventoryService";

type Entry = {
  id: string;
  entry_date: string;
  entry_type: "receipt" | "balance" | "payment";
  item_name: string | null;
  quantity: number | null;
  unit_price: number | null;
  amount: number;
  payment_method: string | null;
  note: string | null;
  related_receipt_id: string | null;
  source_receipt_id: string | null;
};
const labels = {
  receipt: "입고",
  balance: "이월/잔금",
  payment: "지급",
} as const;

const formatReceiptDate = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

export default function ComprehensiveSettlement() {
  const client = useQueryClient();
  const receiptCaptureRef = useRef<HTMLTableElement>(null);
  const [paymentMethod, setPaymentMethod] = useState("현금");
  const [selectedReceiptId, setSelectedReceiptId] = useState<string | null>(
    null,
  );
  const [balanceAmount, setBalanceAmount] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [draftBalanceAmount, setDraftBalanceAmount] = useState<number | null>(
    null,
  );
  const [draftPayment, setDraftPayment] = useState<{
    amount: number;
    method: string;
  } | null>(null);
  const [editingReceiptId, setEditingReceiptId] = useState<string | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingAmount, setEditingAmount] = useState("");
  const [editingNote, setEditingNote] = useState("");
  const [editingPaymentMethod, setEditingPaymentMethod] = useState("현금");
  const query = useQuery({
    queryKey: ["comprehensive-settlement"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comprehensive_settlement_entries")
        .select(
          "id,entry_date,entry_type,item_name,quantity,unit_price,amount,payment_method,note,source_receipt_id,related_receipt_id",
        )
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Entry[];
    },
  });
  const receiptQuery = useQuery({
    queryKey: ["comprehensive-settlement", "supplier-receipts"],
    queryFn: () => getPurchaseOrders(true),
  });
  const entries = query.data ?? [];
  const importedReceiptIds = new Set(
    entries.map((entry) => entry.source_receipt_id).filter(Boolean),
  );
  const allSupplierReceipts = (receiptQuery.data ?? [])
    .filter((order) => order.inventory_suppliers?.name.trim() === "종합")
    .flatMap((order) =>
      order.inventory_purchase_receipts
        .filter((receipt) => !receipt.reversed_at)
        .filter((receipt) => receipt.arrived_on >= "2026-08-20")
        .map((receipt) => {
          const lines = receipt.inventory_purchase_receipt_lines.map(
            (line) => ({
              ...line,
              unitPrice:
                order.inventory_purchase_order_lines.find(
                  (orderLine) => orderLine.id === line.order_line_id,
                )?.unit_price ?? null,
            }),
          );
          return {
            receipt,
            lines,
            amount: lines.reduce(
              (sum, line) =>
                sum +
                (line.unitPrice == null ? 0 : line.quantity * line.unitPrice),
              0,
            ),
            hasMissingPrice: lines.some((line) => line.unitPrice == null),
          };
        }),
    );
  const supplierReceipts = allSupplierReceipts.filter(
    (row) => !importedReceiptIds.has(row.receipt.id),
  );
  // 표와 불러오기 버튼은 입고 전표당 한 줄만 표시한다.
  const supplierReceiptLines = supplierReceipts.map((row) => ({
    receipt: row.receipt,
    line: {
      id: row.receipt.id,
      item_name: `${row.lines.length}개 품목 입고 전표`,
      quantity: 1,
    },
    unitPrice: row.amount,
    hasMissingPrice: row.hasMissingPrice,
    receiptRow: row,
  }));
  const supplierReceiptDateById = new Map(
    allSupplierReceipts.map((row) => [row.receipt.id, row.receipt.arrived_on]),
  );
  const receivable = entries
    .filter((entry) => entry.entry_type !== "payment")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const paid = entries
    .filter((entry) => entry.entry_type === "payment")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const selectedReceipt =
    allSupplierReceipts.find((row) => row.receipt.id === selectedReceiptId) ??
    null;
  const selectedReceiptEntries = selectedReceipt
    ? entries.filter(
        (entry) => entry.related_receipt_id === selectedReceipt.receipt.id,
      )
    : [];
  const savedBalanceAmount = selectedReceiptEntries
    .filter((entry) => entry.entry_type === "balance")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const savedPaymentsByMethod = selectedReceiptEntries
    .filter((entry) => entry.entry_type === "payment")
    .reduce<Record<string, number>>((payments, entry) => {
      const method = entry.payment_method || "기타";
      payments[method] = (payments[method] ?? 0) + entry.amount;
      return payments;
    }, {});
  const savedPaymentAmount = Object.values(savedPaymentsByMethod).reduce(
    (sum, value) => sum + value,
    0,
  );
  const selectedSavedBalanceAmount =
    editingReceiptId === selectedReceiptId ? 0 : savedBalanceAmount;
  const selectedSavedPaymentAmount =
    editingReceiptId === selectedReceiptId ? 0 : savedPaymentAmount;
  const isViewingCompletedReceipt =
    Boolean(selectedReceiptId && importedReceiptIds.has(selectedReceiptId)) &&
    editingReceiptId !== selectedReceiptId;
  const selectedFinalAmount = selectedReceipt
    ? selectedReceipt.amount +
      selectedSavedBalanceAmount +
      (draftBalanceAmount ?? 0) -
      selectedSavedPaymentAmount -
      (draftPayment?.amount ?? 0)
    : 0;
  const completedReceipts = entries
    .filter(
      (entry) => entry.entry_type === "receipt" && entry.source_receipt_id,
    )
    .map((entry) => ({
      entry,
      receipt: allSupplierReceipts.find(
        (row) => row.receipt.id === entry.source_receipt_id,
      ),
    }))
    .filter(
      (
        row,
      ): row is {
        entry: Entry;
        receipt: (typeof allSupplierReceipts)[number];
      } => Boolean(row.receipt),
    );
  const importReceipt = async (row: (typeof supplierReceipts)[number]) => {
    if (row.hasMissingPrice) {
      toast.error("입고 전표에 단가가 없는 품목이 있습니다.");
      return;
    }
    setSelectedReceiptId(row.receipt.id);
    setEditingReceiptId(null);
    setDraftBalanceAmount(null);
    setDraftPayment(null);
    toast.success(
      "입고 전표를 불러왔습니다. 내용을 확인한 뒤 정산 내용을 입력해 주세요.",
    );
  };
  const importReceiptLine = async (
    row: (typeof supplierReceiptLines)[number],
  ) => importReceipt(row.receiptRow);
  const openCompletedReceipt = (receiptId: string, edit = false) => {
    const linkedEntries = entries.filter(
      (entry) => entry.related_receipt_id === receiptId,
    );
    const balance = linkedEntries
      .filter((entry) => entry.entry_type === "balance")
      .reduce((sum, entry) => sum + entry.amount, 0);
    const payments = linkedEntries.filter(
      (entry) => entry.entry_type === "payment",
    );
    const paymentAmount = payments.reduce(
      (sum, entry) => sum + entry.amount,
      0,
    );
    setSelectedReceiptId(receiptId);
    setEditingReceiptId(edit ? receiptId : null);
    setDraftBalanceAmount(edit && balance > 0 ? balance : null);
    setDraftPayment(
      edit && paymentAmount > 0
        ? {
            amount: paymentAmount,
            method: payments[0]?.payment_method ?? "현금",
          }
        : null,
    );
    setPaymentMethod(payments[0]?.payment_method ?? "현금");
    setBalanceAmount("");
    setPaymentAmount("");
  };
  const addSelectedAmount = (
    entryType: "balance" | "payment",
    rawAmount: string,
  ) => {
    const parsedAmount = Number(rawAmount);
    if (!Number.isInteger(parsedAmount) || parsedAmount <= 0) {
      toast.error("금액을 입력해 주세요.");
      return;
    }
    if (entryType === "balance") {
      setDraftBalanceAmount(parsedAmount);
      setBalanceAmount("");
    } else {
      setDraftPayment({ amount: parsedAmount, method: paymentMethod });
      setPaymentAmount("");
    }
  };
  const saveSelectedReceipt = async () => {
    if (!selectedReceipt) return;
    const { error } = await supabase.rpc(
      "save_comprehensive_settlement_receipt",
      {
        p_receipt_id: selectedReceipt.receipt.id,
        p_entry_date: selectedReceipt.receipt.arrived_on,
        p_item_name: `${selectedReceipt.lines.length}개 품목 입고 전표`,
        p_amount: selectedReceipt.amount,
        p_balance_amount: draftBalanceAmount ?? 0,
        p_payment_amount: draftPayment?.amount ?? 0,
        p_payment_method: draftPayment?.method ?? null,
      },
    );
    if (error) {
      toast.error(error.message);
      return;
    }
    setSelectedReceiptId(null);
    setEditingReceiptId(null);
    setDraftBalanceAmount(null);
    setDraftPayment(null);
    setBalanceAmount("");
    setPaymentAmount("");
    await client.invalidateQueries({ queryKey: ["comprehensive-settlement"] });
    toast.success("입고 전표를 종합 정산에 저장했습니다.");
  };
  const startEditingEntry = (entry: Entry) => {
    setEditingEntryId(entry.id);
    setEditingAmount(String(entry.amount));
    setEditingNote(entry.note ?? "");
    setEditingPaymentMethod(entry.payment_method ?? "현금");
  };
  const saveEntryEdit = async (entry: Entry) => {
    const parsedAmount = Number(editingAmount);
    if (!Number.isInteger(parsedAmount) || parsedAmount <= 0) {
      toast.error("금액을 확인해 주세요.");
      return;
    }
    const { error } = await supabase
      .from("comprehensive_settlement_entries")
      .update({
        amount: parsedAmount,
        note: editingNote.trim() || null,
        payment_method:
          entry.entry_type === "payment" ? editingPaymentMethod : null,
      })
      .eq("id", entry.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setEditingEntryId(null);
    await client.invalidateQueries({ queryKey: ["comprehensive-settlement"] });
    toast.success("정산 이력을 수정했습니다.");
  };
  const deleteEntry = async (entry: Entry) => {
    if (!window.confirm("이 정산 이력을 삭제할까요?")) return;
    if (entry.source_receipt_id) {
      const { error: relatedError } = await supabase
        .from("comprehensive_settlement_entries")
        .delete()
        .eq("related_receipt_id", entry.source_receipt_id);
      if (relatedError) {
        toast.error(relatedError.message);
        return;
      }
    }
    const { error } = await supabase
      .from("comprehensive_settlement_entries")
      .delete()
      .eq("id", entry.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await client.invalidateQueries({ queryKey: ["comprehensive-settlement"] });
    toast.success("정산 이력을 삭제했습니다.");
  };
  const copyReceiptImage = async () => {
    try {
      if (!receiptCaptureRef.current) {
        throw new Error("CAPTURE_TARGET_NOT_FOUND");
      }
      if (!navigator.clipboard || typeof ClipboardItem === "undefined") {
        throw new Error("CLIPBOARD_NOT_SUPPORTED");
      }
      const table = receiptCaptureRef.current;
      const tableWidth = table.getBoundingClientRect().width;
      const blob = await toBlob(table, {
        backgroundColor: "#ffffff",
        pixelRatio: 2,
        cacheBust: true,
        style: {
          width: `${tableWidth}px`,
          minWidth: `${tableWidth}px`,
          margin: "0",
        },
      });
      if (!blob) throw new Error("IMAGE_CREATE_FAILED");
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      toast.success("입고 전표 사진을 복사했습니다. 원하는 곳에 붙여넣으세요.");
    } catch {
      toast.error("사진 복사를 지원하지 않는 환경입니다.");
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <h1 className="text-lg font-bold text-gray-900">종합 정산</h1>
        <p className="mt-1 text-sm text-gray-500">
          거래처 종합에 대한 입고·이월 잔금·지급만 별도로 관리합니다. 재고·일반
          정산에는 영향을 주지 않습니다.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Summary label="지급 대상" value={receivable} />
          <Summary label="지급 완료" value={paid} />
          <Summary label="현재 잔금" value={receivable - paid} emphasis />
        </div>
      </section>
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold text-gray-900">종합 기존 입고목록</h2>
        <p className="mt-1 text-xs text-gray-500">
          거래처가 종합인 실제 입고 전표만 불러옵니다. 이미 정산에 넣은 품목은
          다시 표시하지 않습니다.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-600">
              <tr>
                <th className="px-3 py-2">입고일</th>
                <th className="px-3 py-2">품목</th>
                <th className="px-3 py-2 text-right">수량</th>
                <th className="px-3 py-2 text-right">단가</th>
                <th className="px-3 py-2 text-right">합계</th>
                <th className="px-3 py-2">처리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {supplierReceiptLines.map((row) => (
                <tr key={row.line.id}>
                  <td className="px-3 py-2">{row.receipt.arrived_on}</td>
                  <td className="px-3 py-2 font-medium">
                    {row.line.item_name}
                  </td>
                  <td className="px-3 py-2 text-right">{row.line.quantity}</td>
                  <td className="px-3 py-2 text-right">
                    {row.unitPrice == null
                      ? "단가 없음"
                      : `${row.unitPrice.toLocaleString("ko-KR")}원`}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {row.unitPrice == null
                      ? "—"
                      : `${(row.line.quantity * row.unitPrice).toLocaleString("ko-KR")}원`}
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      size="xs"
                      disabled={row.unitPrice == null}
                      onClick={() => importReceiptLine(row)}
                    >
                      불러오기
                    </Button>
                  </td>
                </tr>
              ))}
              {!supplierReceiptLines.length && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-8 text-center text-gray-400"
                  >
                    불러올 종합 입고 품목이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      {selectedReceipt && (
        <section className="rounded-2xl border border-brand-200 bg-brand-50/40 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-gray-900">
                선택한 입고 전표
              </h2>
              <p className="mt-1 text-xs text-gray-600">
                {selectedReceipt.receipt.arrived_on} ·{" "}
                {selectedReceipt.lines.length}개 품목 · 합계{" "}
                {selectedReceipt.amount.toLocaleString("ko-KR")}원
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isViewingCompletedReceipt && (
                <Button size="xs" variant="gray" onClick={copyReceiptImage}>
                  사진 복사
                </Button>
              )}
              {!isViewingCompletedReceipt && (
                <Button size="xs" onClick={saveSelectedReceipt}>
                  {editingReceiptId === selectedReceiptId
                    ? "수정 저장"
                    : "전표 저장"}
                </Button>
              )}
              <button
                type="button"
                onClick={() => setSelectedReceiptId(null)}
                className="text-xs font-semibold text-gray-500"
              >
                선택 해제
              </button>
            </div>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table
              ref={receiptCaptureRef}
              className="mx-auto w-2/3 min-w-[440px] border border-black bg-white text-center text-sm"
            >
              <thead className="text-center text-xs text-gray-700">
                <tr>
                  <th
                    colSpan={4}
                    className="border-b border-black bg-gray-50 px-2 py-2.5 text-sm font-bold text-gray-900"
                  >
                    {formatReceiptDate(selectedReceipt.receipt.arrived_on)}
                  </th>
                </tr>
                <tr className="border-b border-black">
                  <th className="w-1/3 border-r border-black px-2 py-2">
                    품목
                  </th>
                  <th className="border-r border-black px-2 py-2">수량</th>
                  <th className="border-r border-black px-2 py-2">단가</th>
                  <th className="px-2 py-2">합계</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black">
                {selectedReceipt.lines.map((line) => (
                  <tr key={line.id}>
                    <td className="border-r border-black px-2 py-2">
                      {line.item_name}
                    </td>
                    <td className="border-r border-black px-2 py-2">
                      {line.quantity}
                    </td>
                    <td className="border-r border-black px-2 py-2">
                      {line.unitPrice?.toLocaleString("ko-KR")}원
                    </td>
                    <td className="px-2 py-2 font-semibold">
                      {(line.quantity * (line.unitPrice ?? 0)).toLocaleString(
                        "ko-KR",
                      )}
                      원
                    </td>
                  </tr>
                ))}
                <tr>
                  <th
                    colSpan={3}
                    className="border-r border-black px-2 py-2 text-center font-semibold"
                  >
                    제품 합계금액
                  </th>
                  <td className="px-2 py-2 font-semibold">
                    {selectedReceipt.amount.toLocaleString("ko-KR")}원
                  </td>
                </tr>
                <tr>
                  <th
                    colSpan={3}
                    className="border-r border-black px-2 py-2 text-center font-semibold"
                  >
                    잔금
                  </th>
                  <td className="px-2 py-2">
                    {isViewingCompletedReceipt ? (
                      <span className="font-semibold">
                        {selectedSavedBalanceAmount.toLocaleString("ko-KR")}원
                      </span>
                    ) : draftBalanceAmount !== null ? (
                      <div className="flex items-center justify-center gap-2">
                        <span className="font-semibold">
                          {(
                            selectedSavedBalanceAmount + draftBalanceAmount
                          ).toLocaleString("ko-KR")}
                          원
                        </span>
                        <Button
                          size="xs"
                          variant="gray"
                          onClick={() => {
                            setBalanceAmount(String(draftBalanceAmount));
                            setDraftBalanceAmount(null);
                          }}
                        >
                          수정
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        {selectedSavedBalanceAmount > 0 && (
                          <span className="shrink-0 font-semibold">
                            {selectedSavedBalanceAmount.toLocaleString("ko-KR")}
                            원
                          </span>
                        )}
                        <input
                          type="number"
                          min="1"
                          value={balanceAmount}
                          onChange={(event) =>
                            setBalanceAmount(event.target.value)
                          }
                          placeholder="잔금 입력"
                          className="h-8 min-w-0 flex-1 border border-gray-400 bg-white px-2 text-center text-xs"
                        />
                        <Button
                          size="xs"
                          onClick={() =>
                            addSelectedAmount("balance", balanceAmount)
                          }
                        >
                          추가
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
                {Object.entries(savedPaymentsByMethod).map(
                  ([method, amount]) => (
                    <tr key={method}>
                      <th
                        colSpan={3}
                        className="border-r border-black px-2 py-2 text-center font-semibold"
                      >
                        {method} 지급액
                      </th>
                      <td className="px-2 py-2 font-semibold text-emerald-700">
                        −{amount.toLocaleString("ko-KR")}원
                      </td>
                    </tr>
                  ),
                )}
                {!isViewingCompletedReceipt && (
                  <tr>
                    <th
                      colSpan={3}
                      className="border-r border-black px-2 py-2 text-center font-semibold"
                    >
                      {draftPayment?.method ?? paymentMethod} 지급액
                    </th>
                    <td className="px-2 py-2">
                      {draftPayment ? (
                        <div className="flex items-center justify-center gap-2">
                          <span className="font-semibold text-emerald-700">
                            −{draftPayment.amount.toLocaleString("ko-KR")}원
                          </span>
                          <Button
                            size="xs"
                            variant="gray"
                            onClick={() => {
                              setPaymentAmount(String(draftPayment.amount));
                              setPaymentMethod(draftPayment.method);
                              setDraftPayment(null);
                            }}
                          >
                            수정
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="1"
                            value={paymentAmount}
                            onChange={(event) =>
                              setPaymentAmount(event.target.value)
                            }
                            placeholder="지급액 입력"
                            className="h-8 min-w-0 flex-1 border border-gray-400 bg-white px-2 text-center text-xs"
                          />
                          <select
                            value={paymentMethod}
                            onChange={(event) =>
                              setPaymentMethod(event.target.value)
                            }
                            className="h-8 border border-gray-400 bg-white px-1 text-xs"
                            aria-label="지급 수단"
                          >
                            <option>현금</option>
                            <option>이체</option>
                          </select>
                          <Button
                            size="xs"
                            onClick={() =>
                              addSelectedAmount("payment", paymentAmount)
                            }
                          >
                            추가
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
                <tr className="border-t border-black bg-gray-50">
                  <th
                    colSpan={3}
                    className="border-r border-black px-2 py-2.5 text-center font-bold"
                  >
                    최종 금액
                  </th>
                  <td className="px-2 py-2.5 font-bold text-brand-700">
                    {selectedFinalAmount.toLocaleString("ko-KR")}원
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}
      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-bold text-gray-900">완료된 전표</h2>
          <p className="text-xs text-gray-500">
            전표 보기를 눌러 전달용 표를 다시 확인할 수 있습니다.
          </p>
        </div>
        <div className="divide-y divide-gray-100">
          {completedReceipts.map(({ entry, receipt }) => {
            const linkedEntries = entries.filter(
              (linked) => linked.related_receipt_id === receipt.receipt.id,
            );
            const balance = linkedEntries
              .filter((linked) => linked.entry_type === "balance")
              .reduce((sum, linked) => sum + linked.amount, 0);
            const payment = linkedEntries
              .filter((linked) => linked.entry_type === "payment")
              .reduce((sum, linked) => sum + linked.amount, 0);
            return (
              <div
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {formatReceiptDate(receipt.receipt.arrived_on)}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {receipt.lines.length}개 품목 · 최종 금액{" "}
                    {(receipt.amount + balance - payment).toLocaleString(
                      "ko-KR",
                    )}
                    원
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="xs"
                    variant="gray"
                    onClick={() => openCompletedReceipt(receipt.receipt.id)}
                  >
                    전표 보기
                  </Button>
                  <Button
                    size="xs"
                    variant="secondary"
                    onClick={() =>
                      openCompletedReceipt(receipt.receipt.id, true)
                    }
                  >
                    수정
                  </Button>
                </div>
              </div>
            );
          })}
          {!completedReceipts.length && (
            <p className="px-4 py-10 text-center text-sm text-gray-400">
              아직 완료된 전표가 없습니다.
            </p>
          )}
        </div>
      </section>
      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-4 py-3 text-sm font-bold">
          정산 이력
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-600">
              <tr>
                <th className="px-4 py-3">일자</th>
                <th className="px-4 py-3">구분</th>
                <th className="px-4 py-3">내용</th>
                <th className="px-4 py-3 text-right">금액</th>
                <th className="px-4 py-3">메모</th>
                <th className="px-4 py-3 text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-4 py-3">{entry.entry_date}</td>
                  <td className="px-4 py-3 font-semibold">
                    {labels[entry.entry_type]}
                    {editingEntryId === entry.id &&
                    entry.entry_type === "payment" ? (
                      <select
                        value={editingPaymentMethod}
                        onChange={(event) =>
                          setEditingPaymentMethod(event.target.value)
                        }
                        className="ml-2 h-8 border border-gray-300 bg-white px-2 text-xs"
                      >
                        <option>현금</option>
                        <option>이체</option>
                        <option>기타</option>
                      </select>
                    ) : entry.payment_method ? (
                      ` · ${entry.payment_method}`
                    ) : (
                      ""
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {entry.related_receipt_id
                      ? `${supplierReceiptDateById.get(entry.related_receipt_id) ?? entry.entry_date} 입고 전표`
                      : entry.item_name
                        ? `${entry.item_name} ${entry.quantity}개 × ${entry.unit_price?.toLocaleString("ko-KR")}원`
                        : "—"}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-semibold ${entry.entry_type === "payment" ? "text-emerald-700" : "text-gray-900"}`}
                  >
                    {editingEntryId === entry.id ? (
                      <input
                        type="number"
                        min="1"
                        value={editingAmount}
                        onChange={(event) =>
                          setEditingAmount(event.target.value)
                        }
                        className="h-8 w-28 border border-gray-300 bg-white px-2 text-right text-xs"
                        aria-label="정산 금액"
                      />
                    ) : (
                      <>
                        {entry.entry_type === "payment" ? "−" : "+"}
                        {entry.amount.toLocaleString("ko-KR")}원
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {editingEntryId === entry.id ? (
                      <input
                        value={editingNote}
                        onChange={(event) => setEditingNote(event.target.value)}
                        placeholder="메모"
                        className="h-8 w-full min-w-32 border border-gray-300 bg-white px-2 text-xs"
                      />
                    ) : (
                      (entry.note ?? "—")
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      {editingEntryId === entry.id ? (
                        <>
                          <Button
                            size="xs"
                            onClick={() => saveEntryEdit(entry)}
                          >
                            저장
                          </Button>
                          <Button
                            size="xs"
                            variant="gray"
                            onClick={() => setEditingEntryId(null)}
                          >
                            취소
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="xs"
                            variant="gray"
                            onClick={() => {
                              const receiptId =
                                entry.source_receipt_id ??
                                entry.related_receipt_id;
                              if (receiptId) {
                                openCompletedReceipt(receiptId, true);
                                return;
                              }
                              startEditingEntry(entry);
                            }}
                          >
                            {entry.source_receipt_id || entry.related_receipt_id
                              ? "전표 수정"
                              : "수정"}
                          </Button>
                          <Button
                            size="xs"
                            variant="danger"
                            onClick={() => deleteEntry(entry)}
                          >
                            삭제
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!entries.length && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-gray-400"
                  >
                    아직 종합 정산 내역이 없습니다.
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
function Summary({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p
        className={`mt-1 text-lg font-bold ${emphasis ? "text-brand-700" : "text-gray-900"}`}
      >
        {value.toLocaleString("ko-KR")}원
      </p>
    </div>
  );
}
