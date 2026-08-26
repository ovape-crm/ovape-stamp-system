"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Loading from "@/app/_components/Loading";
import { useUser } from "@/app/_contexts/UserContext";
import SettlementReport from "../cash-management/_components/SettlementReport";
import SettlementExpenseManager from "./_components/SettlementExpenseManager";
import SettlementCostDataManager from "./_components/SettlementCostDataManager";
import HistoricalTransactionImporter from "./_components/HistoricalTransactionImporter";
import SettlementMissingCostManager from "./_components/SettlementMissingCostManager";
import InventoryCostLedger from "./_components/InventoryCostLedger";

type SettlementTab = "report" | "expenses" | "missing-costs" | "cost-ledger" | "costs" | "historical-import";
const settlementTabs: ReadonlyArray<readonly [SettlementTab, string]> = [
  ["report", "정산보고서"], ["expenses", "기타비용 관리"], ["missing-costs", "원가 누락 관리"],
  ["cost-ledger", "원가 배정 원장"], ["costs", "원가·과거자료 관리"], ["historical-import", "과거 정산 자료"],
];

export default function SettlementPage() {
  const router = useRouter();
  const { user, isLoading } = useUser();
  const [activeTab, setActiveTab] = useState<SettlementTab>("report");
  const [tabOrder, setTabOrder] = useState<SettlementTab[]>(() => settlementTabs.map(([tab]) => tab));
  const [editingTabOrder, setEditingTabOrder] = useState(false);

  useEffect(() => {
    const defaultOrder = settlementTabs.map(([tab]) => tab);
    const saved = window.localStorage.getItem("settlement-tab-order");
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as unknown;
      if (Array.isArray(parsed) && parsed.length === defaultOrder.length && parsed.every((tab) => defaultOrder.includes(tab as SettlementTab))) {
        setTabOrder(parsed as SettlementTab[]);
      }
    } catch {
      window.localStorage.removeItem("settlement-tab-order");
    }
  }, []);
  const moveTab = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= tabOrder.length) return;
    setTabOrder((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      window.localStorage.setItem("settlement-tab-order", JSON.stringify(next));
      return next;
    });
  };

  if (isLoading) return <Loading text="권한을 확인하는 중..." />;
  if (user?.oss_role !== "master") {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-lg font-bold text-gray-900">접근 권한이 없습니다.</h1>
        <p className="mt-2 text-sm text-gray-500">정산은 마스터 계정만 사용할 수 있습니다.</p>
        <button type="button" onClick={() => router.replace("/")} className="mt-5 cursor-pointer rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white">
          돌아가기
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex items-end justify-between border-b border-gray-200" role="tablist" aria-label="정산 메뉴">
        <div className="flex min-w-0 overflow-x-auto">
        {tabOrder.map((tab, index) => {
          const label = settlementTabs.find(([value]) => value === tab)?.[1] ?? tab;
          return <div key={tab} className="flex shrink-0 items-center">
            {editingTabOrder && <button type="button" aria-label={`${label} 왼쪽으로 이동`} onClick={() => moveTab(index, -1)} disabled={index === 0} className="h-7 w-6 text-xs text-gray-400 hover:text-brand-600 disabled:opacity-20">‹</button>}
            <button type="button" role="tab" aria-selected={activeTab === tab} onClick={() => setActiveTab(tab)} className={`border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${activeTab === tab ? "border-brand-500 text-brand-700" : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"}`}>{label}</button>
            {editingTabOrder && <button type="button" aria-label={`${label} 오른쪽으로 이동`} onClick={() => moveTab(index, 1)} disabled={index === tabOrder.length - 1} className="h-7 w-6 text-xs text-gray-400 hover:text-brand-600 disabled:opacity-20">›</button>}
          </div>;
        })}
        </div>
        <button type="button" onClick={() => setEditingTabOrder((value) => !value)} title={editingTabOrder ? "탭 순서 변경 완료" : "탭 순서 변경"} className={`mb-2 ml-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-white transition ${editingTabOrder ? "border-brand-300 text-brand-700 shadow-sm" : "border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-brand-700"}`} aria-label="탭 순서 변경">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M12 15.25A3.25 3.25 0 1 0 12 8.75a3.25 3.25 0 0 0 0 6.5Zm7.25-3.25c0-.48-.05-.95-.14-1.4l2.02-1.57-2-3.46-2.48 1a7.4 7.4 0 0 0-2.42-1.4L13.88 2.5h-4l-.35 2.67a7.4 7.4 0 0 0-2.42 1.4l-2.48-1-2 3.46 2.02 1.57a7.18 7.18 0 0 0 0 2.8l-2.02 1.57 2 3.46 2.48-1a7.4 7.4 0 0 0 2.42 1.4l.35 2.67h4l.35-2.67a7.4 7.4 0 0 0 2.42-1.4l2.48 1 2-3.46-2.02-1.57c.09-.45.14-.92.14-1.4Z" /></svg>
        </button>
      </div>
      {activeTab === "report" ? <SettlementReport /> : activeTab === "expenses" ? <SettlementExpenseManager /> : activeTab === "missing-costs" ? <SettlementMissingCostManager /> : activeTab === "cost-ledger" ? <InventoryCostLedger /> : activeTab === "costs" ? <SettlementCostDataManager /> : <HistoricalTransactionImporter />}
    </main>
  );
}
