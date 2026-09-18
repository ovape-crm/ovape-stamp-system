'use client';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import supabase from '@/libs/supabaseClient';
import TaggedContent from '@/app/_components/TaggedContent';
import GuideNavigationDropdown, { type GuideView } from './GuideNavigationDropdown';
type Step = { id: string; step_order: number; title: string; content: string };
export default function DeviceDefectView({ deviceId, deviceName, onNavigate, onClose }: { deviceId: string; deviceName: string; onNavigate: (view: GuideView) => void; onClose: () => void }) {
  const { data: steps = [] } = useQuery({ queryKey: ['comparison', 'device-defects', deviceId], queryFn: async () => { const { data, error } = await supabase.from('comparison_device_defect_symptom_steps').select('id,step_order,title,content').eq('device_id', deviceId).order('step_order'); if (error) throw error; return (data ?? []) as Step[]; } });
  useEffect(() => { const key = (event: KeyboardEvent) => event.key === 'Escape' && onClose(); document.addEventListener('keydown', key); document.body.style.overflow = 'hidden'; return () => { document.removeEventListener('keydown', key); document.body.style.overflow = ''; }; }, [onClose]);
  if (typeof window === 'undefined') return null;
  return createPortal(<div className="fixed inset-0 z-[4100] flex items-center justify-center"><div className="absolute inset-0 bg-black/60" onClick={onClose} /><div className="relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-brand-100 px-6 py-4"><h2 className="text-lg font-semibold text-gray-900">{deviceName} 불량 증상</h2><div className="flex items-center gap-4"><GuideNavigationDropdown current="defect" onNavigate={onNavigate} /><button type="button" onClick={onClose} className="cursor-pointer text-2xl leading-none text-gray-400 hover:text-gray-700" aria-label="닫기">×</button></div></div><div className="space-y-4 overflow-y-auto p-6">{steps.length ? steps.map((step) => <article key={step.id} className="rounded-xl border border-gray-200 p-4"><p className="text-xs font-semibold text-brand-600">{step.step_order}단계</p><h3 className="mt-1 text-base font-semibold text-gray-950"><TaggedContent inline content={step.title} /></h3><div className="mt-2 text-sm leading-relaxed text-gray-900"><TaggedContent content={step.content} /></div></article>) : <p className="text-sm text-gray-500">등록된 불량 증상이 없습니다.</p>}</div></div></div>, document.body);
}
