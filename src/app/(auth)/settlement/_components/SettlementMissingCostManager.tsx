"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import Button from "@/app/_components/Button";
import Loading from "@/app/_components/Loading";
import {
  getSettlementCostItems,
  getPendingInventoryCostLayers,
  saveSettlementItemCost,
} from "@/app/_domains/_settlement/_services/settlementService";

const eventLabels: Record<string, string> = {
  opening: "기존 재고/FIFO 부족",
  purchase_in: "입고 원가 미입력",
  customer_exchange_in: "고객 교환입고 원가 미연결",
  adjustment_in: "재고조정 입고 원가 미연결",
  after_service_in: "A/S 입고 원가 미연결",
};

export default function SettlementMissingCostManager() {
  const queryClient = useQueryClient();
  const [costDrafts, setCostDrafts] = useState<Record<string, string>>({});
  const pendingLayersQuery = useQuery({
    queryKey: ["pending-inventory-cost-layers"],
    queryFn: getPendingInventoryCostLayers,
  });
  const costsQuery = useQuery({
    queryKey: ["settlement-cost-items"],
    queryFn: getSettlementCostItems,
  });
  const costItemsByName = useMemo(
    () => new Map((costsQuery.data ?? []).map((item) => [item.itemName, item])),
    [costsQuery.data],
  );
  const missingItems = useMemo(() => {
    const grouped = new Map<
      string,
      {
        itemName: string;
        basisType: "historical" | "opening_20260722";
        missingQuantity: number;
        reasons: Set<string>;
        latestAt: string;
      }
    >();
    for (const row of pendingLayersQuery.data ?? []) {
      const basisType =
        row.eventAt < new Date("2026-07-22T00:00:00+09:00").toISOString()
          ? "historical"
          : "opening_20260722";
      const key = `${row.itemName}:${basisType}`;
      const current = grouped.get(key) ?? {
        itemName: row.itemName,
        basisType,
        missingQuantity: 0,
        reasons: new Set<string>(),
        latestAt: row.eventAt,
      };
      current.missingQuantity += row.quantity;
      current.reasons.add(eventLabels[row.eventType] ?? row.eventType);
      if (row.eventAt > current.latestAt) current.latestAt = row.eventAt;
      grouped.set(key, current);
    }
    return [...grouped.values()].map((item) => ({
      ...item,
      reasons: [...item.reasons].join(", "),
    }));
  }, [pendingLayersQuery.data]);
  const saveMutation = useMutation({
    mutationFn: saveSettlementItemCost,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["settlement-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["settlement-cost-items"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-cost-ledger"] }),
        queryClient.invalidateQueries({ queryKey: ["pending-inventory-cost-layers"] }),
      ]);
      toast.success("누락 원가를 저장했습니다.");
    },
    onError: () => toast.error("원가 저장에 실패했습니다."),
  });

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <h1 className="text-lg font-bold text-gray-900">원가 누락 관리</h1>
        <p className="mt-1 text-sm text-gray-500">
          공통 원장에 남아 있는 모든 미확정 원가를 확인하고 바로 입력합니다.
        </p>
        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50/70 p-3 text-xs text-gray-600">
          판매 여부와 관계없이 입고·교환·A/S·재고조정에서 원가 출처가 없는 기록을 모두 표시합니다.
        </div>
      </section>

      {(pendingLayersQuery.isPending || costsQuery.isPending) ? (
        <Loading size="sm" text="누락 원가를 확인하는 중..." />
      ) : !missingItems.length ? (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-8 text-center">
          <p className="font-semibold text-emerald-700">공통 원장에 원가가 누락된 품목이 없습니다.</p>
        </section>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-start gap-3">
            <p className="text-xs text-gray-600 sm:text-sm">
              누락 품목 <span className="font-semibold text-brand-600">{missingItems.length}</span>개 · 누락 수량 <span className="font-semibold text-brand-600">{missingItems.reduce((sum, item) => sum + item.missingQuantity, 0).toLocaleString("ko-KR")}</span>개
            </p>
          </div>
          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="border-b border-gray-200 bg-gray-50/70 text-left text-xs font-semibold text-gray-600">
                  <tr><th className="px-4 py-3">품목</th><th className="px-4 py-3">발생 원인</th><th className="px-4 py-3">누락 구분</th><th className="px-4 py-3 text-right">누락 수량</th><th className="px-4 py-3">개당 원가</th><th className="px-4 py-3 text-center">관리</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {missingItems.map((missing) => {
                    const key = `${missing.itemName}:${missing.basisType}`;
                    const costItem = costItemsByName.get(missing.itemName);
                    const stored = missing.basisType === "historical" ? costItem?.historicalSegments ?? [] : costItem?.openingSegments ?? [];
                    return (
                      <tr key={key}>
                        <td className="px-4 py-4 font-semibold text-gray-900">{missing.itemName}</td>
                        <td className="px-4 py-4 text-gray-600">{missing.reasons}</td>
                        <td className="px-4 py-4 text-gray-600">{missing.basisType === "historical" ? "6/1~7/21 판매분" : "7/22 이후 재고 원가"}</td>
                        <td className="px-4 py-4 text-right font-semibold text-rose-600">{missing.missingQuantity.toLocaleString("ko-KR")}개</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <input type="number" min="0" value={costDrafts[key] ?? ""} onChange={(event) => setCostDrafts((current) => ({ ...current, [key]: event.target.value }))} placeholder="개당 원가" aria-label={`${missing.itemName} 개당 원가`} className="h-10 w-36 rounded-lg border border-gray-300 bg-white px-3 text-right text-sm font-medium shadow-sm outline-none hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
                            <span className="text-xs text-gray-500">원</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Button size="xs" disabled={saveMutation.isPending} onClick={() => {
                            const unitCost = Number(costDrafts[key]);
                            if (!Number.isInteger(unitCost) || unitCost < 0 || costDrafts[key] === "") return toast.error("개당 원가를 확인해 주세요.");
                            saveMutation.mutate({ itemId: costItem?.itemId ?? null, itemName: missing.itemName, basisType: missing.basisType, segments: [...stored.map((segment) => ({ quantity: segment.quantity, unitCost: segment.unitCost })), { quantity: missing.missingQuantity, unitCost }] });
                          }}>저장</Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
