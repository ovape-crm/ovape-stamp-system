"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Loading from "@/app/_components/Loading";
import {
  getSettlementExpenseOccurrences,
  getSettlementSummary,
} from "@/app/_domains/_settlement/_services/settlementService";
import { SettlementStore } from "@/app/_domains/_settlement/_types/settlement.types";

const getCurrentMonthInKorea = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());

const getTodayInKorea = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

type SettlementPeriodMode = "month" | "range" | "day";

const periodModes: { value: SettlementPeriodMode; label: string }[] = [
  { value: "month", label: "월별" },
  { value: "range", label: "기간별" },
  { value: "day", label: "날짜별" },
];

const paymentRows = [
  ["card", "카드"],
  ["transfer", "이체"],
  ["cash", "현금"],
  ["cash_receipt", "현금영수증"],
  ["transfer_cash_receipt", "이체현금영수증"],
  ["kakaotalk", "카카오톡"],
] as const;

const formatWon = (amount: number) => `${amount.toLocaleString("ko-KR")}원`;

const preferredPurchaseOrder = [
  "오베이프 세금계산서",
  "오베이프 현금영수증",
  "이구베이프 세금계산서",
  "이구베이프 현금영수증",
];

const storeLabels: Record<SettlementStore, string> = {
  ovape: "오베이프",
  eguvape: "이구베이프",
  common: "공통",
  other: "기타",
};

