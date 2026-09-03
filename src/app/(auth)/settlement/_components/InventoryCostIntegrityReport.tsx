"use client";

import { Fragment, useState } from "react";
import ServiceCostLinkEditor from "./ServiceCostLinkEditor";
import ServiceManualCostEditor from "./ServiceManualCostEditor";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Button from "@/app/_components/Button";
import { getInventoryCostIntegrityReport, getServiceCostAttention } from "@/app/_domains/_inventory/_services/inventoryService";

export default function InventoryCostIntegrityReport() {
  const [limit, setLimit] = useState(10);
  const [selected, setSelected] = useState<string | null>(null);
  const entries = useQuery({
    queryKey: ["inventory", "service-cost-attention", limit],
    queryFn: () => getServiceCostAttention(limit),
    placeholderData: keepPreviousData,
  });
  const report = useQuery({
    queryKey: ["inventory", "cost-integrity", limit],
    queryFn: () => getInventoryCostIntegrityReport(limit),
    // Keep expanded rows and their unsaved editor state mounted while loading more.
    placeholderData: keepPreviousData,
  });
  if (report.isPending)
    return (
      <p className="mt-3 text-sm text-gray-600">
        재고·원가 연결을 점검하는 중…
      </p>
    );
  if (report.isError)
    return (
      <p role="alert" className="mt-3 text-sm text-rose-700">
        재고·원가 검증 결과를 불러오지 못했습니다.
      </p>
    );
  const {
    stockMismatchCount,
    layerMismatchCount,
    outboundMismatchCount,
  } = report.data;
  const serviceReviewCount = entries.data?.count ?? 0;
  const missingServiceLines = entries.data?.rows ?? [];
  const mismatched =
    stockMismatchCount + layerMismatchCount + outboundMismatchCount > 0;
  return (
    <section className="mt-4 rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-900">재고·원가 검증</h3>
        <Button
          size="xs"
          variant="secondary"
          disabled={report.isFetching}
          onClick={() => { void report.refetch(); void entries.refetch(); }}
        >
          다시 점검
        </Button>
      </div>
      <p
        className={`mt-2 text-sm ${mismatched ? "text-rose-700" : "text-emerald-700"}`}
      >
        재고 잔량 불일치 {stockMismatchCount} · 원가층 연결 불일치{" "}
        {layerMismatchCount} · 출고 원가·수량 불일치 {outboundMismatchCount}
      </p>
      <p className="mt-1 text-xs text-gray-500">
        재고 추적 제외 품목은 잔량 비교에서 제외하며, 승인된 0원층 분리와 소진
        원복은 구분해서 검증합니다.
      </p>
      {entries.isError && <p role="alert" className="mt-3 text-sm text-rose-700">서비스 원가 목록을 불러오지 못했습니다. 다시 점검해 주세요.</p>}
      {entries.isPending && <p className="mt-3 text-sm text-gray-600">서비스 원가 목록을 불러오는 중…</p>}
      {serviceReviewCount > 0 && (
        <details className="mt-3 border-t border-gray-100 pt-3">
          <summary className="text-sm font-semibold text-amber-800">
            서비스 원가 확인 필요 {serviceReviewCount}건
          </summary>
          <p className="mt-2 text-xs text-gray-600">
            원가 미입력 또는 검토가 남은 항목만 표시합니다. 배정 완료·수동 확정 완료·재고 미관리 품목은 제외합니다.
          </p>
          <div className="mt-3 mb-3 flex items-center justify-start gap-3">
            <p className="text-xs text-gray-600 sm:text-sm">
              <span className="font-semibold text-brand-600">
                {missingServiceLines.length}
              </span>
              /{serviceReviewCount}
            </p>
          </div>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full min-w-[460px] text-xs">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-3 py-2">출고일 / 이력</th>
                  <th className="px-3 py-2">품목</th>
                  <th className="px-3 py-2 text-right">수량</th>
                  <th className="px-3 py-2">원가 / 수정</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {missingServiceLines.map((line) => (
                  <Fragment key={`${line.log_id}:${line.line_index}`}>
                    <tr>
                      <td className="px-3 py-2">
                        {new Date(line.event_at).toLocaleDateString("ko-KR", {
                          month: "long",
                          day: "numeric",
                          weekday: "short",
                          timeZone: "Asia/Seoul",
                        })}
                        <div className="text-gray-500">
                          #{line.log_id} · {line.line_index}번째 품목
                        </div>
                      </td>
                      <td className="px-3 py-2">{line.item_name}</td>
                      <td className="px-3 py-2 text-right">{line.quantity}</td>
                      <td className="px-3 py-2">
                        <div
                          className={
                            line.total_cost !== null
                              ? "text-emerald-700"
                              : "text-amber-800"
                          }
                        >
                          {line.total_cost === null ? "원가 미입력" : `${line.total_cost.toLocaleString("ko-KR")}원`}
                          <span className="ml-1 text-gray-500">
                            {line.review?.kind === "offset_review" ? "수동 확정·원장 보류"
                              : line.review ? "수동 확정·출처 미확인"
                              : ({ manual: "직접 입력", fifo: "입고층 배정", linked: "기존 소진 연결", missing: "출처 미연결", untracked: "원가 없음" })[line.source]}
                          </span>
                        </div>
                        <Button
                          size="xs"
                          variant="secondary"
                          className="mt-1"
                          onClick={() =>
                            setSelected(
                              selected === `${line.log_id}:${line.line_index}`
                                ? null
                                : `${line.log_id}:${line.line_index}`,
                            )
                          }
                        >
                          {selected === `${line.log_id}:${line.line_index}`
                            ? "닫기"
                            : "원가 입력 / 수정"}
                        </Button>
                      </td>
                    </tr>
                    {selected === `${line.log_id}:${line.line_index}` && (
                      <tr>
                        <td colSpan={4} className="bg-gray-50/50 p-3">
                          <ServiceManualCostEditor key={line.snapshot} entry={line} />
                          {!line.has_allocation && <details className="mt-3">
                            <summary className="text-xs font-medium text-gray-600">앞뒤 원가 / 기존 소진 연결</summary>
                            <ServiceCostLinkEditor logId={line.log_id} lineIndex={line.line_index} />
                          </details>}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {missingServiceLines.length < Math.min(serviceReviewCount, 10000) && (
            <div className="mt-3">
              <Button
                size="sm"
                variant="secondary"
                disabled={entries.isFetching}
                onClick={() => setLimit((value) => value + 20)}
              >
                {entries.isFetching ? "불러오는 중…" : "더 보기"}
              </Button>
            </div>
          )}
        </details>
      )}
    </section>
  );
}
