"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import Button from "@/app/_components/Button";
import {
  previewInventoryCostReassignment,
  approveInventoryCostReassignment,
  applyInventoryCostReassignment,
  getInventoryCostReassignmentRun,
  getInventoryCostReassignmentHistory,
  type CostReviewAllocation,
  type CostReviewDetail,
  type CostReviewRun,
} from "@/app/_domains/_inventory/_services/inventoryService";

const money = (value: number | null) =>
  value === null ? "미확정" : `${value.toLocaleString("ko-KR")}원`;
const date = (value: string) =>
  new Date(value).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Seoul",
  });
const statusLabel: Record<CostReviewRun["status"], string> = {
  previewed: "미리보기",
  approved: "승인됨",
  applied: "적용 완료",
  rejected: "사용 불가",
};
const eventLabel: Record<string, string> = {
  sale_out: "판매",
  service_out: "서비스",
  demo_out: "시연",
  adjustment_out: "재고조정",
  after_service_out: "A/S",
  customer_exchange_out: "교환",
  reconciliation_out: "원가층 소진",
  reversal: "원복",
  loss_out: "손실",
};
const errorText = (error: unknown) =>
  error && typeof error === "object" && "message" in error
    ? String(error.message)
    : "요청에 실패했습니다. 다시 확인해 주세요.";

