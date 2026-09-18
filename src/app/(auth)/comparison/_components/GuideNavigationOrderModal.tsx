'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import Button from '@/app/_components/Button';
import supabase from '@/libs/supabaseClient';
import type { GuideView } from './GuideNavigationDropdown';

const labels: Record<GuideView, string> = { basic: '기초 사용법', customerRequired: '고객 필수 안내', photo: '사진', usage: '사용법', defect: '불량 증상' };

export default function GuideNavigationOrderModal({ initialOrder, onCancel, onSaved }: { initialOrder: GuideView[]; onCancel: () => void; onSaved: () => void }) {
  const [order, setOrder] = useState(initialOrder);
  const [saving, setSaving] = useState(false);
  const move = (index: number, direction: -1 | 1) => setOrder((current) => { const next = [...current]; const target = index + direction; if (target < 0 || target >= next.length) return current; [next[index], next[target]] = [next[target], next[index]]; return next; });
  const save = async () => { setSaving(true); try { const { error } = await supabase.rpc('save_comparison_guide_navigation_order', { p_view_order: order }); if (error) throw error; toast.success('이동하기 메뉴 순서를 저장했습니다.'); onSaved(); } catch { toast.error('메뉴 순서 저장에 실패했습니다.'); } finally { setSaving(false); } };
  return <div className="flex max-h-[calc(90vh-2rem)] min-h-0 w-full flex-col"><h2 className="mb-2 text-lg font-semibold">이동하기 메뉴 순서</h2><p className="mb-4 text-sm text-gray-500">위·아래 버튼으로 표시 순서를 변경하세요.</p><div className="min-h-0 flex-1 space-y-2 overflow-y-auto">{order.map((view, index) => <div key={view} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2"><span className="text-sm font-medium text-gray-800">{index + 1}. {labels[view]}</span><div className="flex gap-1"><Button size="xs" variant="gray" disabled={saving || index === 0} onClick={() => move(index, -1)}>↑</Button><Button size="xs" variant="gray" disabled={saving || index === order.length - 1} onClick={() => move(index, 1)}>↓</Button></div></div>)}</div><div className="mt-5 flex shrink-0 justify-end gap-2 border-t border-gray-200 pt-3"><Button size="sm" variant="gray" disabled={saving} onClick={onCancel}>취소</Button><Button size="sm" disabled={saving} onClick={save}>저장</Button></div></div>;
}
