"use client";

import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import Button from "@/app/_components/Button";

export type InventoryShortage = {
  item_name: string;
  current_quantity: number;
  requested_quantity: number;
  resulting_quantity: number;
};

function InventoryShortageConfirmDialog({
  shortages,
  onResolve,
}: {
  shortages: InventoryShortage[];
  onResolve: (confirmed: boolean) => void;
}) {
  const [isClosing, setIsClosing] = useState(false);

  const resolve = (confirmed: boolean) => {
    if (isClosing) return;
    setIsClosing(true);
    onResolve(confirmed);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") resolve(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <div
      className="fixed inset-0 z-[3000] flex items-center justify-center bg-gray-950/60 p-4 backdrop-blur-sm"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) resolve(false);
      }}
    >
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="inventory-shortage-title"
        aria-describedby="inventory-shortage-description"
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/70 bg-white shadow-2xl"
      >
        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v4m0 4h.01M10.3 3.7 2.8 17a2 2 0 0 0 1.74 3h14.92a2 2 0 0 0 1.74-3L13.7 3.7a2 2 0 0 0-3.4 0Z" />
              </svg>
            </span>
            <div className="min-w-0">
              <h2 id="inventory-shortage-title" className="text-lg font-bold text-gray-950">
                재고가 부족한 품목이 있습니다
              </h2>
              <p id="inventory-shortage-description" className="mt-1 text-sm leading-6 text-gray-600">
                계속하면 재고가 마이너스로 처리됩니다. 수량을 확인해 주세요.
              </p>
            </div>
          </div>

          <div className="mt-5 max-h-64 space-y-2 overflow-y-auto pr-1">
            {shortages.map((shortage) => (
              <div key={shortage.item_name} className="rounded-xl border border-gray-200 bg-gray-50/70 p-3.5">
                <p className="truncate text-sm font-semibold text-gray-900" title={shortage.item_name}>
                  {shortage.item_name}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-md bg-white px-2 py-1 font-medium text-gray-600 ring-1 ring-gray-200">
                    현재 {shortage.current_quantity.toLocaleString()}개
                  </span>
                  <span className="text-gray-400">→</span>
                  <span className="rounded-md bg-white px-2 py-1 font-medium text-gray-600 ring-1 ring-gray-200">
                    출고 {shortage.requested_quantity.toLocaleString()}개
                  </span>
                  <span className="text-gray-400">→</span>
                  <span className="rounded-md bg-rose-100 px-2 py-1 font-bold text-rose-700">
                    처리 후 {shortage.resulting_quantity.toLocaleString()}개
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-gray-100 bg-gray-50 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <Button variant="gray" onClick={() => resolve(false)} disabled={isClosing} className="sm:min-w-24">
            취소
          </Button>
          <Button variant="danger" onClick={() => resolve(true)} disabled={isClosing} className="sm:min-w-32">
            출고 진행
          </Button>
        </footer>
      </section>
    </div>
  );
}

export const confirmInventoryShortage = (shortages: InventoryShortage[]) =>
  new Promise<boolean>((resolve) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    const finish = (confirmed: boolean) => {
      window.setTimeout(() => {
        root.unmount();
        container.remove();
        resolve(confirmed);
      }, 0);
    };

    root.render(
      <InventoryShortageConfirmDialog shortages={shortages} onResolve={finish} />,
    );
  });
