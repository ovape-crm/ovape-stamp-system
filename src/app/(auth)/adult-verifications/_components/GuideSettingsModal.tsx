"use client";

import { useEffect, useState } from "react";
import Button from "@/app/_components/Button";

type Props = {
  initialSteps: string[];
  isSaving: boolean;
  onClose: () => void;
  onSave: (steps: string[]) => Promise<void>;
};

export default function GuideSettingsModal({ initialSteps, isSaving, onClose, onSave }: Props) {
  const [steps, setSteps] = useState(initialSteps);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSaving) onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [isSaving, onClose]);

  const updateStep = (index: number, value: string) => {
    setSteps((current) => current.map((step, stepIndex) => (stepIndex === index ? value : step)));
  };

  const removeStep = (index: number) => {
    setSteps((current) => current.filter((_, stepIndex) => stepIndex !== index));
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-gray-950/55 p-4 backdrop-blur-sm"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !isSaving) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-settings-title"
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/60 bg-white shadow-2xl"
      >
        <header className="border-b border-gray-100 px-5 py-5 sm:px-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="guide-settings-title" className="text-lg font-semibold text-gray-900">성인인증 설명 관리</h2>
              <p className="mt-1 text-sm text-gray-500">표시할 내용을 순서대로 입력하세요.</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              aria-label="닫기"
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-xl text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              ×
            </button>
          </div>
        </header>

        <div className="overflow-y-auto p-5 sm:p-7">
          <div className="space-y-3">
            {steps.map((step, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
                  {index + 1}
                </span>
                <textarea
                  value={step}
                  maxLength={200}
                  rows={2}
                  onChange={(event) => updateStep(index, event.target.value)}
                  placeholder={`${index + 1}번 설명을 입력하세요`}
                  className="min-h-20 w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium leading-6 text-gray-900 shadow-sm outline-none transition placeholder:font-normal placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
                <Button size="sm" variant="danger" onClick={() => removeStep(index)} disabled={isSaving}>
                  삭제
                </Button>
              </div>
            ))}
          </div>

          <Button
            size="sm"
            variant="gray"
            className="mt-4 w-full"
            onClick={() => setSteps((current) => [...current, ""])}
            disabled={isSaving}
          >
            설명 추가
          </Button>
        </div>

        <footer className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50 px-5 py-4 sm:px-7">
          <Button variant="gray" onClick={onClose} disabled={isSaving}>취소</Button>
          <Button
            onClick={() => void onSave(steps.map((step) => step.trim()).filter(Boolean))}
            disabled={isSaving || steps.every((step) => !step.trim())}
          >
            {isSaving ? "저장 중..." : "설정 저장"}
          </Button>
        </footer>
      </section>
    </div>
  );
}