function ReviewDetail({ run }: { run: CostReviewDetail }) {
  const lines = [...run.inventory_cost_reassignment_preview_lines].sort(
    (a, b) => a.event_at.localeCompare(b.event_at) || a.id.localeCompare(b.id),
  );
  const layerDates = new Map(run.source_layers?.map((l) => [l.id, l.event_at]));
  const allocations = (values: CostReviewAllocation[] | null) =>
    (values ?? []).map((a) => (
      <div
        key={a.source_layer_id}
        title={`원가층 ID: ${a.source_layer_id}`}
        className="whitespace-nowrap"
      >
        {layerDates.has(a.source_layer_id)
          ? date(layerDates.get(a.source_layer_id)!)
          : "원가층"}{" "}
        · {a.quantity}개 × {money(a.unit_cost)}
      </div>
    ));
  return (
    <div className="mt-3 space-y-3">
      <p className="text-sm font-semibold text-gray-900">
        {run.item_name} · {date(run.from_at)} 이후 · {statusLabel[run.status]}
      </p>
      <p className="text-sm text-gray-700">
        재고 {run.inventory_quantity_before}개 → {run.inventory_quantity_after}
        개 · 출고 원가 {money(run.cost_before)} → {money(run.cost_after)} · 배정
        변경 {run.affected_outbound_count}건
      </p>
      {run.note && <p className="text-xs text-gray-600">사유: {run.note}</p>}
      {run.plan_version !== 2 ? (
        <p className="text-sm text-amber-800">
          이전 방식으로 생성된 기록입니다. 새 미리보기를 만들어 주세요.
        </p>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-start gap-3">
            <p className="text-xs text-gray-600 sm:text-sm">
              출고{" "}
              <span className="font-semibold text-brand-600">
                {lines.length}
              </span>
              건
            </p>
          </div>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full min-w-[850px] text-xs">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  {[
                    "출고일 / 이력",
                    "기존 원가층",
                    "변경 원가층",
                    "기존 원가",
                    "변경 원가",
                    "차이 / 보호 사유",
                  ].map((label) => (
                    <th key={label} className="px-3 py-2">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {lines.map((line) => (
                  <tr key={line.id}>
                    <td className="px-3 py-2">
                      {date(line.event_at)}
                      <div className="text-gray-500">
                        {eventLabel[line.event_type] ?? "출고"} #
                        {line.reference_id} · {line.quantity}개
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {allocations(line.before_allocations)}
                    </td>
                    <td className="px-3 py-2">
                      {allocations(line.after_allocations)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {money(line.cost_before)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap font-semibold">
                      {money(line.cost_after)}
                    </td>
                    <td className="px-3 py-2">
                      {line.protected_reason ??
                        (line.cost_before === null || line.cost_after === null
                          ? "미확정 포함"
                          : money(line.cost_after - line.cost_before))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default function InventoryCostReassignment() {
  const queryClient = useQueryClient();
  const [item, setItem] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [note, setNote] = useState("");
  const [run, setRun] = useState<CostReviewDetail | null>(null);
  const [historyId, setHistoryId] = useState("");
  const [limit, setLimit] = useState(10);
  const [reviewed, setReviewed] = useState(false);
  // Prevent an old in-flight preview from becoming actionable after its inputs changed.
  const generation = useRef(0);
  const invalidatePreview = () => {
    generation.current += 1;
    setRun(null);
    setReviewed(false);
  };
  const history = useQuery({
    queryKey: ["cost-reassignment-history", limit],
    queryFn: () => getInventoryCostReassignmentHistory(limit),
  });
  const historyDetail = useQuery({
    queryKey: ["cost-reassignment-detail", historyId],
    queryFn: () => getInventoryCostReassignmentRun(historyId),
    enabled: !!historyId,
  });
  const mutation = useMutation({
    mutationFn: async (action: "preview" | "approve" | "apply") => {
      const version = generation.current;
      let id = run?.id;
      if (action === "preview") {
        setRun(null);
        setReviewed(false);
        id = await previewInventoryCostReassignment({
          itemName: item,
          fromAt: fromDate,
          note,
        });
      } else {
        if (!id || !run || run.plan_version !== 2)
          throw new Error("새 미리보기를 만들어 주세요.");
        if (action === "approve") await approveInventoryCostReassignment(id);
        else await applyInventoryCostReassignment(id);
      }
      const detail = await getInventoryCostReassignmentRun(id!);
      if (generation.current === version) setRun(detail);
      if (action === "apply") {
        // Cost consumers include movement prices, valuation, settlement and A/S drawers.
        await queryClient.invalidateQueries();
        toast.success(
          "승인한 원가 배정을 적용했습니다. 재고 수량은 변경하지 않았습니다.",
        );
      } else
        await queryClient.invalidateQueries({
          queryKey: ["cost-reassignment-history"],
        });
    },
    onError: (error) => {
      invalidatePreview();
      toast.error(errorText(error));
    },
  });
  return (
    <section className="mt-4 rounded-xl border border-gray-200 bg-white p-3">
      <h3 className="text-sm font-semibold text-gray-900">원가 재배정</h3>
      <p className="mt-1 text-xs text-gray-600">
        실재고는 그대로 두고, 아래에서 확인·승인한 원가 배정만 적용합니다.
        반품·A/S·수동 소진·정산비용 연결 기록은 보존합니다.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-gray-50/70 p-3">
        <label className="min-w-48 flex-1 text-xs font-medium text-gray-700">
          정확한 품목명
          <div className="relative mt-1">
            <svg
              className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-gray-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m16 16 4 4" />
            </svg>
            <input
              value={item}
              disabled={mutation.isPending}
              onChange={(e) => {
                setItem(e.target.value);
                invalidatePreview();
              }}
              placeholder="품목명을 입력하세요"
              className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-10 text-sm font-medium text-gray-900 shadow-sm outline-none transition placeholder:font-normal placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
            {item && (
              <button
                type="button"
                disabled={mutation.isPending}
                aria-label="품목명 지우기"
                onClick={() => {
                  setItem("");
                  invalidatePreview();
                }}
                className="absolute top-2 right-2 h-6 w-6 text-gray-500"
              >
                ×
              </button>
            )}
          </div>
        </label>
        <label className="text-xs font-medium text-gray-700">
          시작일
          <input
            type="date"
            value={fromDate}
            disabled={mutation.isPending}
            onChange={(e) => {
              setFromDate(e.target.value);
              invalidatePreview();
            }}
            className="mt-1 block rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm"
          />
        </label>
        <label className="min-w-40 flex-1 text-xs font-medium text-gray-700">
          변경 사유
          <input
            value={note}
            disabled={mutation.isPending}
            onChange={(e) => {
              setNote(e.target.value);
              invalidatePreview();
            }}
            placeholder="변경 사유 입력"
            className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm"
          />
        </label>
        <Button
          size="sm"
          disabled={
            !item.trim() || !fromDate || !note.trim() || mutation.isPending
          }
          onClick={() => mutation.mutate("preview")}
        >
          {mutation.isPending ? "처리 중…" : "미리보기"}
        </Button>
      </div>
      {run && (
        <>
          <ReviewDetail run={run} />
          {run.affected_outbound_count === 0 && (
            <p className="mt-3 text-sm text-gray-600">
              변경할 배정이 없습니다.
            </p>
          )}
          {run.status === "previewed" && run.affected_outbound_count > 0 && (
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={reviewed}
                disabled={mutation.isPending}
                onChange={(e) => setReviewed(e.target.checked)}
              />
              출고별 기존 원가·변경 원가와 보호 항목을 확인했습니다.
            </label>
          )}
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={
                mutation.isPending ||
                run.status !== "previewed" ||
                !reviewed ||
                run.affected_outbound_count === 0
              }
              onClick={() => mutation.mutate("approve")}
            >
              검토 결과 승인
            </Button>
            <Button
              size="sm"
              disabled={mutation.isPending || run.status !== "approved"}
              onClick={() => mutation.mutate("apply")}
            >
              승인한 배정 적용
            </Button>
          </div>
        </>
      )}
      <details className="mt-4 border-t border-gray-200 pt-3">
        <summary className="text-sm font-semibold text-gray-800">
          미리보기·승인·실행 이력
        </summary>
        {history.isPending ? (
          <p className="mt-3 text-sm">불러오는 중…</p>
        ) : history.isError ? (
          <p role="alert" className="mt-3 text-sm text-rose-700">
            {errorText(history.error)}
          </p>
        ) : (
          <>
            <div className="mt-3 mb-3 flex items-center justify-start gap-3">
              <p className="text-xs text-gray-600 sm:text-sm">
                <span className="font-semibold text-brand-600">
                  {history.data.rows.length}
                </span>
                /{history.data.count}
              </p>
            </div>
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full min-w-[560px] text-xs">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    {["생성일", "품목 / 시작일", "변경", "상태", "내역"].map(
                      (s) => (
                        <th className="px-3 py-2" key={s}>
                          {s}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {history.data.rows.map((row) => (
                    <tr key={row.id}>
                      <td className="px-3 py-2">{date(row.created_at)}</td>
                      <td className="px-3 py-2">
                        {row.item_name}
                        <div>{date(row.from_at)}</div>
                      </td>
                      <td className="px-3 py-2">
                        {row.affected_outbound_count}건
                      </td>
                      <td className="px-3 py-2">{statusLabel[row.status]}</td>
                      <td className="px-3 py-2">
                        <Button
                          size="xs"
                          variant="secondary"
                          onClick={() =>
                            setHistoryId(historyId === row.id ? "" : row.id)
                          }
                        >
                          {historyId === row.id ? "닫기" : "내역 보기"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {history.data.rows.length < history.data.count && (
              <div className="mt-3">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setLimit((value) => value + 10)}
                >
                  더 보기
                </Button>
              </div>
            )}
          </>
        )}
        {historyId &&
          (historyDetail.isPending ? (
            <p className="mt-3 text-sm">내역을 불러오는 중…</p>
          ) : historyDetail.isError ? (
            <p role="alert" className="mt-3 text-sm text-rose-700">
              {errorText(historyDetail.error)}
            </p>
          ) : (
            <ReviewDetail run={historyDetail.data} />
          ))}
      </details>
    </section>
  );
}
