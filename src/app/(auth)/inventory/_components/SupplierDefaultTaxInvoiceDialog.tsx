"use client";

import { useEffect } from "react";
import Button from "@/app/_components/Button";

export default function SupplierDefaultTaxInvoiceDialog({
  savedStatus,
  onLoad,
  onChooseManually,
}: {
  savedStatus: string;
  onLoad: () => void;
  onChooseManually: () => void;
}) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onChooseManually();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onChooseManually]);

  return (
    <div
      className="fixed inset-0 z-[3000] flex items-center justify-center bg-gray-950/60 p-4 backdrop-blur-sm"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onChooseManually();
      }}
    >
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="supplier-default-tax-title"
        aria-describedby="supplier-default-tax-description"
        className="w-full max-w-md overflow-hidden rounded-2xl border border-white/70 bg-white shadow-2xl"
      >
        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.6a2 2 0 0 1 1.4.6L18.4 8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2Z" />
              </svg>
            </span>
            <div className="min-w-0">
              <h2 id="supplier-default-tax-title" className="text-lg font-bold text-gray-950">
                저장된 발행 종류가 있습니다
              </h2>
              <p id="supplier-default-tax-description" className="mt-1 text-sm leading-6 text-gray-600">
                이 거래처에 저장된 발행 종류를 적용할까요?
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50/70 p-4">
            <p className="text-xs font-medium text-gray-500">저장된 발행 종류</p>
            <p className="mt-1 text-base font-bold text-brand-700">{savedStatus}</p>
          </div>

          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
            A/S 입고나 스티커 처리는 직접 선택 후 발행 종류를 <strong>X</strong>로 지정해 주세요.
          </div>
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-gray-100 bg-gray-50 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <Button variant="gray" onClick={onChooseManually} className="sm:min-w-24">
            직접 선택
          </Button>
          <Button onClick={onLoad} className="sm:min-w-24">
            불러오기
          </Button>
        </footer>
      </section>
    </div>
  );
}
