"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Loading from "@/app/_components/Loading";
import { useUser } from "@/app/_contexts/UserContext";
import SettlementReport from "../cash-management/_components/SettlementReport";
import SettlementExpenseManager from "./_components/SettlementExpenseManager";
import SettlementCostDataManager from "./_components/SettlementCostDataManager";
import HistoricalTransactionImporter from "./_components/HistoricalTransactionImporter";

type SettlementTab = "report" | "expenses" | "costs" | "historical-import";

export default function SettlementPage() {
  const router = useRouter();
  const { user, isLoading } = useUser();
  const [activeTab, setActiveTab] = useState<SettlementTab>("report");

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
      <div className="flex border-b border-gray-200" role="tablist" aria-label="정산 메뉴">
        {([
          ["report", "정산보고서"],
          ["expenses", "기타비용 관리"],
          ["costs", "원가·과거자료 관리"],
          ["historical-import", "과거 정산 자료"],
        ] as const).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={`cursor-pointer border-b-2 px-5 py-3 text-sm font-semibold transition-colors ${activeTab === tab ? "border-brand-500 text-brand-700" : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {activeTab === "report" ? <SettlementReport /> : activeTab === "expenses" ? <SettlementExpenseManager /> : activeTab === "costs" ? <SettlementCostDataManager /> : <HistoricalTransactionImporter />}
    </main>
  );
}
