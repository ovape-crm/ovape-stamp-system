"use client";

import { useMemo, useState } from "react";
import Button from "@/app/_components/Button";
import { Dropdown, DropdownOption } from "@/app/_components/Dropdown";
import type { ItemCategoryType, ItemType } from "@/app/_domains/_item/_types/item.types";
import { updateItemsInBulk, type BulkItemUpdate } from "@/app/_domains/_item/_services/itemService";
import toast from "react-hot-toast";

type Props = {
  items: ItemType[];
  categories: ItemCategoryType[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

type Draft = BulkItemUpdate;
const targets = [
  { value: "all", label: "전체" },
  { value: "itemCode", label: "품목 코드" },
  { value: "itemName", label: "품목 명" },
  { value: "category", label: "품목 종류" },
  { value: "sellingPrice", label: "매출단가" },
  { value: "liquidType", label: "액상 종류" },
  { value: "liquidFlavor", label: "액상 맛" },
  { value: "note", label: "비고" },
  { value: "status", label: "사용 상태" },
];

const toDraft = (item: ItemType): Draft => ({
  id: item.id,
  categoryId: item.category_id ? String(item.category_id) : null,
  itemCode: item.item_code,
  itemName: item.item_name,
  sellingPrice: item.selling_price,
  liquidType: item.liquid_type ?? "",
  liquidFlavor: item.liquid_flavor ?? "",
  note: item.note ?? "",
  isUse: item.is_use,
});

export default function ItemBulkEditModal({ items, categories, onClose, onSaved }: Props) {
  const originals = useMemo(() => new Map(items.map((item) => [item.id, JSON.stringify(toDraft(item))])), [items]);
  const [drafts, setDrafts] = useState<Draft[]>(() => items.map(toDraft));
  const [target, setTarget] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const normalizedKeyword = keyword.trim().toLocaleLowerCase("ko-KR");
  const categoryNames = useMemo(() => new Map(categories.map((category) => [String(category.id), category.name])), [categories]);
  const changed = drafts.filter((draft) => originals.get(draft.id) !== JSON.stringify(draft));

  const visible = drafts.filter((draft) => {
    if (!normalizedKeyword) return true;
    const values: Record<string, string> = {
      itemCode: draft.itemCode,
      itemName: draft.itemName,
      category: categoryNames.get(draft.categoryId ?? "") ?? "선택 안 함",
      sellingPrice: draft.sellingPrice == null ? "" : String(draft.sellingPrice),
      liquidType: draft.liquidType,
      liquidFlavor: draft.liquidFlavor,
      note: draft.note,
      status: draft.isUse ? "사용" : "미사용",
    };
    const candidates = target === "all" ? Object.values(values) : [values[target] ?? ""];
    return candidates.some((value) => value.toLocaleLowerCase("ko-KR").includes(normalizedKeyword));
  });

  const patchDraft = (id: string, patch: Partial<Draft>) =>
    setDrafts((current) => current.map((draft) => draft.id === id ? { ...draft, ...patch } : draft));

  const requestSave = () => {
    if (!changed.length) return;
    if (changed.some((item) => !item.itemCode.trim() || !item.itemName.trim())) {
      toast.error("품목 코드와 품목 명은 비워둘 수 없습니다.");
      return;
    }
    setShowConfirm(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateItemsInBulk(changed);
      await onSaved();
      toast.success(`${changed.length}개 품목을 수정했습니다.`);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "일괄 수정에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "min-h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-xs text-gray-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

  return <div className="relative flex max-h-[82vh] min-h-0 flex-col" role="dialog" aria-modal="true" aria-labelledby="bulk-edit-title">
    <div className="flex items-start justify-between border-b border-gray-200 pb-3">
      <div><h2 id="bulk-edit-title" className="text-lg font-bold text-gray-900">품목 일괄 편집</h2><p className="mt-1 text-xs text-gray-500">기존 품목 ID를 유지한 채 변경된 품목만 한 번에 저장합니다.</p></div>
      <button type="button" onClick={onClose} className="min-h-11 min-w-11 rounded-lg text-2xl text-gray-400 hover:bg-gray-100">×</button>
    </div>
    <div className="my-3 rounded-xl border border-gray-200 bg-gray-50/70 p-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="w-full sm:w-40"><Dropdown controlledValue={target}><Dropdown.Trigger>{targets.find((option) => option.value === target)?.label}</Dropdown.Trigger><Dropdown.Content>{targets.map((option) => <Dropdown.Item key={option.value} option={option} onSelect={(selected: DropdownOption) => setTarget(String(selected.value))} />)}</Dropdown.Content></Dropdown></div>
        <div className="relative flex-1"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">⌕</span><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="변경할 품목을 검색하세요" className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-10 text-sm font-medium text-gray-900 shadow-sm outline-none transition placeholder:font-normal placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />{keyword && <button type="button" onClick={() => setKeyword("")} className="absolute right-2 top-1/2 min-h-8 min-w-8 -translate-y-1/2 rounded text-gray-400 hover:bg-gray-100">×</button>}</div>
      </div>
    </div>
    <div className="mb-3 flex items-center justify-start gap-3 text-xs text-gray-600 sm:text-sm"><span>검색 <b className="font-semibold text-brand-600">{visible.length}</b></span><span>변경 <b className="font-semibold text-brand-600">{changed.length}</b></span></div>
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
      {visible.length === 0 && <div className="rounded-xl border border-gray-200 bg-white py-12 text-center text-sm text-gray-500">검색 결과가 없습니다.</div>}
      {visible.map((draft) => {
        const isChanged = originals.get(draft.id) !== JSON.stringify(draft);
        const field = (label: string, control: React.ReactNode, className = "") => <label className={`min-w-0 space-y-1 ${className}`}><span className="block text-xs font-medium text-gray-600">{label}</span>{control}</label>;
        return <section key={draft.id} className={`rounded-xl border p-3 transition sm:p-4 ${isChanged ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-white"}`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3">
            <div className="min-w-0"><p className="truncate text-sm font-semibold text-gray-900">{draft.itemName || "이름 없는 품목"}</p><p className="mt-0.5 text-xs text-gray-500">{draft.itemCode || "코드 없음"}</p></div>
            <div className="flex items-center gap-2">
              {isChanged && <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">변경됨</span>}
              <button type="button" role="switch" aria-checked={draft.isUse} onClick={() => patchDraft(draft.id, { isUse: !draft.isUse })} className={`min-h-9 min-w-16 rounded-md px-2 text-xs font-medium ${draft.isUse ? "bg-brand-100 text-brand-700" : "bg-gray-100 text-gray-500"}`}>{draft.isUse ? "사용" : "미사용"}</button>
              <Button size="xs" variant="gray" disabled={!isChanged} onClick={() => patchDraft(draft.id, JSON.parse(originals.get(draft.id) ?? "{}"))}>되돌리기</Button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {field("품목 종류", <select value={draft.categoryId ?? ""} onChange={(event) => patchDraft(draft.id, { categoryId: event.target.value || null })} className={inputClass}><option value="">선택 안 함</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>)}
            {field("품목 코드", <input value={draft.itemCode} onChange={(event) => patchDraft(draft.id, { itemCode: event.target.value })} className={inputClass} />)}
            {field("품목 명", <input value={draft.itemName} onChange={(event) => patchDraft(draft.id, { itemName: event.target.value })} className={inputClass} />)}
            {field("매출단가", <input type="number" min="0" value={draft.sellingPrice ?? ""} onChange={(event) => patchDraft(draft.id, { sellingPrice: event.target.value === "" ? null : Number(event.target.value) })} className={inputClass} />)}
            {field("액상 종류", <input value={draft.liquidType} onChange={(event) => patchDraft(draft.id, { liquidType: event.target.value })} className={inputClass} />)}
            {field("액상 맛", <input value={draft.liquidFlavor} onChange={(event) => patchDraft(draft.id, { liquidFlavor: event.target.value })} className={inputClass} />)}
            {field("비고", <input value={draft.note} onChange={(event) => patchDraft(draft.id, { note: event.target.value })} className={inputClass} />, "sm:col-span-2")}
          </div>
        </section>;
      })}
    </div>
    <div className="flex justify-end gap-2 border-t border-gray-200 pt-3"><Button variant="gray" onClick={onClose}>취소</Button><Button onClick={requestSave} disabled={!changed.length || saving}>{`변경사항 저장 (${changed.length})`}</Button></div>
    {showConfirm && <div className="absolute inset-0 z-50 flex items-center justify-center rounded-xl bg-gray-950/45 p-3 sm:p-6">
      <div className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl" role="alertdialog" aria-modal="true" aria-labelledby="bulk-confirm-title">
        <div className="border-b border-gray-200 p-4">
          <h3 id="bulk-confirm-title" className="text-base font-bold text-gray-900">변경사항을 저장할까요?</h3>
          <p className="mt-1 text-xs text-gray-500">총 {changed.length}개 품목의 변경 전·후 내용을 확인해 주세요.</p>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-gray-50/70 p-4">
          {changed.map((draft) => {
            const before = JSON.parse(originals.get(draft.id) ?? "{}") as Draft;
            const rows: Array<{ label: string; before: string; after: string }> = [];
            const add = (label: string, oldValue: unknown, newValue: unknown) => {
              const oldText = oldValue == null || oldValue === "" ? "없음" : String(oldValue);
              const newText = newValue == null || newValue === "" ? "없음" : String(newValue);
              if (oldText !== newText) rows.push({ label, before: oldText, after: newText });
            };
            add("사용 상태", before.isUse ? "사용" : "미사용", draft.isUse ? "사용" : "미사용");
            add("품목 종류", categoryNames.get(before.categoryId ?? "") ?? "선택 안 함", categoryNames.get(draft.categoryId ?? "") ?? "선택 안 함");
            add("품목 코드", before.itemCode, draft.itemCode);
            add("품목 명", before.itemName, draft.itemName);
            add("매출단가", before.sellingPrice == null ? null : before.sellingPrice.toLocaleString(), draft.sellingPrice == null ? null : draft.sellingPrice.toLocaleString());
            add("액상 종류", before.liquidType, draft.liquidType);
            add("액상 맛", before.liquidFlavor, draft.liquidFlavor);
            add("비고", before.note, draft.note);
            return <section key={draft.id} className="rounded-xl border border-gray-200 bg-white p-3">
              <p className="mb-2 text-sm font-semibold text-gray-900">{before.itemName} <span className="font-normal text-gray-400">({before.itemCode})</span></p>
              <div className="space-y-2">{rows.map((row) => <div key={row.label} className="grid grid-cols-[80px_minmax(0,1fr)] gap-2 text-xs sm:grid-cols-[100px_minmax(0,1fr)]">
                <span className="font-medium text-gray-600">{row.label}</span>
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_20px_minmax(0,1fr)] items-center gap-1">
                  <span className="break-words rounded-md bg-gray-100 px-2 py-1.5 text-gray-600">{row.before}</span><span className="text-center text-gray-400">→</span><span className="break-words rounded-md bg-brand-50 px-2 py-1.5 font-medium text-brand-700">{row.after}</span>
                </div>
              </div>)}</div>
            </section>;
          })}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-200 p-4">
          <Button variant="gray" onClick={() => setShowConfirm(false)} disabled={saving}>아니오</Button>
          <Button onClick={save} disabled={saving}>{saving ? "저장 중..." : "예, 저장"}</Button>
        </div>
      </div>
    </div>}
  </div>;
}
