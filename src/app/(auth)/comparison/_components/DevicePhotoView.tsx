'use client';
/* eslint-disable @next/next/no-img-element -- 외부 저장소의 기기 사진을 직접 표시한다. */

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import TaggedContent from '@/app/_components/TaggedContent';
import supabase from '@/libs/supabaseClient';

const source = (value: string) => { const url = new URL(value); return url.hostname === 'pstatic.net' || url.hostname.endsWith('.pstatic.net') ? `/api/naver-image?url=${encodeURIComponent(value)}` : value; };

export default function DevicePhotoView({ deviceId, deviceName, onClose }: { deviceId: string; deviceName: string; onClose: () => void }) {
  const { data: photo } = useQuery({ queryKey: ['comparison', 'device-photos', deviceId], queryFn: async () => { const { data, error } = await supabase.from('comparison_device_photos').select('*').eq('device_id', deviceId).maybeSingle(); if (error) throw error; return data; } });
  useEffect(() => { const key = (event: KeyboardEvent) => event.key === 'Escape' && onClose(); document.addEventListener('keydown', key); document.body.style.overflow = 'hidden'; return () => { document.removeEventListener('keydown', key); document.body.style.overflow = ''; }; }, [onClose]);
  if (typeof window === 'undefined') return null;
  const urls = ((Array.isArray(photo?.image_urls) ? photo.image_urls : []) as unknown[]).filter((value): value is string => typeof value === 'string' && /^https?:\/\//.test(value));
  const alignment = photo?.image_alignment === 'left' ? 'mr-auto' : photo?.image_alignment === 'right' ? 'ml-auto' : 'mx-auto';
  return createPortal(<div className="fixed inset-0 z-[4100] flex items-center justify-center"><div className="absolute inset-0 bg-black/60" onClick={onClose} /><div className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-brand-100 px-6 py-4"><h2 className="text-lg font-semibold text-gray-900">{deviceName} 사진</h2><button type="button" onClick={onClose} className="cursor-pointer text-2xl leading-none text-gray-400 hover:text-gray-700" aria-label="닫기">×</button></div><div className="overflow-y-auto p-6">{photo?.header_content && <div className="mb-5 text-lg leading-relaxed text-gray-900"><TaggedContent content={photo.header_content} /></div>}{urls.length ? urls.map((url, index) => <img key={`${url}-${index}`} src={source(url)} referrerPolicy="no-referrer" alt={`${deviceName} 사진 ${index + 1}`} className={`mb-5 h-auto ${alignment}`} style={{ width: `${photo?.image_width_percent ?? 70}%` }} />) : !photo?.header_content && <p className="text-gray-500">등록된 기기 사진 또는 안내가 없습니다.</p>}</div></div></div>, document.body);
}
