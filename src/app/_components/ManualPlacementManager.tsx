"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import Button from "@/app/_components/Button";
import Loading from "@/app/_components/Loading";
import ManualHelpButton from "@/app/_components/ManualHelpButton";
import { useUser } from "@/app/_contexts/UserContext";
import { hasAdminAccess } from "@/app/_domains/_user/_utils/userRole";
import { manualHelpKeys } from "@/app/_domains/_manual/_queryKeys/manualHelpKeys";
import {
  deleteManualHelpBinding,
  getPageManualHelpBindings,
  ManualHelpDisplayMode,
  ManualHelpAnchor,
  ManualHelpPosition,
  PageManualHelpBinding,
  savePlacedManualHelpBinding,
  searchManualHelpOptions,
} from "@/app/_domains/_manual/_services/manualHelpService";

type PlacementTarget = {
  selector: string;
  label: string;
};

type HelpMount = {
  binding: PageManualHelpBinding;
  element: HTMLSpanElement;
};

const escapeSelector = (value: string) => CSS.escape(value);

const normalizeElementText = (value: string) =>
  value.trim().replace(/\s+/g, " ").slice(0, 120);

const resolveTargetElement = (selector: string) => {
  if (selector.startsWith("manual-text:")) {
    const [, tagName, encodedText] = selector.split(":", 3);
    const expectedText = decodeURIComponent(encodedText ?? "");
    const matches = Array.from(document.querySelectorAll<HTMLElement>(tagName)).filter(
      (element) => normalizeElementText(element.innerText) === expectedText,
    );
    return matches.length === 1 ? matches[0] : null;
  }
  try {
    return document.querySelector<HTMLElement>(selector);
  } catch {
    return null;
  }
};

const getElementSelector = (element: HTMLElement) => {
  if (element.id) return `#${escapeSelector(element.id)}`;

  const stableAttributes = ["data-manual-key", "data-testid", "name", "aria-label"];
  for (const attribute of stableAttributes) {
    const value = element.getAttribute(attribute);
    if (value) {
      const selector = `${element.tagName.toLowerCase()}[${attribute}="${escapeSelector(value)}"]`;
      if (document.querySelectorAll(selector).length === 1) return selector;
    }
  }

  const tagName = element.tagName.toLowerCase();
  const text = normalizeElementText(element.innerText);
  if (text) {
    const matchingTextElements = Array.from(
      document.querySelectorAll<HTMLElement>(tagName),
    ).filter((candidate) => normalizeElementText(candidate.innerText) === text);
    if (matchingTextElements.length === 1) {
      return `manual-text:${tagName}:${encodeURIComponent(text)}`;
    }
  }

  // 공용 모달처럼 같은 문구의 컨트롤이 반복되는 화면에서는 모달 루트를
  // 기준으로 한 구조 경로를 사용한다. 클래스명 대신 태그 순서만 사용해
  // 스타일 변경에는 영향을 받지 않도록 한다.
  const modalRoot = element.closest<HTMLElement>("#modal-root");
  if (modalRoot) {
    const segments: string[] = [];
    let current: HTMLElement | null = element;
    while (current && current !== modalRoot) {
      const parent: HTMLElement | null = current.parentElement;
      if (!parent) break;
      const tagName = current.tagName.toLowerCase();
      const sameTagSiblings = Array.from(parent.children).filter(
        (sibling) => sibling.tagName === current?.tagName,
      );
      const index = sameTagSiblings.indexOf(current) + 1;
      segments.unshift(
        sameTagSiblings.length > 1 ? `${tagName}:nth-of-type(${index})` : tagName,
      );
      current = parent;
    }
    if (current === modalRoot && segments.length) {
      const selector = `#modal-root > ${segments.join(" > ")}`;
      if (document.querySelectorAll(selector).length === 1) return selector;
    }
  }

  return null;
};

const getPlacementElement = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return null;
  if (target.closest("[data-manual-placement-ui]")) return null;
  return (
    target.closest<HTMLElement>(
      "button, a, input, select, textarea, summary, label, [role='button']",
    ) ?? target
  );
};

