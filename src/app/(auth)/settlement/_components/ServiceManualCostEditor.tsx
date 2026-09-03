"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Button from "@/app/_components/Button";
import toast from "react-hot-toast";
import { saveServiceManualCost, type ServiceCostEntry } from "@/app/_domains/_inventory/_services/inventoryService";

const money = (value: number | null) => value === null ? "미입력" : `${value.toLocaleString("ko-KR")}원`;

export default function ServiceManualCostEditor({ entry }: { entry: ServiceCostEntry }) {
  const client = useQueryClient();
  const [price, setPrice] = useState(entry.manual ? String(entry.manual.unit_cost) : "");
  const [note, setNote] = useState("");
  const [review, setReview] = useState<"save" | "clear" | null>(null);
  const unitCost = Number(price);
  const total = unitCost * entry.quantity;
  const valid = entry.is_tracked && price.trim() !== "" && Number.isInteger(unitCost) && unitCost >= 0 && total <= 2147483647 && note.trim().length >= 2;
  const mutation = useMutation({
    mutationFn: (clear: boolean) => saveServiceManualCost(entry, clear ? null : unitCost, note),
    onSuccess: async () => {
      toast.success("서비스 원가가 저장됐습니다.");
      setReview(null);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["inventory"] }),
        client.invalidateQueries({ queryKey: ["service-cost-link-context"] }),
        client.invalidateQueries({ queryKey: ["inventory-cost-ledger"] }),
      ]);
    },
  });
  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-3">
      <p className="text-sm font-semibold">현재 원가 {money(entry.total_cost)}</p>
      {entry.review && <div className="text-xs text-gray-600">
        <p className="font-semibold">{entry.review.kind === "offset_review"
          ? "수동 확정 · 기존 보정과 중복 확인 필요 (원장 추가 보류)"
          : "수동 확정·출처 미확인 · 원장 금액 반영"}</p>
        <p className="mt-1">{entry.review.note}</p>
      </div>}
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-gray-700">
          개당 원가 (원)
          <input type="number" min={0} max={Math.floor(2147483647 / entry.quantity)} step={1}
            value={price} onChange={(event) => { setPrice(event.target.value); setReview(null); }}
            disabled={mutation.isPending || !entry.is_tracked} placeholder="원가 입력"
            className="mt-1 block w-36 rounded-lg border border-gray-300 bg-white px-3 py-2 text-right text-sm" />
        </label>
        <p className="pb-2 text-sm font-semibold">{entry.quantity}개 × {price !== "" && Number.isFinite(unitCost) ? money(unitCost) : "입력 단가"} = {valid || (price !== "" && Number.isFinite(total) && total >= 0) ? money(total) : "—"}</p>
      </div>
      <label className="block text-xs font-medium text-gray-700">
        입력 근거 / 수정 사유
        <input value={note} onChange={(event) => { setNote(event.target.value); setReview(null); }}
          disabled={mutation.isPending} placeholder="예: 당시 입고 전표에서 확인"
          className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" />
      </label>
      <p className="text-xs text-gray-500">
        서비스 원가를 직접 기록합니다. 기존 배정 금액에 더하지 않고 입력 금액을 우선 표시합니다.
        재고·원가층·판매원가는 바뀌지 않으며, 입고 출처 연결 여부는 별도로 유지됩니다.
      </p>
      {review && (
        <p className="rounded-lg border border-gray-200 bg-gray-50/70 p-3 text-sm">
          {money(entry.total_cost)} → {money(review === "clear" ? entry.allocated_cost ?? entry.linked_cost : total)}
          {review === "clear" ? " · 직접 입력을 취소하고 기존 배정 원가로 돌아갑니다." : " · 이 금액으로 저장합니다."}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!valid || mutation.isPending}
          onClick={() => review === "save" ? mutation.mutate(false) : setReview("save")}>
          {mutation.isPending ? "저장 중…" : review === "save" ? "확인 후 저장" : "원가 저장"}
        </Button>
        {entry.manual && <Button size="sm" variant="secondary" disabled={note.trim().length < 2 || mutation.isPending}
          onClick={() => review === "clear" ? mutation.mutate(true) : setReview("clear")}>
          {review === "clear" ? "확인 후 입력 취소" : "직접 입력 취소"}
        </Button>}
      </div>
      {mutation.isError && <p role="alert" className="text-sm text-rose-700">
        {mutation.error && typeof mutation.error === "object" && "message" in mutation.error ? String(mutation.error.message) : "저장하지 못했습니다."}
      </p>}
      {entry.history.length > 0 && <details>
        <summary className="text-xs font-medium">원가 입력·수정 이력 {entry.history.length}건</summary>
        {entry.history.map((history) => <p key={history.id} className="mt-2 text-xs text-gray-600">
          {new Date(history.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} · {money(history.before_cost.total_cost)} → {money(history.after_cost.total_cost)} · {history.note}
        </p>)}
      </details>}
    </div>
  );
}
