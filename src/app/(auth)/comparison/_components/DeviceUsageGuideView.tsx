'use client';
/* eslint-disable @next/next/no-img-element -- 네이버의 동적 이미지 URL을 직접 표시한다. */

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import supabase from '@/libs/supabaseClient';
import TaggedContent from '@/app/_components/TaggedContent';

type Props = { deviceId: string; deviceName: string; legacyImageUrl?: string; onClose: () => void };
const isImageUrl = (value: string) => { try { const url = new URL(value); return url.protocol === 'http:' || url.protocol === 'https:'; } catch { return false; } };
const imageSource = (value: string) => { const url = new URL(value); return url.hostname === 'pstatic.net' || url.hostname.endsWith('.pstatic.net') ? `/api/naver-image?url=${encodeURIComponent(value)}` : value; };

export default function DeviceUsageGuideView({ deviceId, deviceName, legacyImageUrl = '', onClose }: Props) {
  const { data } = useQuery({ queryKey: ['comparison', 'device-usage-guide', deviceId], queryFn: async () => {
    const { data: guide, error } = await supabase.from('comparison_device_usage_guides').select('*').eq('device_id', deviceId).maybeSingle();
    if (error) throw error;
    return guide;
  } });
  useEffect(() => { const key = (event: KeyboardEvent) => event.key === 'Escape' && onClose(); document.addEventListener('keydown', key); document.body.style.overflow = 'hidden'; return () => { document.removeEventListener('keydown', key); document.body.style.overflow = ''; }; }, [onClose]);
  if (typeof window === 'undefined') return null;
  const guide = data;
  const legacyLinkUrl = legacyImageUrl.match(/<link url="([^"]+)">/)?.[1] ?? legacyImageUrl;
  const imageUrls = ((Array.isArray(guide?.image_urls) && guide.image_urls.length > 0 ? guide.image_urls : guide?.image_url ? [guide.image_url] : legacyLinkUrl ? [legacyLinkUrl] : []) as string[]).filter(isImageUrl);
  const alignment = guide?.image_alignment === 'left' ? 'mr-auto' : guide?.image_alignment === 'right' ? 'ml-auto' : 'mx-auto';
  return createPortal(<div className="fixed inset-0 z-[4100] flex items-center justify-center"><div className="absolute inset-0 bg-black/60" onClick={onClose} /><div className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-brand-100 px-6 py-4"><h2 className="text-lg font-semibold text-gray-900">{deviceName} 기기 사용법</h2><button type="button" onClick={onClose} className="cursor-pointer text-2xl leading-none text-gray-400 hover:text-gray-700" aria-label="닫기">×</button></div><div className="overflow-y-auto p-6"><article className="rounded-xl border border-gray-300 p-5">{guide?.header_content && <div className="text-lg leading-relaxed text-gray-900"><TaggedContent content={guide.header_content} /></div>}{imageUrls.map((imageUrl, index) => <img key={`${imageUrl}-${index}`} src={imageSource(imageUrl)} referrerPolicy="no-referrer" alt={`${deviceName} 사용법 ${index + 1}`} className={`mt-5 h-auto ${alignment}`} style={{ width: `${guide?.image_width_percent ?? 70}%` }} />)}{guide?.body_content && <div className="mt-5 text-lg leading-relaxed text-gray-900"><TaggedContent content={guide.body_content} /></div>}{imageUrls.length === 0 && !guide?.body_content && <p className="mt-5 text-gray-500">등록된 사용법 이미지 또는 안내가 없습니다.</p>}</article></div></div></div>, document.body);
}