const getTargetLabel = (element: HTMLElement) =>
  element.getAttribute("aria-label")?.trim() ||
  element.getAttribute("placeholder")?.trim() ||
  element.innerText?.trim().replace(/\s+/g, " ").slice(0, 60) ||
  element.getAttribute("name") ||
  element.tagName.toLowerCase();

const ManualPlacementManager = () => {
  const pathname = usePathname();
  const bindingPagePath = pathname === "/manuals/placement-settings"
    ? "common:outbound-modal"
    : pathname;
  const queryClient = useQueryClient();
  const { user } = useUser();
  const isAdmin = hasAdminAccess(user?.oss_role);
  const [isPlacementMode, setIsPlacementMode] = useState(false);
  const [target, setTarget] = useState<PlacementTarget | null>(null);
  const [keyword, setKeyword] = useState("");
  const [selectedManualId, setSelectedManualId] = useState("");
  const [displayMode, setDisplayMode] =
    useState<ManualHelpDisplayMode>("help_button");
  const [position, setPosition] =
    useState<ManualHelpPosition>("inside_right");
  const [anchor, setAnchor] = useState<ManualHelpAnchor>("middle_right");
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [buttonSize, setButtonSize] = useState(24);
  const [isSaving, setIsSaving] = useState(false);
  const [mounts, setMounts] = useState<HelpMount[]>([]);
  const mountMapRef = useRef(new Map<string, HTMLSpanElement>());
  const highlightedRef = useRef<HTMLElement | null>(null);
  const deferredKeyword = useDeferredValue(keyword);

  const pageBindingsQuery = useQuery({
    queryKey: manualHelpKeys.page(bindingPagePath),
    queryFn: () => getPageManualHelpBindings(bindingPagePath),
    retry: false,
  });
  const optionsQuery = useQuery({
    queryKey: manualHelpKeys.options(deferredKeyword.trim()),
    queryFn: () => searchManualHelpOptions(deferredKeyword),
    enabled: Boolean(target) && isAdmin,
  });
  const bindings = useMemo(
    () => pageBindingsQuery.data ?? [],
    [pageBindingsQuery.data],
  );
  const selectedBinding = target
    ? bindings.find((binding) => binding.targetSelector === target.selector)
    : undefined;

  useEffect(() => {
    const mountMap = mountMapRef.current;
    let positionFrame = 0;
    let syncFrame = 0;
    const findTarget = (binding: PageManualHelpBinding) =>
      resolveTargetElement(binding.targetSelector);
    const positionMounts = () => {
      for (const binding of bindings) {
        const mount = mountMap.get(binding.locationKey);
        const placementElement = findTarget(binding);
        if (!mount || !placementElement) continue;
        const rect = placementElement.getBoundingClientRect();
        mount.style.display = rect.width || rect.height ? "inline-flex" : "none";
        const [vertical, horizontal] = binding.anchor.split("_") as [
          "top" | "middle" | "bottom",
          "left" | "center" | "right",
        ];
        const anchorX = horizontal === "left" ? rect.left : horizontal === "center" ? rect.left + rect.width / 2 : rect.right;
        const anchorY = vertical === "top" ? rect.top : vertical === "middle" ? rect.top + rect.height / 2 : rect.bottom;
        const coordinates = {
          left: anchorX - binding.buttonSize / 2 + binding.offsetX,
          top: anchorY - binding.buttonSize / 2 + binding.offsetY,
        };
        mount.style.left = `${Math.max(4, Math.min(coordinates.left, window.innerWidth - 28))}px`;
        mount.style.top = `${Math.max(4, coordinates.top)}px`;
      }
    };
    const syncMounts = (forceStateUpdate = false) => {
      let mountsChanged = false;
      for (const [key, mount] of mountMap) {
        const binding = bindings.find((item) => item.locationKey === key);
        if (!mount.isConnected || !binding || !findTarget(binding)) {
          mount.remove();
          mountMap.delete(key);
          mountsChanged = true;
        }
      }
      for (const binding of bindings) {
        if (mountMap.has(binding.locationKey)) continue;
        const placementElement = findTarget(binding);
        if (!placementElement) continue;
        const mount = document.createElement("span");
        mount.dataset.manualPlacementUi = "true";
        mount.className = "fixed z-[2050] inline-flex";
        document.body.appendChild(mount);
        mountMap.set(binding.locationKey, mount);
        mountsChanged = true;
      }
      positionMounts();
      if (mountsChanged || forceStateUpdate) {
        setMounts(
          bindings.flatMap((binding) => {
            const element = mountMap.get(binding.locationKey);
            return element ? [{ binding, element }] : [];
          }),
        );
      }
    };
    const schedulePosition = () => {
      if (positionFrame) return;
      positionFrame = window.requestAnimationFrame(() => {
        positionFrame = 0;
        positionMounts();
      });
    };
    const scheduleSync = () => {
      if (syncFrame) return;
      syncFrame = window.requestAnimationFrame(() => {
        syncFrame = 0;
        syncMounts();
      });
    };

    syncMounts(true);
    const observer = new MutationObserver(scheduleSync);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", schedulePosition);
    window.addEventListener("scroll", schedulePosition, true);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(positionFrame);
      window.cancelAnimationFrame(syncFrame);
      window.removeEventListener("resize", schedulePosition);
      window.removeEventListener("scroll", schedulePosition, true);
    };
  }, [bindings]);

  useEffect(() => {
    if (!bindings.length || isPlacementMode) return;
    const handleDirectOpen = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) return;
      const eventTarget = event.target;
      const binding = bindings.find((item) => {
        if (item.displayMode !== "direct_with_help") return false;
        try {
          return resolveTargetElement(item.targetSelector)?.contains(eventTarget);
        } catch {
          return false;
        }
      });
      if (!binding) return;
      event.preventDefault();
      event.stopPropagation();
      mountMapRef.current
        .get(binding.locationKey)
        ?.querySelector<HTMLButtonElement>("button")
        ?.click();
    };
    document.addEventListener("click", handleDirectOpen, true);
    return () => document.removeEventListener("click", handleDirectOpen, true);
  }, [bindings, isPlacementMode]);

  useEffect(() => {
    if (!isPlacementMode) return;
    const clearHighlight = () => {
      if (!highlightedRef.current) return;
      highlightedRef.current.style.outline = "";
      highlightedRef.current.style.outlineOffset = "";
      highlightedRef.current = null;
    };
    const handleMove = (event: MouseEvent) => {
      const element = getPlacementElement(event.target);
      if (element === highlightedRef.current) return;
      clearHighlight();
      if (!element || element === document.body) return;
      element.style.outline = "2px solid rgb(236 72 153)";
      element.style.outlineOffset = "2px";
      highlightedRef.current = element;
    };
    const handleSelect = (event: MouseEvent) => {
      const element = getPlacementElement(event.target);
      if (!element || element === document.body) return;
      event.preventDefault();
      event.stopPropagation();
      const selector = getElementSelector(element);
      if (!selector) {
        toast.error("이 요소는 위치를 안정적으로 식별할 수 없습니다.");
        clearHighlight();
        return;
      }
      const nextTarget = {
        selector,
        label: getTargetLabel(element),
      };
      const existing = bindings.find(
        (binding) => binding.targetSelector === nextTarget.selector,
      );
      setTarget(nextTarget);
      setSelectedManualId(existing?.manualId ?? "");
      setDisplayMode(existing?.displayMode ?? "help_button");
      setPosition(existing?.position ?? "inside_right");
      setAnchor(existing?.anchor ?? "middle_right");
      setOffsetX(existing?.offsetX ?? 0);
      setOffsetY(existing?.offsetY ?? 0);
      setButtonSize(existing?.buttonSize ?? 24);
      setKeyword("");
      clearHighlight();
    };
    document.addEventListener("mousemove", handleMove, true);
    document.addEventListener("click", handleSelect, true);
    return () => {
      clearHighlight();
      document.removeEventListener("mousemove", handleMove, true);
      document.removeEventListener("click", handleSelect, true);
    };
  }, [bindings, isPlacementMode]);

  useEffect(() => {
    setIsPlacementMode(false);
    setTarget(null);
  }, [pathname]);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: manualHelpKeys.page(bindingPagePath) });

  const handleSave = async () => {
    if (!target || !selectedManualId) return;
    try {
      setIsSaving(true);
      await savePlacedManualHelpBinding({
        locationKey: selectedBinding?.locationKey ?? `${bindingPagePath}::${target.selector}`,
        manualId: selectedManualId,
        pagePath: selectedBinding?.pagePath ?? bindingPagePath,
        targetSelector: target.selector,
        targetLabel: target.label,
        displayMode,
        position,
        anchor,
        offsetX,
        offsetY,
        buttonSize,
      });
      await refresh();
      setTarget(null);
      toast.success("매뉴얼을 배치했습니다.");
    } catch (error) {
      console.error("Failed to place manual:", error);
      const message = error instanceof Error
        ? error.message
        : error && typeof error === "object" && "message" in error
          ? String(error.message)
          : "알 수 없는 오류";
      toast.error(`매뉴얼을 배치하지 못했습니다: ${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedBinding) return;
    try {
      setIsSaving(true);
      await deleteManualHelpBinding(selectedBinding.locationKey);
      await refresh();
      setTarget(null);
      toast.success("매뉴얼 배치를 삭제했습니다.");
    } catch (error) {
      console.error("Failed to delete placed manual:", error);
      toast.error("매뉴얼 배치를 삭제하지 못했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  const applyPositionPreset = (nextPosition: ManualHelpPosition) => {
    setPosition(nextPosition);
    const presets: Record<ManualHelpPosition, { anchor: ManualHelpAnchor; x: number; y: number }> = {
      inside_right: { anchor: "middle_right", x: -16, y: 0 },
      outside_right: { anchor: "middle_right", x: 16, y: 0 },
      outside_left: { anchor: "middle_left", x: -16, y: 0 },
      top_right: { anchor: "top_right", x: 0, y: -12 },
    };
    const preset = presets[nextPosition];
    setAnchor(preset.anchor);
    setOffsetX(preset.x);
    setOffsetY(preset.y);
  };

  return (
    <>
      {mounts.map(({ binding, element }) =>
        createPortal(
          <ManualHelpButton
            locationKey={binding.locationKey}
            ariaLabel={`${binding.targetLabel} 매뉴얼 보기`}
            buttonSize={binding.buttonSize}
            onPlacementEdit={
              isPlacementMode
                ? () => {
                    setTarget({
                      selector: binding.targetSelector,
                      label: binding.targetLabel,
                    });
                    setSelectedManualId(binding.manualId);
                    setDisplayMode(binding.displayMode);
                    setPosition(binding.position);
                    setAnchor(binding.anchor);
                    setOffsetX(binding.offsetX);
                    setOffsetY(binding.offsetY);
                    setButtonSize(binding.buttonSize);
                    setKeyword("");
                  }
                : undefined
            }
          />,
          element,
          binding.locationKey,
        ),
      )}

      {isAdmin && (
        <div
          data-manual-placement-ui="true"
          className="fixed bottom-5 right-5 z-[2100] flex items-center gap-2"
        >
          {isPlacementMode && (
            <span className="rounded-full border border-brand-200 bg-white px-3 py-2 text-xs font-semibold text-brand-700 shadow-lg">
              매뉴얼을 연결할 요소를 선택하세요
            </span>
          )}
          <Button
            size="sm"
            variant={isPlacementMode ? "danger" : "primary"}
            className="rounded-full shadow-lg"
            onClick={() => {
              setTarget(null);
              setIsPlacementMode((current) => !current);
            }}
          >
            {isPlacementMode ? "배치 종료" : "매뉴얼 배치"}
          </Button>
        </div>
      )}

      {target &&
        createPortal(
          <div
            data-manual-placement-ui="true"
            className="fixed inset-0 z-[2300] flex items-center justify-center bg-black/50 p-4"
          >
            <section className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
              <header className="border-b border-gray-200 px-5 py-4">
                <h2 className="text-lg font-bold text-gray-950">
                  {selectedBinding ? "매뉴얼 배치 수정" : "매뉴얼 배치"}
                </h2>
                <p className="mt-1 truncate text-sm text-gray-500">
                  선택 요소: {target.label}
                </p>
              </header>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
                <div>
                  <p className="mb-2 text-sm font-semibold text-gray-700">표시 방식</p>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      ["help_button", "?로 열기"],
                      ["direct_with_help", "바로 열기 + ? 유지"],
                    ] as const).map(([value, label]) => (
                      <Button
                        key={value}
                        type="button"
                        size="sm"
                        variant={displayMode === value ? "primary" : "gray"}
                        onClick={() => setDisplayMode(value)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                  {displayMode === "direct_with_help" && (
                    <p className="mt-2 text-xs text-gray-500">
                      요소를 누르면 매뉴얼만 열리며, 원래 기능은 실행되지 않습니다.
                    </p>
                  )}
                </div>

                <div>
                  <p className="mb-2 text-sm font-semibold text-gray-700">버튼 위치</p>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      ["inside_right", "요소 안쪽 오른쪽"],
                      ["outside_right", "요소 바깥 오른쪽"],
                      ["outside_left", "요소 바깥 왼쪽"],
                      ["top_right", "요소 위쪽 오른쪽"],
                    ] as const).map(([value, label]) => (
                      <Button
                        key={value}
                        type="button"
                        size="sm"
                        variant={position === value ? "primary" : "gray"}
                        onClick={() => applyPositionPreset(value)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm font-semibold text-gray-700">정밀 위치</p>
                  <div className="mb-3 rounded-xl border border-gray-200 bg-[linear-gradient(45deg,#f9fafb_25%,transparent_25%),linear-gradient(-45deg,#f9fafb_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f9fafb_75%),linear-gradient(-45deg,transparent_75%,#f9fafb_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0px] p-5">
                    <p className="mb-3 text-center text-xs font-semibold text-gray-500">실시간 위치 예시</p>
                    <div className="relative mx-auto h-24 w-full max-w-[300px] rounded-xl border-2 border-dashed border-gray-300 bg-white shadow-sm">
                      <span className="absolute inset-0 flex items-center justify-center px-10 text-center text-xs font-medium text-gray-400">선택한 버튼 또는 입력칸</span>
                      {(() => {
                        const [vertical, horizontal] = anchor.split("_") as ["top" | "middle" | "bottom", "left" | "center" | "right"];
                        return (
                          <span
                            className="absolute z-10 flex items-center justify-center rounded-full border border-brand-200 bg-brand-50 font-extrabold leading-none text-brand-600 shadow-md ring-1 ring-white"
                            style={{
                              width: buttonSize,
                              height: buttonSize,
                              fontSize: Math.max(11, Math.round(buttonSize * 0.54)),
                              left: `calc(${horizontal === "left" ? "0%" : horizontal === "center" ? "50%" : "100%"} - ${buttonSize / 2}px + ${offsetX}px)`,
                              top: `calc(${vertical === "top" ? "0%" : vertical === "middle" ? "50%" : "100%"} - ${buttonSize / 2}px + ${offsetY}px)`,
                            }}
                          >?</span>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="grid grid-cols-[132px_1fr] gap-4 rounded-xl border border-gray-200 bg-gray-50/70 p-3">
                    <div className="grid grid-cols-3 gap-1" aria-label="매뉴얼 버튼 기준점">
                      {([
                        "top_left", "top_center", "top_right",
                        "middle_left", "middle_center", "middle_right",
                        "bottom_left", "bottom_center", "bottom_right",
                      ] as ManualHelpAnchor[]).map((value) => (
                        <button
                          key={value}
                          type="button"
                          aria-label={`${value} 기준점`}
                          onClick={() => setAnchor(value)}
                          className={`flex h-10 items-center justify-center rounded-lg border transition ${anchor === value ? "border-brand-500 bg-brand-500 text-white" : "border-gray-300 bg-white text-gray-500 hover:border-brand-300"}`}
                        >
                          <span className="h-2 w-2 rounded-full bg-current" />
                        </button>
                      ))}
                    </div>
                    <div className="space-y-3">
                      {([['X', offsetX, setOffsetX], ['Y', offsetY, setOffsetY]] as const).map(([label, value, setter]) => (
                        <label key={label} className="grid grid-cols-[20px_1fr_28px] items-center gap-2 text-sm text-gray-700">
                          <span className="font-semibold">{label}</span>
                          <input
                            type="range"
                            min={-100}
                            max={100}
                            step={1}
                            value={value}
                            onChange={(event) => setter(Number(event.target.value))}
                            className="w-full cursor-pointer accent-brand-500"
                          />
                          <input
                            type="number"
                            min={-500}
                            max={500}
                            value={value}
                            onChange={(event) => setter(Math.max(-500, Math.min(500, Number(event.target.value) || 0)))}
                            className="h-8 w-14 rounded-md border border-gray-300 bg-white px-1 text-center text-xs outline-none focus:border-brand-500"
                          />
                        </label>
                      ))}
                      <button type="button" onClick={() => { setOffsetX(0); setOffsetY(0); }} className="text-xs font-semibold text-brand-600 hover:text-brand-700">
                        미세 조정 초기화
                      </button>
                    </div>
                  </div>
                  <label className="mt-3 grid grid-cols-[64px_1fr_58px] items-center gap-2 rounded-xl border border-gray-200 bg-gray-50/70 p-3 text-sm text-gray-700">
                    <span className="font-semibold">? 크기</span>
                    <input type="range" min={16} max={48} step={1} value={buttonSize} onChange={(event) => setButtonSize(Number(event.target.value))} className="w-full cursor-pointer accent-brand-500" />
                    <span className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-center text-xs font-semibold">{buttonSize}px</span>
                  </label>
                  <p className="mt-2 text-xs text-gray-500">기준점을 선택한 뒤 X/Y 값을 1px 단위로 조절할 수 있습니다.</p>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-700">
                    연결할 매뉴얼
                  </label>
                  <input
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                    placeholder="매뉴얼 제목 검색"
                    className="mb-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-900 shadow-sm outline-none transition placeholder:font-normal placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  />
                  <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50/70 p-2">
                    {optionsQuery.isPending ? (
                      <Loading size="sm" text="매뉴얼 목록 불러오는 중..." />
                    ) : optionsQuery.data?.length ? (
                      optionsQuery.data.map((manual) => (
                        <button
                          key={manual.id}
                          type="button"
                          onClick={() => setSelectedManualId(manual.id)}
                          className={`w-full rounded-lg border p-3 text-left text-sm transition ${selectedManualId === manual.id ? "border-brand-400 bg-brand-50 text-brand-800" : "border-gray-200 bg-white text-gray-700 hover:border-brand-300"}`}
                        >
                          <span className="font-semibold">{manual.title}</span>
                        </button>
                      ))
                    ) : (
                      <p className="p-4 text-center text-sm text-gray-500">
                        검색된 매뉴얼이 없습니다.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <footer className="flex justify-between gap-2 border-t border-gray-200 px-5 py-4">
                <div>
                  {selectedBinding && (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => void handleDelete()}
                      disabled={isSaving}
                    >
                      배치 삭제
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="gray"
                    onClick={() => {
                      setTarget(null);
                      setIsPlacementMode(false);
                    }}
                    disabled={isSaving}
                  >
                    취소
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => void handleSave()}
                    disabled={!selectedManualId || isSaving}
                  >
                    {isSaving ? "저장 중..." : "저장"}
                  </Button>
                </div>
              </footer>
            </section>
          </div>,
          document.body,
        )}
    </>
  );
};

export default ManualPlacementManager;
