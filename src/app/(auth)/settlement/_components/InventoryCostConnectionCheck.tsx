"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import Button from "@/app/_components/Button";
import Loading from "@/app/_components/Loading";
import {
  getCurrentInventoryValuation,
  getCurrentInventoryCostLayers,
  getInventoryPurchaseCostCandidates,
  addInventoryCostReconciliationLayer,
  consumeInventoryCostReconciliationLayer,
  getInventoryOverview,
  inventoryKeys,
} from "@/app/_domains/_inventory/_services/inventoryService";

type CheckRow = {
  itemName: string;
  actualQuantity: number;
  layerQuantity: number;
  lastMovementAt: string | null;
};

const CheckGroup = ({
  title,
  description,
  rows,
}: {
  title: string;
  description: string;
  rows: CheckRow[];
}) => (
  <section className="rounded-xl border border-gray-200 bg-white p-3">
    <div className="flex items-center justify-between gap-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <p className="mt-1 text-xs text-gray-500">{description}</p>
      </div>
      <span className="text-sm font-bold text-brand-700">
        {rows.length}개 품목
      </span>
    </div>
    {rows.length > 0 ? (
      <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full min-w-[460px] text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-600">
            <tr>
              <th className="px-3 py-2">품목명</th>
              <th className="px-3 py-2 text-right">실재고</th>
              <th className="px-3 py-2 text-right">원가층 잔량</th>
              <th className="px-3 py-2 text-right">차이</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => {
              const difference = row.actualQuantity - row.layerQuantity;
              return (
                <tr key={row.itemName}>
                  <td className="px-3 py-2 font-medium text-gray-900">
                    {row.itemName}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {row.actualQuantity.toLocaleString("ko-KR")}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {row.layerQuantity.toLocaleString("ko-KR")}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-semibold ${difference > 0 ? "text-emerald-700" : "text-rose-700"}`}
                  >
                    {difference > 0 ? "+" : ""}
                    {difference.toLocaleString("ko-KR")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    ) : (
      <p className="mt-3 text-sm text-emerald-700">해당 항목이 없습니다.</p>
    )}
  </section>
);

export default function InventoryCostConnectionCheck() {
  const queryClient = useQueryClient();
  const [unitCosts, setUnitCosts] = useState<Record<string, string>>({});
  const [eventDates, setEventDates] = useState<Record<string, string>>({});
  const [queuePositions, setQueuePositions] = useState<
    Record<string, "front" | "back">
  >({});
  const [consumeQuantities, setConsumeQuantities] = useState<
    Record<string, string>
  >({});
  const overviewQuery = useQuery({
    queryKey: inventoryKeys.overview,
    queryFn: getInventoryOverview,
  });
  const valuationQuery = useQuery({
    queryKey: inventoryKeys.valuation,
    queryFn: getCurrentInventoryValuation,
  });
  const layersQuery = useQuery({
    queryKey: ["inventory", "cost-layers"],
    queryFn: getCurrentInventoryCostLayers,
  });
  const groups = useMemo(() => {
    const items = overviewQuery.data?.items ?? [];
    const inventoryByItem = new Map(
      items.map((item) => [item.item_name, item]),
    );
    const layersByItem = new Map(
      (valuationQuery.data?.items ?? []).map((item) => [item.itemName, item]),
    );
    const rows = [
      ...new Set([...inventoryByItem.keys(), ...layersByItem.keys()]),
    ]
      .map((itemName) => ({
        itemName,
        actualQuantity: inventoryByItem.get(itemName)?.quantity ?? 0,
        layerQuantity: layersByItem.get(itemName)?.layerQuantity ?? 0,
        lastMovementAt: inventoryByItem.get(itemName)?.updated_at ?? null,
        isTracked: inventoryByItem.get(itemName)?.is_tracked ?? true,
      }))
      .sort((left, right) =>
        left.itemName.localeCompare(right.itemName, "ko-KR"),
      );
    return {
      missingLayer: rows.filter(
        (row) => row.isTracked && row.actualQuantity > row.layerQuantity,
      ),
      orphanedLayer: rows.filter(
        (row) => row.isTracked && row.layerQuantity > row.actualQuantity,
      ),
      untracked: rows.filter((row) => !row.isTracked && row.layerQuantity > 0),
    };
  }, [overviewQuery.data?.items, valuationQuery.data?.items]);
  const candidateQuery = useQuery({
    queryKey: [
      "inventory",
      "purchase-cost-candidates",
      groups.missingLayer.map((row) => row.itemName),
    ],
    queryFn: async () =>
      new Map(
        await Promise.all(
          groups.missingLayer.map(
            async (row) =>
              [
                row.itemName,
                await getInventoryPurchaseCostCandidates(row.itemName),
              ] as const,
          ),
        ),
      ),
    enabled: groups.missingLayer.length > 0,
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: inventoryKeys.valuation }),
      queryClient.invalidateQueries({ queryKey: ["inventory", "cost-layers"] }),
      queryClient.invalidateQueries({ queryKey: ["inventory-cost-ledger"] }),
      queryClient.invalidateQueries({
        queryKey: ["pending-inventory-cost-layers"],
      }),
    ]);
  };
  const addMutation = useMutation({
    mutationFn: addInventoryCostReconciliationLayer,
    onSuccess: async () => {
      await refresh();
      toast.success("원가층을 추가했습니다.");
    },
    onError: (error: Error) =>
      toast.error(error.message || "원가층 추가에 실패했습니다."),
  });
  const consumeMutation = useMutation({
    mutationFn: consumeInventoryCostReconciliationLayer,
    onSuccess: async () => {
      await refresh();
      toast.success("선택한 원가층을 소진했습니다.");
    },
    onError: (error: Error) =>
      toast.error(
        error.message.includes("COST_LAYER_RECONCILIATION_EXCESS_EXCEEDED")
          ? "실재고를 유지하려면 현재 초과된 원가층 수량까지만 소진할 수 있습니다."
          : error.message || "원가층 소진에 실패했습니다.",
      ),
  });
  const orphanedLayerItems = new Set(
    groups.orphanedLayer.map((row) => row.itemName),
  );
  const candidateLayers = (layersQuery.data ?? []).filter((layer) =>
    orphanedLayerItems.has(layer.itemName),
  );
  const remainingExcessByItem = new Map(
    groups.orphanedLayer.map((row) => [
      row.itemName,
      row.layerQuantity - row.actualQuantity,
    ]),
  );
  const consumableByLayer = new Map<string, number>();
  for (const layer of candidateLayers) {
    const remainingExcess = remainingExcessByItem.get(layer.itemName) ?? 0;
    const maximum = Math.min(layer.remainingQuantity, remainingExcess);
    consumableByLayer.set(layer.id, maximum);
    remainingExcessByItem.set(layer.itemName, remainingExcess - maximum);
  }

  // 후보 조회는 불일치 품목이 있을 때만 실행된다. 비활성 쿼리는 pending 상태로 남으므로
  // 원가층 없음 항목이 없을 때는 로딩 조건에서 제외한다.
  if (
    overviewQuery.isPending ||
    valuationQuery.isPending ||
    layersQuery.isPending ||
    (groups.missingLayer.length > 0 && candidateQuery.isPending)
  )
    return <Loading size="sm" text="원가 연결을 점검하는 중..." />;
  if (overviewQuery.isError || valuationQuery.isError || layersQuery.isError)
    return (
      <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700">
        원가 연결 점검을 불러오지 못했습니다.
      </p>
    );

  return (
    <section className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4">
      <h2 className="text-sm font-bold text-gray-900">원가 연결 점검</h2>
      <p className="mt-1 text-sm text-gray-600">
        기초원가와 현재 재고의 기준 차이를 품목별로 확인합니다. 재고조정 전에
        원본 입출고·기초원가를 먼저 검토하세요.
      </p>
      <div className="mt-4 space-y-3">
        <CheckGroup
          title="원가층 없음"
          description="실재고가 원가층보다 많은 품목입니다. 초과 수량은 FIFO 원장 기준 원가가 없습니다."
          rows={groups.missingLayer}
        />
        {groups.missingLayer.length > 0 && (
          <section className="rounded-xl border border-brand-200 bg-brand-50/50 p-3">
            <p className="text-sm font-semibold text-gray-900">원가층 추가</p>
            <p className="mt-1 text-xs text-gray-600">
              최근 재고변동일과 실제 입고단가 후보를 확인한 뒤, 원가가 들어와야
              할 날짜와 FIFO 순서를 정합니다.
            </p>
            {candidateQuery.isError && (
              <p className="mt-2 text-xs font-medium text-rose-700">
                최근 입고 후보를 불러오지 못했습니다. 새로고침 후 다시 확인해
                주세요.
              </p>
            )}
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[850px] text-sm">
                <thead className="text-left text-xs text-gray-600">
                  <tr>
                    <th className="px-2 py-2">품목</th>
                    <th className="px-2 py-2 text-right">추가 수량</th>
                    <th className="px-2 py-2">기준일</th>
                    <th className="px-2 py-2">최근 입고 후보</th>
                    <th className="px-2 py-2">개당 원가</th>
                    <th className="px-2 py-2">FIFO</th>
                    <th className="px-2 py-2">처리</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.missingLayer.map((row) => {
                    const quantity = row.actualQuantity - row.layerQuantity;
                    const candidates =
                      candidateQuery.data?.get(row.itemName) ?? [];
                    const defaultDate =
                      row.lastMovementAt?.slice(0, 10) ||
                      candidates[0]?.arrivedOn ||
                      "";
                    const eventDate = eventDates[row.itemName] ?? defaultDate;
                    const cost = Number(unitCosts[row.itemName]);
                    const position = queuePositions[row.itemName] ?? "back";
                    return (
                      <tr key={row.itemName}>
                        <td className="px-2 py-2 font-medium">
                          {row.itemName}
                          <p className="mt-1 text-xs font-normal text-gray-500">
                            최근 변동{" "}
                            {row.lastMovementAt
                              ? row.lastMovementAt.slice(0, 10)
                              : "없음"}
                          </p>
                        </td>
                        <td className="px-2 py-2 text-right">
                          {quantity.toLocaleString("ko-KR")}개
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="date"
                            value={eventDate}
                            onChange={(event) =>
                              setEventDates((current) => ({
                                ...current,
                                [row.itemName]: event.target.value,
                              }))
                            }
                            className="h-9 rounded-lg border border-gray-300 bg-white px-2"
                          />
                        </td>
                        <td className="px-2 py-2">
                          {candidates.length ? (
                            candidates.map((candidate) => (
                              <button
                                key={`${candidate.arrivedOn}-${candidate.unitCost}`}
                                type="button"
                                onClick={() => {
                                  setUnitCosts((current) => ({
                                    ...current,
                                    [row.itemName]: String(candidate.unitCost),
                                  }));
                                  setEventDates((current) => ({
                                    ...current,
                                    [row.itemName]: candidate.arrivedOn,
                                  }));
                                }}
                                className="mr-1 mb-1 rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:border-brand-300"
                              >
                                {candidate.arrivedOn} ·{" "}
                                {candidate.unitCost.toLocaleString("ko-KR")}원
                              </button>
                            ))
                          ) : (
                            <span className="text-xs text-gray-500">
                              입고 후보 없음
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            min="0"
                            value={unitCosts[row.itemName] ?? ""}
                            onChange={(event) =>
                              setUnitCosts((current) => ({
                                ...current,
                                [row.itemName]: event.target.value,
                              }))
                            }
                            placeholder="개당 원가"
                            className="h-9 w-28 rounded-lg border border-gray-300 bg-white px-2 text-right"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <select
                            value={position}
                            onChange={(event) =>
                              setQueuePositions((current) => ({
                                ...current,
                                [row.itemName]: event.target.value as
                                  "front" | "back",
                              }))
                            }
                            className="h-9 rounded-lg border border-gray-300 bg-white px-2 text-xs"
                          >
                            <option value="front">앞 (기초재고)</option>
                            <option value="back">뒤 (신규입고)</option>
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <Button
                            size="xs"
                            disabled={
                              !eventDate ||
                              !Number.isInteger(cost) ||
                              cost < 0 ||
                              addMutation.isPending
                            }
                            onClick={() =>
                              addMutation.mutate({
                                itemName: row.itemName,
                                quantity,
                                unitCost: cost,
                                eventDate,
                                queuePosition: position,
                                note: "원가 연결 점검에서 추가",
                              })
                            }
                          >
                            원가층 추가
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
        <CheckGroup
          title="재고 연결 없음"
          description="원가층은 남아 있지만 현재 재고보다 많은 품목입니다. 원본 출고 또는 기초 기준을 확인하세요."
          rows={groups.orphanedLayer}
        />
        {candidateLayers.length > 0 && (
          <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
            <p className="text-sm font-semibold text-gray-900">
              남은 원가층 선택 소진
            </p>
            <p className="mt-1 text-xs text-gray-600">
              원본 출고가 없거나 기초 기준을 정리해야 할 때, 아래 기록 중 실제로
              뺄 원가층만 선택합니다. 재고 수량은 바뀌지 않습니다.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-left text-xs text-gray-600">
                  <tr>
                    <th className="px-2 py-2">품목</th>
                    <th className="px-2 py-2">원가 출처</th>
                    <th className="px-2 py-2 text-right">잔량</th>
                    <th className="px-2 py-2 text-right">개당 원가</th>
                    <th className="px-2 py-2">소진 수량</th>
                    <th className="px-2 py-2">처리</th>
                  </tr>
                </thead>
                <tbody>
                  {candidateLayers.map((layer) => {
                    const maximum = consumableByLayer.get(layer.id) ?? 0;
                    const quantity = Number(
                      consumeQuantities[layer.id] ?? maximum,
                    );
                    return (
                      <tr key={layer.id}>
                        <td className="px-2 py-2 font-medium">
                          {layer.itemName}
                        </td>
                        <td className="px-2 py-2 text-xs text-gray-600">
                          {layer.eventType} · {layer.referenceType}
                        </td>
                        <td className="px-2 py-2 text-right">
                          {layer.remainingQuantity.toLocaleString("ko-KR")}
                        </td>
                        <td className="px-2 py-2 text-right">
                          {layer.unitCost == null
                            ? "미확정"
                            : `${layer.unitCost.toLocaleString("ko-KR")}원`}
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            min="1"
                            max={maximum}
                            value={
                              consumeQuantities[layer.id] ?? String(maximum)
                            }
                            onChange={(event) =>
                              setConsumeQuantities((current) => ({
                                ...current,
                                [layer.id]: event.target.value,
                              }))
                            }
                            className="h-9 w-20 rounded-lg border border-gray-300 bg-white px-2 text-right"
                          />
                          <p className="mt-1 text-xs text-gray-500">
                            최대 {maximum.toLocaleString("ko-KR")}개
                          </p>
                        </td>
                        <td className="px-2 py-2">
                          <Button
                            size="xs"
                            variant="gray"
                            disabled={
                              !Number.isInteger(quantity) ||
                              quantity < 1 ||
                              quantity > maximum ||
                              consumeMutation.isPending
                            }
                            onClick={() =>
                              consumeMutation.mutate({
                                layerId: layer.id,
                                quantity,
                                note: "원가 연결 점검에서 소진",
                              })
                            }
                          >
                            원가층 소진
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
        <CheckGroup
          title="수량 미관리 제외"
          description="수량 미관리 품목의 원가층입니다. 현재 재고 원가 총액 비교에서는 제외합니다."
          rows={groups.untracked}
        />
      </div>
    </section>
  );
}
