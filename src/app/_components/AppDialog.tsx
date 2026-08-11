"use client";

import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import Button from "@/app/_components/Button";

type DialogTone = "default" | "danger" | "warning";

type ConfirmDialogOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: DialogTone;
};
type PromptDialogOptions = ConfirmDialogOptions & {
  inputLabel?: string;
  placeholder?: string;
  initialValue?: string;
  required?: boolean;
};

type DialogProps = ConfirmDialogOptions & {
  mode: "confirm" | "prompt";
  inputLabel?: string;
  placeholder?: string;
  initialValue?: string;
  required?: boolean;
  onResolve: (result: boolean | string | null) => void;
};

function AppDialog({
  mode,
  title,
  description,
  confirmLabel = "확인",
  cancelLabel = "취소",
  tone = "default",
  inputLabel,
  placeholder,
  initialValue = "",
  required = false,
  onResolve,
}: DialogProps) {
  const [value, setValue] = useState(initialValue);
  const [isClosing, setIsClosing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const resolve = (result: boolean | string | null) => {
    if (isClosing) return;
    setIsClosing(true);
    onResolve(result);
  };

  const submit = () => {
    if (mode === "prompt") {
      const trimmedValue = value.trim();
      if (required && !trimmedValue) return;
      resolve(trimmedValue);
      return;
    }
    resolve(true);
  };

  useEffect(() => {
    if (mode === "prompt") inputRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") resolve(mode === "prompt" ? null : false);
      if (event.key === "Enter" && mode === "prompt") submit();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  });

  const iconClasses =
    tone === "danger"
      ? "bg-rose-100 text-rose-700"
      : tone === "warning"
        ? "bg-amber-100 text-amber-700"
        : "bg-brand-100 text-brand-700";

  return (
    <div
      className="fixed inset-0 z-[4000] flex items-center justify-center bg-gray-950/60 p-4 backdrop-blur-sm"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) resolve(mode === "prompt" ? null : false);
      }}
    >
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        aria-describedby={description ? "app-dialog-description" : undefined}
        className="w-full max-w-md overflow-hidden rounded-2xl border border-white/70 bg-white shadow-2xl"
      >
        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${iconClasses}`}>
              {tone === "danger" || tone === "warning" ? (
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v4m0 4h.01M10.3 3.7 2.8 17a2 2 0 0 0 1.74 3h14.92a2 2 0 0 0 1.74-3L13.7 3.7a2 2 0 0 0-3.4 0Z" />
                </svg>
              ) : (
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12.5 11 14.5 15.5 9.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              )}
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="app-dialog-title" className="text-lg font-bold text-gray-950">{title}</h2>
              {description && (
                <p id="app-dialog-description" className="mt-1 whitespace-pre-line text-sm leading-6 text-gray-600">
                  {description}
                </p>
              )}
            </div>
          </div>

          {mode === "prompt" && (
            <label className="mt-5 block">
              {inputLabel && <span className="mb-1.5 block text-sm font-semibold text-gray-700">{inputLabel}</span>}
              <input
                ref={inputRef}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder={placeholder}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-900 shadow-sm outline-none transition placeholder:font-normal placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </label>
          )}
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-gray-100 bg-gray-50 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <Button variant="gray" onClick={() => resolve(mode === "prompt" ? null : false)} disabled={isClosing} className="sm:min-w-24">
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            onClick={submit}
            disabled={isClosing || (mode === "prompt" && required && !value.trim())}
            className="sm:min-w-24"
          >
            {confirmLabel}
          </Button>
        </footer>
      </section>
    </div>
  );
}

const renderDialog = (props: Omit<DialogProps, "onResolve">) =>
  new Promise<boolean | string | null>((resolve) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const finish = (result: boolean | string | null) => {
      window.setTimeout(() => {
        root.unmount();
        container.remove();
        resolve(result);
      }, 0);
    };
    root.render(<AppDialog {...props} onResolve={finish} />);
  });

export const showConfirmDialog = async (options: ConfirmDialogOptions) =>
  Boolean(await renderDialog({ ...options, mode: "confirm" }));

export const showPromptDialog = async (options: PromptDialogOptions) => {
  const result = await renderDialog({ ...options, mode: "prompt" });
  return typeof result === "string" ? result : null;
};
