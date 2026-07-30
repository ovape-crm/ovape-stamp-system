"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import Button from "@/app/_components/Button";
import Loading from "@/app/_components/Loading";
import {
  getDailyClosingChecklistItems,
  saveDailyClosingChecklistItems,
} from "@/app/_domains/_dailyClosing/_services/dailyClosingService";
import type {
  DailyClosingChecklistItem,
  DailyClosingChecklistPhase,
} from "@/app/_domains/_dailyClosing/_types/dailyClosing.types";

const phaseTitle: Record<DailyClosingChecklistPhase, string> = {
  opening: "출근·교대 확인",
  closing: "마감 확인",
};

export default function ChecklistManagement() {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DailyClosingChecklistItem[]>([]);
  const checklistQuery = useQuery({
    queryKey: ["daily-closing-checklist-items"],
    queryFn: getDailyClosingChecklistItems,
  });
  const items = useMemo(() => checklistQuery.data ?? [], [checklistQuery.data]);

  useEffect(() => {
    if (!editing) setDraft(items.map((item) => ({ ...item })));
  }, [editing, items]);

  const saveMutation = useMutation({
    mutationFn: () =>
      saveDailyClosingChecklistItems(
        draft.map((item, index) => ({
          id: item.id,
          phase: item.phase,
          label: item.label,
          sortOrder: index,
          isRequired: item.is_required,
          isOpeningGate: item.is_opening_gate,
        })),
      ),
    onSuccess: async () => {
      toast.success("체크리스트 변경사항을 저장했습니다.");
      setEditing(false);
      await checklistQuery.refetch();
    },
    onError: () =>
      toast.error("체크리스트 저장에 실패했습니다. SQL을 확인해 주세요."),
  });

  if (checklistQuery.isPending) {
    return <Loading size="sm" text="체크리스트를 불러오는 중..." />;
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-gray-900">현재 체크리스트</h2>
            <p className="mt-1 text-xs text-gray-500">
              변경 이후 작성하는 마감보고서에 적용되는 항목입니다.
            </p>
          </div>
          <Button
            size="sm"
            variant="gray"
            onClick={() => {
              setDraft(items.map((item) => ({ ...item })));
              setEditing(true);
            }}
          >
            수정
          </Button>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {(["opening", "closing"] as const).map((phase) => (
            <ChecklistPreview
              key={phase}
              title={phaseTitle[phase]}
              items={items.filter((item) => item.phase === phase)}
            />
          ))}
        </div>
      </section>

      {editing && (
        <ChecklistEditor
          items={draft}
          saving={saveMutation.isPending}
          onChange={setDraft}
          onCancel={() => setEditing(false)}
          onSave={() => saveMutation.mutate()}
        />
      )}
    </div>
  );
}

function ChecklistPreview({
  title,
  items,
}: {
  title: string;
  items: DailyClosingChecklistItem[];
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4">
      <h3 className="font-semibold text-gray-900">{title}</h3>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5"
          >
            <span className="h-4 w-4 shrink-0 rounded border border-gray-300" />
            <span className="text-sm text-gray-700">{item.label}</span>
            {item.is_required && (
              <span className="ml-auto rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-600">
                필수
              </span>
            )}
            {item.is_opening_gate && (
              <span
                className={`${item.is_required ? '' : 'ml-auto'} rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700`}
              >
                오픈
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ChecklistEditor({
  items,
  saving,
  onChange,
  onCancel,
  onSave,
}: {
  items: DailyClosingChecklistItem[];
  saving: boolean;
  onChange: (items: DailyClosingChecklistItem[]) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const updateItem = (
    id: string,
    values: Partial<DailyClosingChecklistItem>,
  ) =>
    onChange(
      items.map((item) => (item.id === id ? { ...item, ...values } : item)),
    );
  const removeItem = (id: string) =>
    onChange(items.filter((item) => item.id !== id));
  const addItem = (phase: DailyClosingChecklistPhase) =>
    onChange([
      ...items,
      {
        id: `draft-${phase}-${Date.now()}`,
        phase,
        label: "",
        sort_order: items.filter((item) => item.phase === phase).length,
        is_required: false,
        is_opening_gate: false,
      },
    ]);

  return (
    <section className="rounded-2xl border border-brand-200 bg-brand-50/30 p-4 shadow-sm sm:p-5">
      <div>
        <h2 className="font-bold text-gray-900">변경될 체크리스트</h2>
        <p className="mt-1 text-xs text-gray-500">
          저장 이후의 보고서부터 적용되며 기존 마감보고서는 유지됩니다.
        </p>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {(["opening", "closing"] as const).map((phase) => (
          <div key={phase} className="rounded-xl border border-gray-200 bg-white p-4">
            <h3 className="font-semibold text-gray-900">{phaseTitle[phase]}</h3>
            <div className="mt-3 space-y-2">
              {items
                .filter((item) => item.phase === phase)
                .map((item) => (
                  <div key={item.id} className="flex items-center gap-2">
                    <input
                      value={item.label}
                      onChange={(event) =>
                        updateItem(item.id, { label: event.target.value })
                      }
                      placeholder="체크 항목 입력"
                      className="h-10 min-w-0 flex-1 rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                    />
                    <label className="flex h-10 shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-gray-200 px-2 text-xs font-semibold text-gray-600">
                      <input
                        type="checkbox"
                        checked={item.is_required}
                        onChange={(event) =>
                          updateItem(item.id, {
                            is_required: event.target.checked,
                          })
                        }
                        className="cursor-pointer accent-brand-500"
                      />
                      필수
                    </label>
                    {phase === "opening" && (
                      <label className="flex h-10 shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50/50 px-2 text-xs font-semibold text-emerald-700">
                        <input
                          type="checkbox"
                          checked={item.is_opening_gate}
                          onChange={(event) =>
                            updateItem(item.id, {
                              is_opening_gate: event.target.checked,
                            })
                          }
                          className="cursor-pointer accent-emerald-600"
                        />
                        오픈
                      </label>
                    )}
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="h-10 shrink-0 cursor-pointer rounded-lg border border-rose-200 px-3 text-sm font-semibold text-rose-600 hover:bg-rose-50"
                    >
                      삭제
                    </button>
                  </div>
                ))}
            </div>
            <button
              type="button"
              onClick={() => addItem(phase)}
              className="mt-3 h-10 w-full cursor-pointer rounded-lg border border-dashed border-brand-300 text-sm font-semibold text-brand-600 hover:bg-brand-50"
            >
              항목 추가
            </button>
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="gray" onClick={onCancel}>
          취소
        </Button>
        <Button
          onClick={onSave}
          disabled={saving || !items.some((item) => item.label.trim())}
        >
          {saving ? "저장 중..." : "변경사항 저장"}
        </Button>
      </div>
    </section>
  );
}
