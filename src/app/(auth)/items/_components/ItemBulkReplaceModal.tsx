'use client';

import { useMemo, useState } from 'react';
import Button from '@/app/_components/Button';
import { ItemCategoryType, ItemType } from '@/app/_domains/_item/_types/item.types';
import { BulkItemRow, normalizeBulkItemName, replaceItemsInBulk } from '@/app/_domains/_item/_services/itemBulkService';
import toast from 'react-hot-toast';

type Props = { items: ItemType[]; categories: ItemCategoryType[]; onClose: () => void; onSaved: () => Promise<void> | void };
type Parsed = { rows: BulkItemRow[]; errors: string[] };

const aliases: Record<keyof BulkItemRow, string[]> = {
  itemName: ['품목명', 'item_name', 'itemname'], itemCode: ['품목코드', 'item_code', 'itemcode'],
  categoryName: ['품목종류', '종류', 'category_name', 'category'], purchasePrice: ['매입단가', '매입가', 'purchase_price'],
  sellingPrice: ['매출단가', '판매가', 'selling_price'], liquidType: ['액상종류', 'liquid_type'],
  liquidFlavor: ['액상맛', 'liquid_flavor'], note: ['비고', 'note'],
};
const cleanHeader = (value: string) => value.replace(/^\uFEFF/, '').trim().toLocaleLowerCase('ko-KR').replaceAll(' ', '');

const parseCsvRows = (text: string): string[][] => {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i += 1; } else quoted = !quoted; }
    else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && text[i + 1] === '\n') i += 1; row.push(cell); if (row.some((value) => value.trim())) rows.push(row); row = []; cell = ''; }
    else cell += char;
  }
  row.push(cell); if (row.some((value) => value.trim())) rows.push(row);
  if (quoted) throw new Error('따옴표가 닫히지 않은 CSV입니다.');
  return rows;
};

const parsePrice = (value: string, rowNumber: number, label: string, errors: string[]) => {
  const cleaned = value.replaceAll(',', '').trim();
  if (!cleaned) return null;
  const number = Number(cleaned);
  if (!Number.isSafeInteger(number) || number < 0 || number > 2147483647) errors.push(`${rowNumber}행: ${label}는 0~2,147,483,647 범위의 정수여야 합니다.`);
  return Number.isSafeInteger(number) && number >= 0 && number <= 2147483647 ? number : null;
};

const parseItems = (text: string, categories: ItemCategoryType[]): Parsed => {
  const errors: string[] = []; let matrix: string[][];
  try { matrix = parseCsvRows(text); } catch (error) { return { rows: [], errors: [(error as Error).message] }; }
  if (matrix.length < 2) return { rows: [], errors: ['헤더와 품목 데이터가 필요합니다.'] };
  const headers = matrix[0].map(cleanHeader);
  const index = (key: keyof BulkItemRow) => headers.findIndex((header) => aliases[key].map(cleanHeader).includes(header));
  const indexes = Object.fromEntries((Object.keys(aliases) as (keyof BulkItemRow)[]).map((key) => [key, index(key)])) as Record<keyof BulkItemRow, number>;
  if (indexes.itemName < 0 || indexes.itemCode < 0) return { rows: [], errors: ['품목명과 품목코드 헤더는 필수입니다.'] };
  const categoryNames = new Set(categories.map((category) => category.name.trim()));
  const rows = matrix.slice(1).map((values, offset) => {
    const get = (key: keyof BulkItemRow) => indexes[key] < 0 ? '' : (values[indexes[key]] ?? '').trim();
    const rowNumber = offset + 2; const itemName = normalizeBulkItemName(get('itemName')); const itemCode = get('itemCode'); const categoryName = get('categoryName');
    if (!itemName) errors.push(`${rowNumber}행: 품목명이 없습니다.`); if (!itemCode) errors.push(`${rowNumber}행: 품목코드가 없습니다.`);
    if (categoryName && !categoryNames.has(categoryName)) errors.push(`${rowNumber}행: 등록되지 않은 품목 종류 '${categoryName}'입니다.`);
    return { itemName, itemCode, categoryName, purchasePrice: parsePrice(get('purchasePrice'), rowNumber, '매입단가', errors), sellingPrice: parsePrice(get('sellingPrice'), rowNumber, '매출단가', errors), liquidType: get('liquidType'), liquidFlavor: get('liquidFlavor'), note: get('note') };
  });
  const names = new Set<string>();
  rows.forEach((row) => { if (names.has(row.itemName)) errors.push(`중복 품목명: ${row.itemName}`); names.add(row.itemName); });
  return { rows, errors: [...new Set(errors)] };
};

