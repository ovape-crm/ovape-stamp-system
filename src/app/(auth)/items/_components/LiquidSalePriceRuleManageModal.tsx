'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Button from '@/app/_components/Button';
import {
  deleteLiquidSalePriceRule,
  getLiquidSaleExtraBottlePrices,
  getLiquidSalePriceRules,
  liquidSaleExtraBottlePriceKey,
  liquidSalePriceRuleKey,
  saveLiquidSaleExtraBottlePrice,
  saveLiquidSalePriceRule,
} from '@/app/_domains/_item/_services/liquidSalePriceRuleService';

const inputClass = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100';

export default function LiquidSalePriceRuleManageModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: rules = [], isPending } = useQuery({ queryKey: liquidSalePriceRuleKey, queryFn: getLiquidSalePriceRules });
  const { data: extraPrices = [] } = useQuery({ queryKey: liquidSaleExtraBottlePriceKey, queryFn: getLiquidSaleExtraBottlePrices });
  const [breath, setBreath] = useState<'mtl' | 'dtl'>('mtl');
  const [event, setEvent] = useState(1);
  const [basic, setBasic] = useState(0);
  const [price, setPrice] = useState('');
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editingExtraKey, setEditingExtraKey] = useState<string | null>(null);
  const [extraDrafts, setExtraDrafts] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const saveRule = async () => {
    if (event + basic < 1 || !price) { toast.error('병 수와 판매금액을 입력하세요.'); return; }
    setIsSaving(true);
    try {
      await saveLiquidSalePriceRule({ id: editingRuleId ?? undefined, breath_type: breath, event_quantity: event, basic_quantity: basic, sale_price: Number(price) });
      await queryClient.invalidateQueries({ queryKey: liquidSalePriceRuleKey });
      setPrice('');
      setEditingRuleId(null);
      toast.success('판매 기준을 저장했습니다.');
    } catch { toast.error('판매 기준 저장에 실패했습니다.'); }
    finally { setIsSaving(false); }
  };

  const editRule = (id: string, ruleBreath: 'mtl' | 'dtl', ruleEvent: number, ruleBasic: number, rulePrice: number) => {
    setEditingRuleId(id); setBreath(ruleBreath); setEvent(ruleEvent); setBasic(ruleBasic); setPrice(String(rulePrice));
  };
  const saveExtraPrice = async (breathType: 'mtl' | 'dtl', saleKind: 'event' | 'basic', key: string) => {
    try { await saveLiquidSaleExtraBottlePrice({ breath_type: breathType, sale_kind: saleKind, additional_bottle_price: Number(extraDrafts[key]) || 0 }); await queryClient.invalidateQueries({ queryKey: liquidSaleExtraBottlePriceKey }); setEditingExtraKey(null); toast.success('추가 1병 금액을 저장했습니다.'); } catch { toast.error('저장에 실패했습니다.'); }
  };

  const extraTypes = [
    { breath: 'mtl' as const, kind: 'event' as const, label: '입호흡 · 이벤트' },
    { breath: 'mtl' as const, kind: 'basic' as const, label: '입호흡 · 기본' },
    { breath: 'dtl' as const, kind: 'event' as const, label: '폐호흡 · 이벤트' },
    { breath: 'dtl' as const, kind: 'basic' as const, label: '폐호흡 · 기본' },
  ];

  return (
    <div className="flex max-h-[80vh] flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900">액상 판매종류 관리</h2>
        <p className="mt-1 text-sm text-gray-500">액상 조합별 판매금액과 추가 1병 금액을 관리합니다.</p>
      </div>

      <section className="rounded-xl border border-gray-200 bg-gray-50/70 p-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">판매 기준 추가</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-gray-700">호흡 방식
            <select value={breath} onChange={(e) => setBreath(e.target.value as 'mtl' | 'dtl')} className={`mt-1 ${inputClass}`}>
              <option value="mtl">입호흡</option><option value="dtl">폐호흡</option>
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700">판매금액
            <input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="예) 45000" className={`mt-1 ${inputClass}`} />
          </label>
          <label className="text-sm font-medium text-gray-700">이벤트 병 수
            <input type="number" min="0" value={event} onChange={(e) => setEvent(Number(e.target.value))} className={`mt-1 ${inputClass}`} />
          </label>
          <label className="text-sm font-medium text-gray-700">기본 병 수
            <input type="number" min="0" value={basic} onChange={(e) => setBasic(Number(e.target.value))} className={`mt-1 ${inputClass}`} />
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">{editingRuleId && <Button size="sm" variant="gray" onClick={() => { setEditingRuleId(null); setPrice(''); }}>취소</Button>}<Button size="sm" onClick={saveRule} disabled={isSaving}>{isSaving ? '저장 중...' : editingRuleId ? '수정 저장' : '판매 기준 추가'}</Button></div>
      </section>

      <section className="min-h-0 overflow-y-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50"><tr><th className="px-4 py-3 text-left font-semibold text-gray-700">판매 구성</th><th className="px-4 py-3 text-right font-semibold text-gray-700">판매금액</th><th className="w-32 px-4 py-3" /></tr></thead>
          <tbody className="divide-y divide-gray-100">{isPending ? <tr><td colSpan={3} className="px-4 py-10 text-center text-gray-500">불러오는 중...</td></tr> : <>{rules.length === 0 ? <tr><td colSpan={3} className="px-4 py-10 text-center text-gray-500">등록된 판매 기준이 없습니다.</td></tr> : rules.map((rule) => <tr key={rule.id}><td className="px-4 py-3 text-gray-800">{rule.breath_type === 'mtl' ? '입호흡' : '폐호흡'} · 이벤트 {rule.event_quantity}병 + 기본 {rule.basic_quantity}병</td><td className="px-4 py-3 text-right font-medium text-gray-900">{rule.sale_price.toLocaleString()}원</td><td className="px-4 py-3 text-right"><Button size="xs" variant="gray" onClick={() => editRule(rule.id, rule.breath_type, rule.event_quantity, rule.basic_quantity, rule.sale_price)}>수정</Button><Button size="xs" variant="danger" className="ml-1" onClick={async () => { await deleteLiquidSalePriceRule(rule.id); await queryClient.invalidateQueries({ queryKey: liquidSalePriceRuleKey }); }}>삭제</Button></td></tr>)}{extraTypes.map((type) => { const key = `${type.breath}:${type.kind}`; const value = extraPrices.find((row) => row.breath_type === type.breath && row.sale_kind === type.kind)?.additional_bottle_price ?? 0; const isEditing = editingExtraKey === key; return <tr key={key}><td className="px-4 py-3 text-gray-800">{type.label} 추가 1병</td><td className="px-4 py-3 text-right font-medium text-gray-900">{isEditing ? <input type="number" min="0" value={extraDrafts[key] ?? String(value)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-right text-sm text-gray-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" onChange={(e) => setExtraDrafts((current) => ({ ...current, [key]: e.target.value }))} /> : `${value.toLocaleString()}원`}</td><td className="px-4 py-3 text-right">{isEditing ? <Button size="xs" onClick={() => saveExtraPrice(type.breath, type.kind, key)}>저장</Button> : <Button size="xs" variant="gray" onClick={() => { setExtraDrafts((current) => ({ ...current, [key]: String(value) })); setEditingExtraKey(key); }}>수정</Button>}</td></tr>; })}</>}</tbody>
        </table>
      </section>
      <div className="flex justify-end"><Button size="sm" variant="gray" onClick={onClose}>닫기</Button></div>
    </div>
  );
}
