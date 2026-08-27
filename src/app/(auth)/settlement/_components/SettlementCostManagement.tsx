"use client";

import SettlementMissingCostManager from "./SettlementMissingCostManager";
import InventoryCostLedger from "./InventoryCostLedger";
import SettlementCostDataManager from "./SettlementCostDataManager";
import HistoricalTransactionImporter from "./HistoricalTransactionImporter";
import InventoryCostConnectionCheck from "./InventoryCostConnectionCheck";

export default function SettlementCostManagement() {
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <h1 className="text-lg font-bold text-gray-900">원가 관리</h1>
        <p className="mt-1 text-sm text-gray-500">
          현재 누락 원가를 먼저 처리하고, 필요할 때 전체 FIFO 배정 이력과 초기 자료를 확인합니다.
        </p>
      </section>

      <SettlementMissingCostManager />

      <InventoryCostConnectionCheck />

      <details className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <summary className="cursor-pointer px-4 py-4 text-sm font-bold text-gray-900">
          전체 원가 배정 원장
          <span className="ml-2 text-xs font-normal text-gray-500">판매·입고·시연용·재고조정 이력 추적</span>
        </summary>
        <div className="border-t border-gray-200 p-4">
          <InventoryCostLedger />
        </div>
      </details>

      <details className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <summary className="cursor-pointer px-4 py-4 text-sm font-bold text-gray-900">
          초기 원가·과거자료
          <span className="ml-2 text-xs font-normal text-gray-500">초기 세팅과 과거 정산 자료 등록</span>
        </summary>
        <div className="space-y-5 border-t border-gray-200 p-4">
          <SettlementCostDataManager />
          <HistoricalTransactionImporter />
        </div>
      </details>
    </div>
  );
}
