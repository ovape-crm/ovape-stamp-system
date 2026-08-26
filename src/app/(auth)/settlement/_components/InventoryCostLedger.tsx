"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Loading from "@/app/_components/Loading";
import { getInventoryCostLedger } from "@/app/_domains/_settlement/_services/settlementService";

const eventLabels: Record<string, string> = {
  opening: "기초재고",
  purchase_in: "입고",
  sale_out: "판매",
  customer_exchange_in: "고객 교환입고",
  customer_exchange_out: "고객 교환출고",
  after_service_out: "A/S 선출고",
  after_service_in: "A/S 입고",
  adjustment_in: "재고조정 입고",
  adjustment_out: "재고조정 출고",
  demo_out: "시연용",
  loss_out: "재고손실",
  reversal: "취소",
};

const getEventLabel = (row: { eventType: string; metadata: Record<string, unknown> }) => {
  const adjustmentType = String(row.metadata.adjustmentType ?? "");
  if (adjustmentType === "correction_in") return "재고조정-정정 입고";
  if (adjustmentType === "correction_out") return "재고조정-정정 출고";
  if (adjustmentType === "free_in") return "재고조정-무상 입고";
  if (adjustmentType === "loss_out") return "재고조정-손실 출고";
  return eventLabels[row.eventType] ?? row.eventType;
};

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

export default function InventoryCostLedger() {
  const [query, setQuery] = useState("");
  const [eventType, setEventType] = useState("all");
  const [costStatus, setCostStatus] = useState("all");
  const ledgerQuery = useQuery({
    queryKey: ["inventory-cost-ledger"],
    queryFn: getInventoryCostLedger,
  });
  const rows = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ko-KR");
    return (ledgerQuery.data ?? []).filter((row) =>
      (eventType === "all" || row.eventType === eventType) &&
      (costStatus === "all" || row.costStatus === costStatus) &&
      (!normalized || row.itemName.toLocaleLowerCase("ko-KR").includes(normalized) || String(row.metadata.customerName ?? "").toLocaleLowerCase("ko-KR").includes(normalized)),
    );
  }, [costStatus, eventType, ledgerQuery.data, query]);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <h1 className="text-lg font-bold text-gray-900">원가 배정 원장</h1>
        <p className="mt-1 text-sm text-gray-500">판매·교환·A/S·재고조정에서 이동한 원가와 FIFO 출처를 확인합니다.</p>
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50/70 p-3 sm:flex-row">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="품목명 또는 고객명 검색" className="w-full rounded-lg border border-gray-300 bg-white py-2.5 px-3 text-sm font-medium text-gray-900 shadow-sm outline-none transition placeholder:font-normal placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 sm:max-w-sm" />
          <select value={eventType} onChange={(event) => setEventType(event.target.value)} className="h-10 cursor-pointer rounded-lg border border-gray-300 bg-white px-3 text-sm shadow-sm">
            <option value="all">전체 처리</option>
            {Object.entries(eventLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select value={costStatus} onChange={(event) => setCostStatus(event.target.value)} className="h-10 cursor-pointer rounded-lg border border-gray-300 bg-white px-3 text-sm shadow-sm">
            <option value="all">전체 원가</option><option value="confirmed">원가 확정</option><option value="pending">원가 누락</option>
          </select>
        </div>
      </section>
      <div className="mb-3 flex items-center justify-start gap-3"><p className="text-xs text-gray-600 sm:text-sm">조회 결과 <span className="font-semibold text-brand-600">{rows.length}</span></p></div>
      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {ledgerQuery.isPending ? <Loading size="sm" /> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-sm">
            <thead className="border-b border-gray-200 bg-gray-50/70 text-left text-xs font-semibold text-gray-600"><tr><th className="px-4 py-3">처리일시</th><th className="px-4 py-3">구분</th><th className="px-4 py-3">품목</th><th className="px-4 py-3 text-right">수량</th><th className="px-4 py-3 text-right">총원가</th><th className="px-4 py-3">FIFO 출처</th><th className="px-4 py-3">상태</th><th className="px-4 py-3">연결기록</th></tr></thead>
            <tbody className="divide-y divide-gray-100">{rows.map((row) => <tr key={row.id} className="text-gray-700"><td className="whitespace-nowrap px-4 py-3">{formatDateTime(row.eventAt)}</td><td className="px-4 py-3 font-semibold">{getEventLabel(row)}</td><td className="px-4 py-3 font-semibold text-gray-900">{row.itemName}</td><td className={`px-4 py-3 text-right font-semibold ${row.direction === "in" ? "text-emerald-600" : "text-rose-600"}`}>{row.direction === "in" ? "+" : "−"}{row.quantity.toLocaleString("ko-KR")}</td><td className="px-4 py-3 text-right font-semibold">{row.totalCost == null ? "—" : `${row.totalCost.toLocaleString("ko-KR")}원`}</td><td className="px-4 py-3 text-gray-500">{row.sourceSummary || (row.direction === "in" ? "원가층 생성" : "—")}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${row.costStatus === "pending" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{row.costStatus === "pending" ? "원가 누락" : "확정"}</span></td><td className="px-4 py-3 text-xs text-gray-500">{row.referenceType} · {row.referenceId}</td></tr>)}</tbody>
          </table>{!rows.length && <p className="px-4 py-12 text-center text-sm text-gray-400">조회할 원가 원장 기록이 없습니다.</p>}</div>
        )}
      </section>
    </div>
  );
}
