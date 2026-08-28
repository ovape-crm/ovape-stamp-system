"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Loading from "@/app/_components/Loading";
import { useUser } from "@/app/_contexts/UserContext";
import SettlementReport from "../cash-management/_components/SettlementReport";
import SettlementExpenseManager from "./_components/SettlementExpenseManager";
import SettlementCostManagement from "./_components/SettlementCostManagement";
import ComprehensiveSettlement from "./_components/ComprehensiveSettlement";

type SettlementTab =
  "report" | "expenses" | "cost-management" | "comprehensive";
const settlementTabs: ReadonlyArray<readonly [SettlementTab, string]> = [
  ["report", "정산보고서"],
  ["expenses", "기타비용 관리"],
  ["cost-management", "원가 관리"],
  ["comprehensive", "종합 정산"],
];

export default function SettlementPage() {
  const router = useRouter();
  const { user, isLoading } = useUser();
  const [activeTab, setActiveTab] = useState<SettlementTab>("report");
  const [tabOrder, setTabOrder] = useState<SettlementTab[]>(() =>
    settlementTabs.map(([tab]) => tab),
  );
  const [editingTabOrder, setEditingTabOrder] = useState(false);
  const [hiddenTabs, setHiddenTabs] = useState<SettlementTab[]>([]);

  useEffect(() => {
    const defaultOrder = settlementTabs.map(([tab]) => tab);
    const saved = window.localStorage.getItem("settlement-tab-order");
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as unknown;
      if (
        Array.isArray(parsed) &&
        parsed.length === defaultOrder.length &&
        parsed.every((tab) => defaultOrder.includes(tab as SettlementTab))
      ) {
        setTabOrder(parsed as SettlementTab[]);
      } else {
        window.localStorage.removeItem("settlement-tab-order");
      }
    } catch {
      window.localStorage.removeItem("settlement-tab-order");
    }
  }, []);
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem("settlement-hidden-tabs") ?? "[]") as unknown;
      if (Array.isArray(saved)) setHiddenTabs(saved.filter((tab): tab is SettlementTab => settlementTabs.some(([value]) => value === tab)));
    } catch { window.localStorage.removeItem("settlement-hidden-tabs"); }
  }, []);
  const toggleTabVisibility = (tab: SettlementTab) => {
    setHiddenTabs((current) => {
      const next = current.includes(tab) ? current.filter((value) => value !== tab) : [...current, tab];
      window.localStorage.setItem("settlement-hidden-tabs", JSON.stringify(next));
      if (tab === activeTab && !current.includes(tab)) setActiveTab(tabOrder.find((value) => value !== tab && !next.includes(value)) ?? "report");
      return next;
    });
  };
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
        <h1 className="text-lg font-bold text-gray-900">
          접근 권한이 없습니다.
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          정산은 마스터 계정만 사용할 수 있습니다.
        </p>
        <button
          type="button"
          onClick={() => router.replace("/")}
          className="mt-5 cursor-pointer rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white"
        >
          돌아가기
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <div
        className="flex items-end justify-between border-b border-gray-200"
        role="tablist"
        aria-label="정산 메뉴"
      >
        <div className="flex min-w-0 overflow-x-auto">
          {tabOrder.filter((tab) => editingTabOrder || !hiddenTabs.includes(tab)).map((tab, index) => {
            const label =
              settlementTabs.find(([value]) => value === tab)?.[1] ?? tab;
            return (
              <div key={tab} className="flex shrink-0 items-center">
                {editingTabOrder && (
                  <button
                    type="button"
                    aria-label={`${label} 왼쪽으로 이동`}
                    onClick={() => moveTab(index, -1)}
                    disabled={index === 0}
                    className="h-7 w-6 text-xs text-gray-400 hover:text-brand-600 disabled:opacity-20"
                  >
                    ‹
                  </button>
                )}
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab}
                  onClick={() => setActiveTab(tab)}
                  className={`border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${activeTab === tab ? "border-brand-500 text-brand-700" : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"}`}
                >
                  {label}
                </button>
                {editingTabOrder && (
                  <button
                    type="button"
                    aria-label={`${label} 오른쪽으로 이동`}
                    onClick={() => moveTab(index, 1)}
                    disabled={index === tabOrder.length - 1}
                    className="h-7 w-6 text-xs text-gray-400 hover:text-brand-600 disabled:opacity-20"
                  >
                    ›
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setEditingTabOrder((value) => !value)}
          title={editingTabOrder ? "탭 순서 변경 완료" : "탭 순서 변경"}
          className={`mb-2 ml-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-white transition ${editingTabOrder ? "border-brand-300 text-brand-700 shadow-sm" : "border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-brand-700"}`}
          aria-label="탭 순서 변경"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.8}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 15.25A3.25 3.25 0 1 0 12 8.75a3.25 3.25 0 0 0 0 6.5Zm7.25-3.25c0-.48-.05-.95-.14-1.4l2.02-1.57-2-3.46-2.48 1a7.4 7.4 0 0 0-2.42-1.4L13.88 2.5h-4l-.35 2.67a7.4 7.4 0 0 0-2.42 1.4l-2.48-1-2 3.46 2.02 1.57a7.18 7.18 0 0 0 0 2.8l-2.02 1.57 2 3.46 2.48-1a7.4 7.4 0 0 0 2.42 1.4l.35 2.67h4l.35-2.67a7.4 7.4 0 0 0 2.42-1.4l2.48 1 2-3.46-2.02-1.57c.09-.45.14-.92.14-1.4Z"
            />
          </svg>
        </button>
      </div>
      {editingTabOrder && (
        <div className="flex flex-wrap gap-2 rounded-xl border border-gray-200 bg-gray-50/70 p-3 text-xs text-gray-700">
          <span className="mr-1 self-center font-semibold">탭 표시</span>
          {tabOrder.map((tab) => <button key={tab} type="button" onClick={() => toggleTabVisibility(tab)} className={`cursor-pointer rounded-lg border px-2.5 py-1.5 font-semibold ${hiddenTabs.includes(tab) ? "border-gray-200 bg-white text-gray-400" : "border-brand-200 bg-brand-50 text-brand-700"}`}>{hiddenTabs.includes(tab) ? "숨김" : "표시"} · {settlementTabs.find(([value]) => value === tab)?.[1]}</button>)}
        </div>
      )}
      {activeTab === "report" ? (
        <SettlementReport />
      ) : activeTab === "expenses" ? (
        <SettlementExpenseManager />
      ) : activeTab === "cost-management" ? (
        <SettlementCostManagement />
      ) : (
        <ComprehensiveSettlement />
      )}
    </main>
  );
}
