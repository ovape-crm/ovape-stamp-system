"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Button from "@/app/_components/Button";
import { assessServiceCost, serviceCostFormula } from "./serviceCostAssessment";
import {
  getServiceCostLinkContext,
  saveServiceCostLinks,
  type ServiceCostContext,
} from "@/app/_domains/_inventory/_services/inventoryService";

const money = (n: number | null) =>
  n === null ? "미확정" : `${n.toLocaleString("ko-KR")}원`;
const date = (s: string) =>
  new Date(s).toLocaleString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  });
const labels: Record<string, string> = {
  opening: "기초재고",
  purchase_in: "입고",
  sale_out: "판매 출고",
  service_out: "서비스",
  demo_out: "시연",
  adjustment_in: "재고조정 입고",
  adjustment_out: "재고조정 출고",
  after_service_out: "A/S 출고",
  after_service_in: "A/S 입고",
  customer_exchange_in: "교환 입고",
  customer_exchange_out: "교환 출고",
  reconciliation_out: "원가층 소진",
  reconciliation_in: "원가층 보충",
  reversal: "원복",
  loss_out: "손실",
};
const errorText = (e: unknown) =>
  e && typeof e === "object" && "message" in e
    ? String(e.message)
    : "요청에 실패했습니다.";

function Editor({
  context,
  refresh,
}: {
  context: ServiceCostContext;
  refresh: () => Promise<unknown>;
}) {
  const client = useQueryClient();
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      context.candidates.map((c) => [
        c.allocation_id,
        String(c.linked_quantity),
      ]),
    ),
  );
  const [note, setNote] = useState("");
  const [review, setReview] = useState(false);
  const [done, setDone] = useState(false);
  const selected = context.candidates.filter(
    (c) => Number(quantities[c.allocation_id]) > 0,
  );
  const totalQty = selected.reduce(
    (n, c) => n + Number(quantities[c.allocation_id]),
    0,
  );
  const cost = selected.some((c) => c.unit_cost === null)
    ? null
    : selected.reduce(
        (n, c) => n + Number(quantities[c.allocation_id]) * c.unit_cost!,
        0,
      );
  const previous = context.candidates.filter((c) => c.linked_quantity > 0);
  const beforeCost = previous.some((c) => c.unit_cost === null)
    ? null
    : previous.reduce((n, c) => n + c.linked_quantity * c.unit_cost!, 0);
  const invalid = context.candidates.some((c) => {
    const n = Number(quantities[c.allocation_id]);
    return (
      !Number.isInteger(n) ||
      n < 0 ||
      n > c.available_quantity ||
      (n > 0 && !c.eligible)
    );
  });
  const save = useMutation({
    mutationFn: () =>
      saveServiceCostLinks(
        context,
        selected.map((c) => ({
          allocation_id: c.allocation_id,
          quantity: Number(quantities[c.allocation_id]),
        })),
        note,
      ),
    onSuccess: async () => {
      setDone(true);
      await client.invalidateQueries({ queryKey: ["inventory"] });
      await refresh();
    },
  });
  const assessment = assessServiceCost(context);
  const [advanced, setAdvanced] = useState(false);
  const prepare = () => {
    if (!assessment.canPrepare) return;
    setQuantities(Object.fromEntries(context.candidates.map((c) => [
      c.allocation_id, String(c.eligible ? c.available_quantity : 0),
    ])));
    setNote("서비스 수량과 기존 소진 수량·출고 이전 출처 일치 확인. 검토안 계산을 확인하여 적용.");
    setReview(true);
  };
  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold">
        {date(context.event_at)} · {context.item_name} · 서비스{" "}
        {context.quantity}개
      </p>
      <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-sm font-semibold text-amber-800">{assessment.status}</p>
        <div>
          <p className="text-xs text-gray-500">{previous.length ? "현재 연결된 원가" : assessment.canPrepare ? "적용 전 원가 계산안" : "적용할 원가"}</p>
          <p className="mt-1 text-base font-semibold text-gray-900">
            {previous.length
              ? serviceCostFormula(previous.map((c) => ({ quantity: c.linked_quantity, unit_cost: c.unit_cost })))
              : assessment.canPrepare
                ? serviceCostFormula(assessment.sources.map((c) => ({ quantity: c.available_quantity, unit_cost: c.unit_cost })))
                : "미확정 · 임의 적용하지 않음"}
          </p>
        </div>
        <p className="text-sm text-gray-700">{assessment.reason}</p>
        <p className="text-xs text-gray-600">{assessment.next}</p>
        {assessment.canPrepare && !review && !previous.length && (
          <Button size="sm" disabled={save.isPending || done} onClick={prepare}>
            계산안 확인
          </Button>
        )}
        <p className="text-xs text-gray-500">원가층 선택은 필요하지 않습니다. 적용하더라도 기존 소진 기록만 연결하며 재고를 다시 차감하지 않습니다.</p>
      </div>
      <details className="border-t border-gray-200 pt-2" open={advanced} onToggle={(e) => setAdvanced(e.currentTarget.open)}>
        <summary className="mb-3 text-xs font-medium text-gray-600">
          상세 근거 / 고급 수정
        </summary>
        <div className="mb-3 flex items-center justify-start gap-3">
          <p className="text-xs text-gray-600 sm:text-sm">
            앞뒤 원가 기록{" "}
            <span className="font-semibold text-brand-600">
              {context.nearby.length}
            </span>
          </p>
        </div>
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full min-w-[650px] text-xs">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="p-2">구분 / 날짜</th>
                <th className="p-2">처리</th>
                <th className="p-2">수량</th>
                <th className="p-2">입고 출처 · 배정 단가</th>
                <th className="p-2">원가 합계</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {context.nearby.map((e) => (
                <tr key={e.id}>
                  <td className="p-2">
                    {e.position === "before" ? "이전" : "이후"}
                    <br />
                    {date(e.event_at)}
                  </td>
                  <td className="p-2">
                    {labels[e.event_type] ?? "기타"}
                    {e.restored && (
                      <div className="text-amber-800">
                        원복됨 · 사용 원가에서 제외
                      </div>
                    )}
                  </td>
                  <td className="p-2">{e.quantity}개</td>
                  <td className="p-2">
                    {e.allocations.length
                      ? e.allocations.map((a) => (
                          <div key={a.source_layer_id}>
                            {date(a.received_at)} · {a.quantity}개 ×{" "}
                            {money(a.unit_cost)}
                          </div>
                        ))
                      : "배정 없음 (입고 등)"}
                  </td>
                  <td className="p-2">{money(e.total_cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!context.nearby.length && (
            <p className="p-3 text-xs text-gray-500">
              같은 품목의 앞뒤 원가 기록이 없습니다.
            </p>
          )}
        </div>
        <h4 className="text-sm font-semibold">기존 소진 기록 연결 / 수정</h4>
        <p className="text-xs text-gray-600">
          여러 소진 기록에서 수량을 나눠 연결할 수 있습니다. 단가는 해당 기록의
          실제 원가를 사용합니다. 출고일 이후 입고층은 선택할 수 없습니다.
        </p>
        <div className="mb-3 flex items-center justify-start gap-3">
          <p className="text-xs text-gray-600 sm:text-sm">
            소진 기록{" "}
            <span className="font-semibold text-brand-600">
              {context.candidates.length}
            </span>
          </p>
        </div>
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full min-w-[650px] text-xs">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="p-2">입고 출처 / 소진일</th>
                <th className="p-2">단가</th>
                <th className="p-2">소진 / 연결 가능</th>
                <th className="p-2">연결 수량</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {context.candidates.map((c) => (
                <tr key={c.allocation_id}>
                  <td className="p-2">
                    {date(c.received_at)} · {labels[c.source_type] ?? "기타"}
                    <div className="text-gray-500">
                      출처 #{c.source_reference} · 층{" "}
                      {c.source_layer_id.slice(0, 8)}
                    </div>
                    <div>
                      소진 {date(c.consumed_at)} {c.note && `· ${c.note}`}
                    </div>
                    {!c.eligible && (
                      <div className="text-rose-700">
                        서비스 출고일 이후 입고 — 연결 불가
                      </div>
                    )}
                  </td>
                  <td className="p-2">{money(c.unit_cost)}</td>
                  <td className="p-2">
                    {c.consumed_quantity} / {c.available_quantity}개
                  </td>
                  <td className="p-2">
                    <input
                      aria-label={`${date(c.received_at)} 원가층 ${c.source_layer_id} 소진 ${date(c.consumed_at)} 연결 수량`}
                      type="number"
                      min={0}
                      max={c.available_quantity}
                      step={1}
                      disabled={!c.eligible || review || save.isPending || done}
                      value={quantities[c.allocation_id] ?? "0"}
                      onChange={(e) =>
                        setQuantities((q) => ({
                          ...q,
                          [c.allocation_id]: e.target.value,
                        }))
                      }
                      className="w-20 rounded-lg border border-gray-300 bg-white px-2 py-2 text-right disabled:cursor-not-allowed disabled:bg-gray-100"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!context.candidates.length && (
            <p className="p-3 text-xs text-amber-800">
              연결할 기존 소진 기록이 없습니다. 당시 전표 확인이 필요하며, 현재
              재고를 다시 차감하지 않습니다.
            </p>
          )}
        </div>
      <p className="text-sm font-semibold">
        연결 {totalQty} / {context.quantity}개 · 원가{" "}
        {previous.length ? money(beforeCost) : "배정 없음"} →{" "}
        {selected.length
          ? money(cost)
          : previous.length
            ? "연결 해제"
            : "선택 전"}
      </p>
      <label className="block text-xs font-medium">
        확인 근거 / 수정 사유
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={review || save.isPending || done}
          placeholder="확인한 입고 전표나 소진 기록을 적어 주세요"
          className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
        />
      </label>
      </details>
      {review && (
        <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-3 text-sm">
          <p className="font-semibold">적용 전 최종 확인</p>
          <p className="mt-2 font-semibold">{serviceCostFormula(selected.map((c) => ({ quantity: Number(quantities[c.allocation_id]), unit_cost: c.unit_cost })))}</p>
          {selected.map((c) => (
            <p key={c.allocation_id}>
              {date(c.received_at)} · {labels[c.source_type] ?? "원가 출처"} ·{" "}
              {quantities[c.allocation_id]}개 × {money(c.unit_cost)}
            </p>
          ))}
          <p className="mt-2">
            {selected.length
              ? "위 원가를 서비스에 연결합니다."
              : "연결을 해제하고 출처 미확정으로 되돌립니다."}{" "}
            재고·원가층 수량 변동 없음.
          </p>
        </div>
      )}
      {save.isError && (
        <p role="alert" className="text-sm text-rose-700">
          {errorText(save.error)} 새로 조회한 후 다시 확인해 주세요.
        </p>
      )}
      {done && (
        <p role="status" className="text-sm text-emerald-700">
          연결 변경이 저장됐습니다.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {!review && advanced ? (
          <Button
            size="sm"
            disabled={
              invalid ||
              (totalQty !== context.quantity && totalQty !== 0) ||
              note.trim().length < 2 ||
              done ||
              (totalQty === 0 && previous.length === 0)
            }
            onClick={() => setReview(true)}
          >
            변경 내용 확인
          </Button>
        ) : review ? (
          <>
            <Button
              size="sm"
              disabled={save.isPending || done}
              onClick={() => save.mutate()}
            >
              {save.isPending ? "저장 중…" : "확인한 연결 적용"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={save.isPending || done}
              onClick={() => setReview(false)}
            >
              다시 수정
            </Button>
          </>
        ) : null}
        <Button
          size="sm"
          variant="secondary"
          disabled={save.isPending}
          onClick={() => void refresh()}
        >
          새로 조회
        </Button>
      </div>
      {context.history.length > 0 && (
        <details>
          <summary className="text-sm font-semibold">
            연결 수정 이력 {context.history.length}건
          </summary>
          {context.history.map((h) => (
            <div
              key={h.id}
              className="mt-2 border-t border-gray-100 pt-2 text-xs"
            >
              <p>
                {date(h.created_at)} · {h.note}
              </p>
              <p>
                변경 전:{" "}
                {h.before_links.length
                  ? h.before_links
                      .map((l) => `${l.quantity}개 × ${money(l.unit_cost)}`)
                      .join(" + ")
                  : "연결 없음"}
              </p>
              <p>
                변경 후:{" "}
                {h.after_links.length
                  ? h.after_links
                      .map((l) => `${l.quantity}개 × ${money(l.unit_cost)}`)
                      .join(" + ")
                  : "연결 없음"}
              </p>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

export default function ServiceCostLinkEditor({
  logId,
  lineIndex,
}: {
  logId: string;
  lineIndex: number;
}) {
  const query = useQuery({
    queryKey: ["service-cost-link-context", logId, lineIndex],
    queryFn: () => getServiceCostLinkContext(logId, lineIndex),
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
  if (query.isPending)
    return <p className="text-sm">앞뒤 원가와 소진 기록을 조회하는 중…</p>;
  if (query.isError)
    return (
      <div role="alert">
        <p className="text-sm text-rose-700">{errorText(query.error)}</p>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void query.refetch()}
        >
          다시 조회
        </Button>
      </div>
    );
  return (
    <Editor
      key={`${query.data.snapshot}:${query.dataUpdatedAt}`}
      context={query.data}
      refresh={() => query.refetch()}
    />
  );
}
