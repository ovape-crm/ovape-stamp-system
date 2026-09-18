'use client';

import { Dropdown, type DropdownOption } from '@/app/_components/Dropdown';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useModal } from '@/app/_contexts/ModalContext';
import supabase from '@/libs/supabaseClient';
import GuideNavigationOrderModal from './GuideNavigationOrderModal';

export type GuideView = 'basic' | 'customerRequired' | 'photo' | 'usage' | 'defect';

const options: Array<DropdownOption & { value: GuideView }> = [
  { value: 'basic', label: '기초 사용법' },
  { value: 'customerRequired', label: '고객 필수 안내' },
  { value: 'photo', label: '사진' },
  { value: 'usage', label: '사용법' },
  { value: 'defect', label: '불량 증상' },
];
const widestLabel = options.reduce((longest, option) => option.label.length > longest.length ? option.label : longest, '');
const triggerWidthLabel = `${widestLabel}　　　✓`;
const defaultOrder: GuideView[] = ['basic', 'customerRequired', 'photo', 'usage', 'defect'];

export default function GuideNavigationDropdown({ current, onNavigate }: { current: GuideView; onNavigate: (view: GuideView) => void }) {
  const { open, close } = useModal();
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ['comparison', 'guide-navigation-order'], queryFn: async () => { const { data, error } = await supabase.from('comparison_guide_navigation_settings').select('view_order').eq('id', 'default').maybeSingle(); if (error) throw error; return data; } });
  const order = (Array.isArray(settings?.view_order) ? settings.view_order : defaultOrder).filter((view): view is GuideView => defaultOrder.includes(view as GuideView));
  const orderedOptions = order.map((view) => options.find((option) => option.value === view)!).filter(Boolean);
  const openOrderManage = () => open({ content: <GuideNavigationOrderModal initialOrder={order} onCancel={close} onSaved={async () => { await queryClient.invalidateQueries({ queryKey: ['comparison', 'guide-navigation-order'] }); close(); }} />, options: { dismissOnBackdrop: false, dismissOnEsc: true, size: 'max-w-md' } });
  return (
    <Dropdown controlledValue={current}>
      <Dropdown.Trigger neutral className="relative !h-auto !w-auto !justify-center !px-4 !py-1.5 !text-sm sm:!px-6 sm:!py-2 sm:!text-base [&>svg]:absolute [&>svg]:right-4 sm:[&>svg]:right-6">
        <span className="grid whitespace-nowrap">
          <span className="col-start-1 row-start-1">이동하기</span>
          <span className="invisible col-start-1 row-start-1">{triggerWidthLabel}</span>
        </span>
      </Dropdown.Trigger>
      <Dropdown.Content neutral flush>
        {orderedOptions.map((option, index) => (
          <Dropdown.Item key={option.value} option={{ ...option, label: `${index + 1}. ${option.label}` }} neutral className={`relative whitespace-nowrap text-left hover:!bg-brand-100 focus:!bg-brand-100 ${index > 0 ? 'border-t border-gray-200' : ''}`} onSelect={() => onNavigate(option.value)}><span className="flex items-center gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">{index + 1}</span>{option.label}</span></Dropdown.Item>
        ))}
        <Dropdown.Item option={{ value: 'manage', label: '메뉴 순서 설정' }} neutral showCheck={false} className="border-t border-gray-300 text-center hover:!bg-brand-100 [&>div]:justify-center" onSelect={openOrderManage}><svg className="h-4 w-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 15.25A3.25 3.25 0 1 0 12 8.75a3.25 3.25 0 0 0 0 6.5Zm7.25-3.25c0-.48-.05-.95-.14-1.4l2.02-1.57-2-3.46-2.48 1a7.4 7.4 0 0 0-2.42-1.4L13.88 2.5h-4l-.35 2.67a7.4 7.4 0 0 0-2.42 1.4l-2.48-1-2 3.46 2.02 1.57a7.18 7.18 0 0 0 0 2.8l-2.02 1.57 2 3.46 2.48-1a7.4 7.4 0 0 0 2.42 1.4l.35 2.67h4l.35-2.67a7.4 7.4 0 0 0 2.42-1.4l2.48 1 2-3.46-2.02-1.57c.09-.45.14-.92.14-1.4Z" /></svg></Dropdown.Item>
      </Dropdown.Content>
    </Dropdown>
  );
}