export default function SettlementReport() {
  const today = getTodayInKorea();
  const [periodMode, setPeriodMode] =
    useState<SettlementPeriodMode>("month");
  const [settlementMonth, setSettlementMonth] = useState(
    getCurrentMonthInKorea,
  );
  const [startDate, setStartDate] = useState(`${today.slice(0, 7)}-01`);
  const [endDate, setEndDate] = useState(today);
  const [settlementDate, setSettlementDate] = useState(today);
  const monthLastDay = new Date(
    Number(settlementMonth.slice(0, 4)),
    Number(settlementMonth.slice(5, 7)),
    0,
  ).getDate();
  const selectedRange =
    periodMode === "month"
      ? {
          start: `${settlementMonth}-01`,
          end: `${settlementMonth}-${String(monthLastDay).padStart(2, "0")}`,
        }
      : periodMode === "day"
        ? { start: settlementDate, end: settlementDate }
        : { start: startDate, end: endDate };
  const rangeValid =
    Boolean(selectedRange.start && selectedRange.end) &&
    selectedRange.start <= selectedRange.end;
  const summaryQuery = useQuery({
    queryKey: ["settlement-summary", selectedRange.start, selectedRange.end],
    queryFn: () => getSettlementSummary(selectedRange.start, selectedRange.end),
    enabled: rangeValid,
  });
  const expensesQuery = useQuery({
    queryKey: ["settlement-expense-occurrences", selectedRange.start, selectedRange.end],
    queryFn: () => getSettlementExpenseOccurrences(selectedRange.start, selectedRange.end),
    enabled: rangeValid,
  });
  const ovapeSales = Object.values(summaryQuery.data?.sales.ovape ?? {}).reduce((a, b) => a + b, 0);
  const eguvapeSales = Object.values(summaryQuery.data?.sales.eguvape ?? {}).reduce((a, b) => a + b, 0);
  const totalSales = ovapeSales + eguvapeSales;
  const totalPurchases = Object.values(summaryQuery.data?.purchases ?? {}).reduce((a, b) => a + b, 0);
  const purchaseRows = Object.entries(summaryQuery.data?.purchases ?? {}).sort(
    ([left], [right]) => {
      const leftIndex = preferredPurchaseOrder.indexOf(left);
      const rightIndex = preferredPurchaseOrder.indexOf(right);
      if (leftIndex >= 0 || rightIndex >= 0) {
        return (leftIndex < 0 ? preferredPurchaseOrder.length : leftIndex) -
          (rightIndex < 0 ? preferredPurchaseOrder.length : rightIndex);
      }
      return left.localeCompare(right, "ko-KR");
    },
  );
  const expenseOccurrences = expensesQuery.data ?? [];
  const totalExpenses = expenseOccurrences.reduce(
    (total, expense) => total + expense.amount,
    0,
  );

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-gray-900">정산보고서</h1>
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">
                마스터 전용
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              선택한 기간의 결제 매출, 매입, 재고 변동을 한곳에서
              정산합니다.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50/70 p-3 sm:flex-row sm:items-end">
          <div className="w-full sm:w-auto sm:shrink-0">
            <p className="mb-1 text-xs font-semibold text-gray-600">
              조회 기준
            </p>
            <div className="grid h-9 grid-cols-3 overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm">
              {periodModes.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => setPeriodMode(mode.value)}
                  className={`cursor-pointer border-r border-gray-200 px-4 text-sm font-semibold transition last:border-r-0 ${
                    periodMode === mode.value
                      ? "bg-brand-500 text-white"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          {periodMode === "month" && (
            <DateField
              label="정산 월"
              type="month"
              value={settlementMonth}
              onChange={setSettlementMonth}
            />
          )}
          {periodMode === "range" && (
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <DateField
                label="시작일"
                type="date"
                value={startDate}
                onChange={setStartDate}
              />
              <DateField
                label="종료일"
                type="date"
                value={endDate}
                min={startDate}
                onChange={setEndDate}
              />
            </div>
          )}
          {periodMode === "day" && (
            <DateField
              label="조회 날짜"
              type="date"
              value={settlementDate}
              onChange={setSettlementDate}
            />
          )}
        </div>
      </section>

      {(summaryQuery.isPending || expensesQuery.isPending) && <Loading size="sm" text="정산 금액을 불러오는 중..." />}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "전체 매출", value: totalSales, description: "오베이프와 이구베이프 결제 매출" },
          { label: "기간 매입액", value: totalPurchases, description: "해당 기간에 입고된 상품 금액" },
          { label: "판매품목 매출원가", value: null, description: "원가 산정 방식 확정 후 연결" },
          { label: "기타비용", value: totalExpenses, description: "직접 등록한 운영 비용" },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
          >
            <p className="text-sm font-semibold text-gray-700">{item.label}</p>
            <p className="mt-3 text-2xl font-bold text-gray-900">{item.value == null ? "—" : formatWon(item.value)}</p>
            <p className="mt-1 text-xs text-gray-500">{item.description}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <SalesCard title="오베이프 매출" payments={summaryQuery.data?.sales.ovape} total={ovapeSales} />
        <SalesCard title="이구베이프 매출" payments={summaryQuery.data?.sales.eguvape} total={eguvapeSales} />
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <h2 className="border-b border-gray-200 bg-gray-50/70 px-4 py-3 text-sm font-bold text-gray-900">기간 매입액</h2>
          <div className="divide-y divide-gray-100 px-4">
            {purchaseRows.map(([label, value]) => <AmountRow key={label} label={label} value={value} />)}
            {!purchaseRows.length && <AmountRow label="매입 내역 없음" value={0} />}
            <AmountRow label="합계" value={totalPurchases} strong />
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 bg-gray-50/70 px-4 py-3">
          <h2 className="text-sm font-bold text-gray-900">기타비용 상세내역</h2>
          <span className="text-xs font-semibold text-gray-500">
            {expenseOccurrences.length.toLocaleString("ko-KR")}건
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[720px] w-full text-sm">
            <thead className="border-b border-gray-200 bg-white text-left text-xs font-semibold text-gray-500">
              <tr>
                <th className="px-4 py-2.5">반영일</th>
                <th className="px-4 py-2.5">항목</th>
                <th className="px-4 py-2.5">매장</th>
                <th className="px-4 py-2.5">메모</th>
                <th className="px-4 py-2.5 text-right">금액</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {expenseOccurrences.map((expense) => (
                <tr key={`${expense.id}-${expense.occurrence_date}`} className="text-gray-700">
                  <td className="whitespace-nowrap px-4 py-3">{expense.occurrence_date}</td>
                  <td className="px-4 py-3 font-semibold text-gray-900">
                    {expense.category}
                    {expense.is_recurring && (
                      <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">반복</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">{storeLabels[expense.store]}</td>
                  <td className="max-w-[320px] px-4 py-3 text-gray-500">{expense.note || "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-gray-900">{formatWon(expense.amount)}</td>
                </tr>
              ))}
              {!expenseOccurrences.length && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-400">선택한 기간의 기타비용 내역이 없습니다.</td>
                </tr>
              )}
            </tbody>
            <tfoot className="border-t border-gray-200 bg-gray-50/70">
              <tr className="font-bold text-gray-900">
                <td colSpan={4} className="px-4 py-3">합계</td>
                <td className="whitespace-nowrap px-4 py-3 text-right">{formatWon(totalExpenses)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-dashed border-gray-300 bg-gray-50/70 px-4 py-5">
        <p className="text-sm font-semibold text-gray-800">
          재고조정은 정산 금액에서 제외됩니다.
        </p>
        <p className="mt-1 text-sm text-gray-500">
          고객에게 받은 A/S 택배비는 매출에 포함되며, 택배사에 실제로
          지급한 금액과 실제 재고손실만 기타비용에 등록합니다. 판매품목
          매출원가는 원가 산정 기준을 확정한 뒤 별도로 연결합니다.
        </p>
      </section>
    </div>
  );
}

const DateField = ({
  label,
  type,
  value,
  min,
  onChange,
}: {
  label: string;
  type: "date" | "month";
  value: string;
  min?: string;
  onChange: (value: string) => void;
}) => (
  <label className="flex w-full flex-col sm:w-[180px] sm:shrink-0">
    <span className="mb-1 text-xs font-semibold text-gray-600">{label}</span>
    <input
      type={type}
      value={value}
      min={min}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 w-full cursor-pointer rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-900 shadow-sm outline-none transition hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
    />
  </label>
);

const AmountRow = ({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) => <div className={`flex items-center justify-between gap-3 py-3 text-sm ${strong ? "font-bold text-gray-900" : "text-gray-600"}`}><span>{label}</span><span className="font-semibold">{formatWon(value)}</span></div>;

const SalesCard = ({ title, payments, total }: { title: string; payments?: Record<string, number>; total: number }) => <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"><h2 className="border-b border-gray-200 bg-gray-50/70 px-4 py-3 text-sm font-bold text-gray-900">{title}</h2><div className="divide-y divide-gray-100 px-4">{paymentRows.map(([key, label]) => <AmountRow key={key} label={label} value={payments?.[key] ?? 0} />)}<AmountRow label="합계" value={total} strong /></div></div>;
