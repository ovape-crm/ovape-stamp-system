"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import supabase from "@/libs/supabaseClient";
import TaggedContent from "@/app/_components/TaggedContent";
type GuideDevice = { id: string; name: string };

export default function BasicUsageGuideView({ devices, onClose }: { devices: GuideDevice[]; onClose: () => void }) {
  const { data = { steps: [], notes: [] } } = useQuery({ queryKey: ["comparison", "basic-usage-guide", devices.map((d) => d.id)], queryFn: async () => {
    const [steps, notes] = await Promise.all([supabase.from("comparison_usage_guide_steps").select("id,step_order,title,content").order("step_order"), supabase.from("comparison_device_usage_notes").select("device_id,step_id,content").in("device_id", devices.map((d) => d.id))]);
    if (steps.error) throw steps.error; if (notes.error) throw notes.error; return { steps: steps.data ?? [], notes: notes.data ?? [] };
  } });
  useEffect(() => { const key = (event: KeyboardEvent) => event.key === "Escape" && onClose(); document.addEventListener("keydown", key); document.body.style.overflow = "hidden"; return () => { document.removeEventListener("keydown", key); document.body.style.overflow = ""; }; }, [onClose]);
  if (typeof window === "undefined") return null;
  return createPortal(<div className="fixed inset-0 z-[4100] flex items-center justify-center"><div className="absolute inset-0 bg-black/60" onClick={onClose}/><div className="relative z-10 flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-brand-100 px-6 py-4"><h2 className="text-lg font-semibold text-gray-900">기초 사용법</h2><button onClick={onClose} className="cursor-pointer text-2xl leading-none text-gray-400 hover:text-gray-700" aria-label="닫기">×</button></div><div className="space-y-5 overflow-y-auto p-6">{data.steps.map((step) => <section key={step.id} className="rounded-xl border border-gray-300 p-5"><h3 className="flex items-baseline gap-1 text-xl font-semibold text-gray-950"><span>{step.step_order}.</span><TaggedContent inline content={step.title} /></h3><div className="mt-3 text-lg leading-relaxed text-gray-900"><TaggedContent content={step.content} /></div>{devices.map((device) => { const note = data.notes.find((item) => item.device_id === device.id && item.step_id === step.id); return note ? <div key={device.id} className="mt-4 rounded-lg bg-brand-50 px-4 py-3 text-base leading-relaxed text-gray-900">{device.name}: <TaggedContent content={note.content} /></div> : null; })}</section>)}</div></div></div>, document.body);
}
