"use client";

import { useState } from "react";
import SettlementMissingCostManager from "./SettlementMissingCostManager";
import InventoryCostLedger from "./InventoryCostLedger";
import SettlementCostDataManager from "./SettlementCostDataManager";
import HistoricalTransactionImporter from "./HistoricalTransactionImporter";
import InventoryCostConnectionCheck from "./InventoryCostConnectionCheck";

export default function SettlementCostManagement() {
  const [activeTab, setActiveTab] = useState<"missing" | "connection" | "ledger" | "history">("missing");
  const tabs = [
    ["missing", "원가 누락관리"],
    ["connection", "원가 연결점검"],
    ["ledger", "전체 원가 배정 원장"],
    ["history", "초기 원가 과거자료"],
  ] as const;
  return (
    <div className="space-y-5">
      <div className="border-b border-gray-200" role="tablist" aria-label="원가 관리 메뉴">
        <div className="flex min-w-0 overflow-x-auto">
          {tabs.map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={activeTab === value} onClick={() => setActiveTab(value)} className={`shrink-0 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${activeTab === value ? "border-brand-500 text-brand-700" : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"}`}>{label}</button>)}
        </div>
      </div>
      {activeTab === "missing" ? <SettlementMissingCostManager /> : activeTab === "connection" ? <InventoryCostConnectionCheck /> : activeTab === "ledger" ? <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"><InventoryCostLedger /></section> : <section className="space-y-5 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"><SettlementCostDataManager /><HistoricalTransactionImporter /></section>}
    </div>
  );
}
