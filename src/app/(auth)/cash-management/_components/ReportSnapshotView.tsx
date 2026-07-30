"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toBlob } from "html-to-image";
import toast from "react-hot-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import Button from "@/app/_components/Button";
import type {
  DailyClosingReportSnapshot,
  DailyClosingReportType,
} from "@/app/_domains/_dailyClosing/_types/dailyClosing.types";
import { formatKoreanDate } from "@/app/_components/KoreanDatePicker";
import {
  getDailyClosingReportRevisions,
  reviseDailyClosingReport,
} from "@/app/_domains/_dailyClosing/_services/dailyClosingService";

const formatWon = (value: number) =>
  `${Number(value).toLocaleString("ko-KR")}원`;
const PHOTO_SAVE_ENABLED = false;

export default function ReportSnapshotView({
  report,
  editRequestKey = 0,
}: {
  report: DailyClosingReportType;
  editRequestKey?: number;
}) {
  const captureRef = useRef<HTMLDivElement>(null);
  const lastEditRequestRef = useRef(0);
  const [editing, setEditing] = useState(false);
  const [revisionReason, setRevisionReason] = useState("");
  const [draft, setDraft] = useState<DailyClosingReportSnapshot | null>(null);
  const revisionsQuery = useQuery({
    queryKey: ["daily-closing-report-revisions", report.id],
    queryFn: () => getDailyClosingReportRevisions(report.id),
  });
  const snapshot = useMemo(
    () =>
      revisionsQuery.data?.at(-1)?.report_snapshot ??
      report.report_snapshot,
    [report.report_snapshot, revisionsQuery.data],
  );
  useEffect(() => {
    setEditing(false);
    setRevisionReason("");
    setDraft(null);
  }, [report.id]);
  useEffect(() => {
    if (
      !snapshot ||
      !editRequestKey ||
      lastEditRequestRef.current === editRequestKey
    ) {
      return;
    }
    lastEditRequestRef.current = editRequestKey;
    setDraft(structuredClone(snapshot));
    setEditing(true);
  }, [editRequestKey, snapshot]);
  const revisionMutation = useMutation({
    mutationFn: () => {
      if (!draft) throw new Error("REVISION_NOT_READY");
      return reviseDailyClosingReport({
        reportId: report.id,
        reportSnapshot: {
          ...draft,
          capturedAt: new Date().toISOString(),
        },
        revisionReason,
      });
    },
    onSuccess: async () => {
      toast.success("수정본을 새 이력으로 저장했습니다.");
      setEditing(false);
      setRevisionReason("");
      setDraft(null);
      await revisionsQuery.refetch();
    },
    onError: () =>
      toast.error("수정본 저장에 실패했습니다. SQL을 확인해 주세요."),
  });

  const createBlob = async () => {
    if (!captureRef.current) throw new Error("CAPTURE_TARGET_NOT_FOUND");
    const blob = await toBlob(captureRef.current, {
      backgroundColor: "#ffffff",
      pixelRatio: 2,
      cacheBust: true,
    });
    if (!blob) throw new Error("IMAGE_CREATE_FAILED");
    return blob;
  };

  const saveImage = async () => {
    try {
      const blob = await createBlob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `마감보고서-${report.business_date}.png`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("마감보고서 사진을 저장했습니다.");
    } catch {
      toast.error("사진 저장에 실패했습니다.");
    }
  };

  const copyImage = async () => {
    try {
      const blob = await createBlob();
      if (!navigator.clipboard || typeof ClipboardItem === "undefined") {
        throw new Error("CLIPBOARD_NOT_SUPPORTED");
      }
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      toast.success("마감보고서 사진을 복사했습니다.");
    } catch {
      toast.error("사진 복사를 지원하지 않는 환경입니다. 사진 저장을 이용해 주세요.");
    }
  };

  if (!snapshot) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
        이 보고서의 스냅샷이 DB에 저장되지 않았습니다. 최신
        daily_closing_report.sql 적용 여부를 확인한 뒤 해당 마감을 취소하고
        다시 마감해 주세요.
      </section>
    );
  }

  const ovapePayments = (snapshot.payments ?? []).filter(
    (item) => !item.paymentType.startsWith("egu_"),
  );
  const eguPayments = (snapshot.payments ?? []).filter((item) =>
    item.paymentType.startsWith("egu_"),
  );

  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-2">
        {PHOTO_SAVE_ENABLED && (
          <Button size="sm" variant="gray" onClick={saveImage}>
            사진 저장
          </Button>
        )}
        <Button size="sm" onClick={copyImage}>
          사진 복사
        </Button>
      </div>

      {editing && draft && (
        <section className="rounded-2xl border border-brand-200 bg-brand-50/30 p-4">
          <h3 className="font-bold text-gray-900">보고서 수정본 작성</h3>
          <p className="mt-1 text-xs text-gray-500">
            최초 마감본은 유지되며 새로운 수정 이력으로 저장됩니다.
          </p>
          <div className="mt-4 space-y-3">
            {draft.workers.map((worker, index) => (
              <div
                key={`${worker.name}-${index}`}
                className="grid gap-2 rounded-xl border border-gray-200 bg-white p-3 sm:grid-cols-[1fr_150px]"
              >
                <span className="self-center text-sm font-semibold">
                  {worker.name}
                </span>
                <label className="text-xs font-semibold text-gray-600">
                  입력 근무시간
                  <input
                    type="number"
                    min="0.01"
                    max="24"
                    step="0.01"
                    value={worker.inputWorkHours}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        workers: draft.workers.map((item, workerIndex) =>
                          workerIndex === index
                            ? {
                                ...item,
                                inputWorkHours: Number(event.target.value),
                              }
                            : item,
                        ),
                      })
                    }
                    className="mt-1 h-10 w-full rounded-lg border border-gray-300 px-3 text-right"
                  />
                </label>
              </div>
            ))}
            <div className="grid gap-3 lg:grid-cols-2">
              <label className="text-sm font-semibold text-gray-700">
                청소 현황·방식
                <textarea
                  value={draft.cleaningNote}
                  onChange={(event) =>
                    setDraft({ ...draft, cleaningNote: event.target.value })
                  }
                  className="mt-1 h-24 w-full resize-none rounded-xl border border-gray-300 p-3 font-normal"
                />
              </label>
              <label className="text-sm font-semibold text-gray-700">
                특이사항·전달사항
                <textarea
                  value={draft.specialNote}
                  onChange={(event) =>
                    setDraft({ ...draft, specialNote: event.target.value })
                  }
                  className="mt-1 h-24 w-full resize-none rounded-xl border border-gray-300 p-3 font-normal"
                />
              </label>
            </div>
            <label className="block text-sm font-semibold text-gray-700">
              수정 사유
              <input
                value={revisionReason}
                onChange={(event) => setRevisionReason(event.target.value)}
                placeholder="수정 사유를 반드시 입력해 주세요"
                className="mt-1 h-11 w-full rounded-lg border border-gray-300 px-3 font-normal"
              />
            </label>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="gray" onClick={() => setEditing(false)}>
              취소
            </Button>
            <Button
              onClick={() => revisionMutation.mutate()}
              disabled={
                revisionMutation.isPending || !revisionReason.trim()
              }
            >
              {revisionMutation.isPending ? "저장 중..." : "수정본 저장"}
            </Button>
          </div>
        </section>
      )}

      {revisionsQuery.data?.length ? (
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="font-bold text-gray-900">수정 이력</h3>
          <div className="mt-3 space-y-2">
            {revisionsQuery.data.map((revision) => (
              <div
                key={revision.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm"
              >
                <span className="font-semibold">
                  {revision.revision_number}차 수정 · {revision.revision_reason}
                </span>
                <span className="text-xs text-gray-500">
                  {revision.revised_by_name} ·{" "}
                  {new Date(revision.revised_at).toLocaleString("ko-KR")}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div
        ref={captureRef}
        className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 text-gray-900"
      >
        <div className="flex items-center justify-between border-b border-gray-200 pb-4">
          <div>
            <h2 className="text-xl font-bold">마감보고서</h2>
            <p className="mt-1 text-sm text-gray-500">
              {formatKoreanDate(snapshot.businessDate)}
            </p>
          </div>
          <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-sm font-bold text-emerald-700">
            마감 완료
          </span>
        </div>

        <ReportSection title="근무자 명단">
          <div className="overflow-hidden rounded-xl border border-gray-200">
            <table className="w-full border-collapse text-sm [&_td]:border [&_td]:border-gray-200 [&_th]:border [&_th]:border-gray-200">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-3 py-2">근무자</th>
                  <th className="px-3 py-2">근무시간</th>
                  <th className="px-3 py-2 text-right">실제 근무시간</th>
                  <th className="px-3 py-2 text-right">입력 근무시간</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.workers.map((worker, index) => (
                  <tr key={`${worker.name}-${index}`}>
                    <td className="px-3 py-2 font-semibold">{worker.name}</td>
                    <td className="px-3 py-2 text-center">
                      {worker.startTime} ~ {worker.actualEndTime}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {worker.actualWorkHours}시간
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-brand-700">
                      {worker.inputWorkHours}시간
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ReportSection>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SnapshotList
            title="오베이프 매출"
            rows={ovapePayments.map((item) => ({
              label: item.label,
              value: formatWon(item.amount),
            }))}
            rowCount={Math.max(ovapePayments.length, eguPayments.length)}
            total={formatWon(
              ovapePayments.reduce((sum, item) => sum + item.amount, 0),
            )}
          />
          <SnapshotList
            title="이구베이프 매출"
            rows={eguPayments.map((item) => ({
              label: item.label,
              value: formatWon(item.amount),
            }))}
            rowCount={Math.max(ovapePayments.length, eguPayments.length)}
            total={formatWon(
              eguPayments.reduce((sum, item) => sum + item.amount, 0),
            )}
          />
          <section className="flex min-h-36 flex-col overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
            <div className="flex min-h-0 flex-1 flex-col p-4">
              <h3 className="border-b border-gray-200 pb-2 font-bold text-gray-800">
                시재 현황
              </h3>
              <div className="flex flex-1 items-center justify-center py-3">
                <strong
                  className={`rounded-full px-4 py-2 text-sm ${
                    snapshot.cashDifference === 0
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-rose-100 text-rose-700"
                  }`}
                >
                  {snapshot.cashDifference === 0 ? "일치" : "불일치"}
                </strong>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col border-t border-gray-200 p-4">
              <h3 className="border-b border-gray-200 pb-2 font-bold text-gray-800">
                총 매출
              </h3>
              <strong className="flex flex-1 items-center justify-center py-3 text-2xl text-brand-700">
                {formatWon(snapshot.totalSales)}
              </strong>
            </div>
          </section>
          <SnapshotList
            title="판매종류 및 수량"
            rows={(snapshot.itemSummary ?? []).map((item) => ({
              label: item.categoryName,
              value: `${item.quantity}${
                item.categoryName === "택배" || item.categoryName === "배달"
                  ? "건"
                  : "개"
              }`,
            }))}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <SnapshotChecklist
            title="출근·교대 확인"
            items={snapshot.openingChecklist}
          />
          <SnapshotChecklist
            title="마감 확인"
            items={snapshot.closingChecklist}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <ReportSection title="청소 현황·방식">
            <p className="min-h-20 whitespace-pre-wrap rounded-xl bg-gray-50 p-3 text-sm text-gray-700">
              {snapshot.cleaningNote || "-"}
            </p>
          </ReportSection>
          <ReportSection title="특이사항·전달사항">
            <p className="min-h-20 whitespace-pre-wrap rounded-xl bg-gray-50 p-3 text-sm text-gray-700">
              {snapshot.specialNote || "-"}
            </p>
          </ReportSection>
        </div>
      </div>
    </div>
  );
}

function ReportSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 p-4">
      <h3 className="mb-3 font-bold text-gray-900">{title}</h3>
      {children}
    </section>
  );
}

function SnapshotList({
  title,
  rows,
  brand = false,
  rowCount = rows.length,
  total,
}: {
  title: string;
  rows: Array<{ label: string; value: string }>;
  brand?: boolean;
  rowCount?: number;
  total?: string;
}) {
  return (
    <section
      className={`flex min-h-36 flex-col rounded-xl border p-4 ${
        brand
          ? "border-brand-200 bg-brand-50"
          : "border-gray-200 bg-gray-50"
      }`}
    >
      <h3
        className={
          brand
            ? "border-b border-brand-200 pb-2 font-bold text-brand-700"
            : "border-b border-gray-200 pb-2 font-bold"
        }
      >
        {title}
      </h3>
      <div className="mt-3 flex flex-1 flex-col">
        <div className="space-y-2">
          {Array.from({ length: rowCount }, (_, index) => {
            const row = rows[index];
            return row ? (
            <div
              key={`${row.label}-${index}`}
              className="flex justify-between gap-3 border-b border-gray-200 pb-1.5 text-sm last:border-b-0"
            >
              <span className="text-gray-600">{row.label}</span>
              <strong>{row.value}</strong>
            </div>
            ) : (
              <div
                key={`empty-${index}`}
                aria-hidden="true"
                className="h-[26px] border-b border-transparent"
              />
            );
          })}
        </div>
        {total && (
          <div className="mt-auto flex items-center justify-between gap-3 border-t border-gray-300 pt-2.5 text-sm">
            <strong className="text-gray-700">합계</strong>
            <strong className="text-brand-700">{total}</strong>
          </div>
        )}
      </div>
    </section>
  );
}

function SnapshotChecklist({
  title,
  items,
}: {
  title: string;
  items: Array<{
    id: string;
    label: string;
    isRequired: boolean;
    checked: boolean;
  }>;
}) {
  return (
    <ReportSection title={title}>
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm"
          >
            <span className={item.checked ? "text-emerald-600" : "text-gray-400"}>
              {item.checked ? "✓" : "□"}
            </span>
            <span>{item.label}</span>
            {item.isRequired && (
              <span className="ml-auto text-xs font-bold text-rose-600">
                필수
              </span>
            )}
          </div>
        ))}
      </div>
    </ReportSection>
  );
}
