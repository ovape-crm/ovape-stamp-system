'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import supabase from '@/libs/supabaseClient';
import Button from '@/app/_components/Button';
import TaggedContent from '@/app/_components/TaggedContent';
import GuideNavigationDropdown, { type GuideView } from './GuideNavigationDropdown';
import ZoomableImage from './ZoomableImage';

type Props = { deviceId: string; deviceName: string; legacyImageUrl?: string; onNavigate: (view: GuideView) => void; onClose: () => void };
const isImageUrl = (value: string) => { try { const url = new URL(value); return url.protocol === 'http:' || url.protocol === 'https:'; } catch { return false; } };
const imageSource = (value: string) => { const url = new URL(value); return url.hostname === 'pstatic.net' || url.hostname.endsWith('.pstatic.net') ? `/api/naver-image?url=${encodeURIComponent(value)}` : value; };

export default function DeviceUsageGuideView({ deviceId, deviceName, legacyImageUrl = '', onNavigate, onClose }: Props) {
  const [isHeaderOpen, setIsHeaderOpen] = useState(false);
  const { data } = useQuery({ queryKey: ['comparison', 'device-usage-guide', deviceId], queryFn: async () => {
    const { data: guide, error } = await supabase.from('comparison_device_usage_guides').select('*').eq('device_id', deviceId).maybeSingle();
    if (error) throw error;
    return guide;
  } });
  const { data: commonGuideSettings } = useQuery({ queryKey: ['comparison', 'device-usage-guide-common-notice'], queryFn: async () => {
    const { data: settings, error } = await supabase.from('comparison_device_usage_guide_settings').select('common_header_content').eq('id', 'default').maybeSingle();
    if (error) throw error;
    return settings;
  } });
  useEffect(() => { const key = (event: KeyboardEvent) => event.key === 'Escape' && onClose(); document.addEventListener('keydown', key); document.body.style.overflow = 'hidden'; return () => { document.removeEventListener('keydown', key); document.body.style.overflow = ''; }; }, [onClose]);
  if (typeof window === 'undefined') return null;
  const guide = data;
  const legacyLinkUrl = legacyImageUrl.match(/<link url="([^"]+)">/)?.[1] ?? legacyImageUrl;
  const imageUrls = ((Array.isArray(guide?.image_urls) && guide.image_urls.length > 0 ? guide.image_urls : guide?.image_url ? [guide.image_url] : legacyLinkUrl ? [legacyLinkUrl] : []) as string[]).filter(isImageUrl);
  const noticeContent = guide?.header_content?.trim() || commonGuideSettings?.common_header_content?.trim() || '';
  const alignment = guide?.image_alignment === 'left' ? 'mr-auto' : guide?.image_alignment === 'right' ? 'ml-auto' : 'mx-auto';
  return createPortal(<div className="fixed inset-0 z-[4100] flex items-center justify-center p-2 sm:p-4"><div className="absolute inset-0 bg-black/60" onClick={onClose} /><div className="relative z-10 flex h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:h-[90vh]"><div className="flex shrink-0 items-center justify-between border-b border-brand-100 px-4 py-3 sm:px-6 sm:py-4"><h2 className="text-base font-semibold text-gray-900 sm:text-lg">{deviceName} 기기 사용법</h2><div className="flex items-center gap-2">{noticeContent && <Button size="xs" variant="secondary" className="!px-4 !py-1.5 !text-sm sm:!px-6 sm:!py-2 sm:!text-base" onClick={() => setIsHeaderOpen((current) => !current)}>안내 {isHeaderOpen ? '닫기' : '열기'}</Button>}<GuideNavigationDropdown current="usage" onNavigate={onNavigate} /><button type="button" onClick={onClose} className="cursor-pointer text-2xl leading-none text-gray-400 hover:text-gray-700" aria-label="닫기">×</button></div></div><article className="flex min-h-0 flex-1 flex-col p-2">{isHeaderOpen && noticeContent && <div className="shrink-0 rounded-t-xl border border-gray-300 bg-white p-4 text-base leading-relaxed text-gray-900 sm:p-5 sm:text-lg"><TaggedContent content={noticeContent} /></div>}<div className={`guide-image-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain border border-gray-300 [-webkit-overflow-scrolling:touch] ${isHeaderOpen && noticeContent ? 'rounded-b-xl border-t-0' : 'rounded-xl'}`}>{imageUrls.map((imageUrl, index) => <ZoomableImage key={`${imageUrl}-${index}`} src={imageSource(imageUrl)} alt={`${deviceName} 사용법 ${index + 1}`} className={`mt-5 h-auto w-auto max-w-full object-contain ${alignment}`} zoomClassName="mt-5" />)}{guide?.body_content && <div className="p-5 text-lg leading-relaxed text-gray-900"><TaggedContent content={guide.body_content} /></div>}{imageUrls.length === 0 && !guide?.body_content && <p className="p-5 text-gray-500">등록된 사용법 이미지 또는 안내가 없습니다.</p>}</div></article></div></div>, document.body);
}