const compact = (value: string) => value.normalize('NFC').toLocaleLowerCase('ko-KR').replace(/[\s\p{P}\p{S}]/gu, '');
const distance = (a: string, b: string) => { const previous = Array.from({ length: b.length + 1 }, (_, i) => i); for (let i = 1; i <= a.length; i += 1) { let diagonal = previous[0]; previous[0] = i; for (let j = 1; j <= b.length; j += 1) { const saved = previous[j]; previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)); diagonal = saved; } } return previous[b.length]; };
const similarName = (name: string, existing: string) => { const a = compact(name); const b = compact(existing); if (!a || !b || a === b) return a === b && normalizeBulkItemName(name) !== normalizeBulkItemName(existing); const limit = Math.max(1, Math.floor(Math.max(a.length, b.length) * 0.15)); return Math.abs(a.length - b.length) <= limit && distance(a, b) <= limit; };

const csvEscape = (value: unknown) => { const text = value == null ? '' : String(value); return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };

export default function ItemBulkReplaceModal({ items, categories, onClose, onSaved }: Props) {
  const [text, setText] = useState(''); const [parsed, setParsed] = useState<Parsed | null>(null); const [choices, setChoices] = useState<Record<number, string>>({}); const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const previewRows = useMemo(() => parsed?.rows.map((row, index) => ({ ...row, itemName: choices[index] || row.itemName })) ?? [], [parsed, choices]);
  const existingNames = useMemo(() => new Set(items.map((item) => normalizeBulkItemName(item.item_name))), [items]);
  const similarities = useMemo(() => (parsed?.rows ?? []).map((row, index) => ({ index, row, candidates: items.filter((item) => !existingNames.has(row.itemName) && similarName(row.itemName, item.item_name)).slice(0, 3) })).filter((match) => match.candidates.length), [parsed, items, existingNames]);
  const unresolved = similarities.filter(({ index }) => choices[index] === undefined);
  const missing = items.filter((item) => item.is_use && !new Set(previewRows.map((row) => row.itemName)).has(normalizeBulkItemName(item.item_name)));
  const newCount = previewRows.filter((row) => !existingNames.has(row.itemName)).length;

  const exportCurrent = () => {
    const header = ['품목코드','품목명','품목종류','매입단가','매출단가','액상종류','액상맛','비고'];
    const body = items.filter((item) => item.is_use).map((item) => [item.item_code,item.item_name,item.item_categories?.name ?? '',item.purchase_price ?? '',item.selling_price ?? '',item.liquid_type ?? '',item.liquid_flavor ?? '',item.note ?? '']);
    const blob = new Blob(['\uFEFF' + [header, ...body].map((row) => row.map(csvEscape).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `품목_${new Date().toISOString().slice(0,10)}.csv`; anchor.click(); URL.revokeObjectURL(url);
  };
  const analyze = () => { setChoices({}); setError(''); setParsed(parseItems(text, categories)); };
  const apply = async () => {
    if (!parsed || parsed.errors.length || unresolved.length) return;
    const finalNames = previewRows.map((row) => row.itemName);
    if (new Set(finalNames).size !== finalNames.length) { setError('유사 품목 선택 결과 품목명이 중복되었습니다.'); return; }
    setSaving(true); setError('');
    try { const result = await replaceItemsInBulk(previewRows); await onSaved(); toast.success(`신규 ${result.inserted}개 · 갱신 ${result.updated}개 · 미사용 ${result.deactivated}개`); onClose(); } catch (caught) { setError((caught as Error).message); } finally { setSaving(false); }
  };
  return <div className="flex min-h-0 flex-col" role="dialog" aria-modal="true" aria-labelledby="bulk-title">
    <div className="flex items-center justify-between border-b border-gray-200 pb-3"><div><h2 id="bulk-title" className="text-lg font-bold text-gray-900">품목 일괄 교체</h2><p className="mt-1 text-xs text-gray-500">CSV를 검토한 후 한 번에 안전하게 반영합니다.</p></div><button onClick={onClose} className="min-h-11 min-w-11 rounded-lg text-2xl text-gray-400 hover:bg-gray-100">×</button></div>
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4">
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><p className="font-semibold">CSV에서 사라진 품목은 삭제되지 않습니다.</p><p className="mt-1 leading-6">재고와 과거 이력을 보존하기 위해 미사용 처리됩니다. 같은 품목명으로 다시 등록하면 기존 재고가 자동으로 연결됩니다.</p></div>
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="gray" onClick={exportCurrent}>현재 품목 CSV 내려받기</Button><label className="inline-flex min-h-10 cursor-pointer items-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50">CSV 파일 선택<input type="file" accept=".csv,text/csv" className="hidden" onChange={async (event) => { const file=event.target.files?.[0]; if (file) { setText(await file.text()); setParsed(null); } event.target.value=''; }} /></label></div>
      <textarea value={text} onChange={(event) => { setText(event.target.value); setParsed(null); }} placeholder="CSV 내용을 붙여넣거나 파일을 선택하세요." className="h-36 w-full resize-y rounded-xl border border-gray-300 p-3 font-mono text-xs outline-none focus:border-brand-400" />
      <div className="flex justify-end"><Button size="sm" onClick={analyze} disabled={!text.trim()}>미리보기</Button></div>
      {parsed && <>{parsed.errors.length > 0 ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"><p className="font-semibold">수정이 필요한 항목 {parsed.errors.length}개</p><ul className="mt-2 list-disc space-y-1 pl-5">{parsed.errors.slice(0,20).map((message) => <li key={message}>{message}</li>)}</ul></div> : <>
        <div className="grid grid-cols-3 gap-2 text-center text-sm"><div className="rounded-xl bg-gray-50 p-3"><b className="block text-lg">{previewRows.length}</b>전체</div><div className="rounded-xl bg-emerald-50 p-3 text-emerald-700"><b className="block text-lg">{newCount}</b>신규</div><div className="rounded-xl bg-amber-50 p-3 text-amber-700"><b className="block text-lg">{missing.length}</b>미사용 전환</div></div>
        {similarities.length > 0 && <section className="rounded-xl border border-amber-200 p-4"><h3 className="font-semibold text-gray-900">비슷한 품목명을 확인해 주세요</h3><p className="mt-1 text-xs text-gray-500">자동으로 합치지 않습니다. 같은 품목이면 기존 이름을 선택하고, 다른 품목이면 새 품목 등록을 선택하세요.</p><div className="mt-3 space-y-3">{similarities.map(({ index, row, candidates }) => <div key={`${index}-${row.itemName}`} className="rounded-lg bg-amber-50 p-3"><p className="mb-2 text-sm font-medium">CSV: {row.itemName}</p><select value={choices[index] ?? ''} onChange={(event) => setChoices((current) => ({ ...current, [index]: event.target.value }))} className="min-h-11 w-full rounded-lg border border-amber-300 bg-white px-3 text-sm"><option value="">확인이 필요합니다</option>{candidates.map((item) => <option key={item.id} value={item.item_name}>기존 품목으로 처리: {item.item_name}</option>)}<option value={row.itemName}>새 품목으로 등록: {row.itemName}</option></select></div>)}</div></section>}
        {missing.length > 0 && <details className="rounded-xl border border-gray-200 p-4"><summary className="cursor-pointer font-semibold text-gray-800">CSV에서 사라진 품목 {missing.length}개 보기</summary><div className="mt-3 max-h-40 overflow-auto text-sm text-gray-600">{missing.map((item) => <p key={item.id} className="border-t border-gray-100 py-2 first:border-0">{item.item_name} <span className="text-gray-400">({item.item_code})</span></p>)}</div></details>}
      </>}</>}
      {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    </div>
    <div className="flex justify-end gap-2 border-t border-gray-200 pt-3"><Button variant="gray" onClick={onClose}>취소</Button><Button onClick={apply} disabled={!parsed || parsed.errors.length > 0 || unresolved.length > 0 || saving}>{saving ? '반영 중...' : '일괄 교체 적용'}</Button></div>
  </div>;
}
