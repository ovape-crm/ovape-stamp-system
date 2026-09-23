'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Button from '@/app/_components/Button';
import MenuPopover from '@/app/_components/MenuPopover';
import { useModal } from '@/app/_contexts/ModalContext';
import ColumnManageModal from './_components/ColumnManageModal';
import DeviceCreateModal from './_components/DeviceCreateModal';
import DeviceList from './_components/DeviceList';
import DeviceComparison from './_components/DeviceComparison';
import BasicUsageGuideManageModal from './_components/BasicUsageGuideManageModal';
import CustomerRequiredGuideManage from './_components/CustomerRequiredGuideManage';
import DeviceUsageGuideManage from './_components/DeviceUsageGuideManage';
import DevicePhotoManage from './_components/DevicePhotoManage';
import DeviceDefectManage from './_components/DeviceDefectManage';
import ComparisonPrintVisibilityModal from './_components/ComparisonPrintVisibilityModal';
import { useUser } from '@/app/_contexts/UserContext';

type TabType = 'comparison' | 'list' | 'basic-usage-guide' | 'customer-required-guide' | 'device-usage-guide' | 'device-photo-manage' | 'device-defect-manage';
const ADMIN_COMPARISON_TABS: TabType[] = ['basic-usage-guide', 'customer-required-guide', 'device-usage-guide', 'device-photo-manage', 'device-defect-manage'];

export default function ComparisonPage() {
  const pathname = usePathname();
  const router = useRouter();
  const [tab, setTab] = useState<TabType>('comparison');
  const [deviceRefreshKey, setDeviceRefreshKey] = useState(0);
  const { open, close } = useModal();
  const { isAdmin, isLoading: isUserLoading } = useUser();
  useEffect(() => {
    const current = pathname?.split('/').pop();
    const resolved = current === 'compare' ? 'comparison' : current as TabType;
    if (pathname === '/comparison' || !['comparison', 'list', ...ADMIN_COMPARISON_TABS].includes(resolved) || (!isUserLoading && !isAdmin && ADMIN_COMPARISON_TABS.includes(resolved))) {
      router.replace('/comparison/compare');
      return;
    }
    setTab(resolved);
  }, [isAdmin, isUserLoading, pathname, router]);
  const selectTab = (next: TabType) => router.push(`/comparison/${next === 'comparison' ? 'compare' : next}`);

  const handleOpenColumnManage = () => {
    open({
      content: <ColumnManageModal onCancel={close} onUpdate={() => setDeviceRefreshKey((k) => k + 1)} />,
      options: { dismissOnBackdrop: false, dismissOnEsc: true },
    });
  };

  const handleOpenDeviceCreate = () => {
    open({
      content: <DeviceCreateModal onCancel={close} onSuccess={() => { close(); setDeviceRefreshKey((k) => k + 1); }} />,
      options: { dismissOnBackdrop: false, dismissOnEsc: true },
    });
  };
  const handleOpenPrintVisibility = () => open({ content: <ComparisonPrintVisibilityModal onCancel={close} />, options: { dismissOnBackdrop: true, dismissOnEsc: true } });

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 h-[calc(100vh-3.5rem)] sm:h-[calc(100vh-5rem)] flex flex-col">
      <div className="bg-white rounded-lg shadow-sm border border-brand-100 p-6 flex flex-col flex-1 overflow-hidden">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-brand-100 shrink-0">
          <div className="flex gap-1 sm:gap-3">
            <Button
              onClick={() => selectTab('comparison')}
              variant={tab === 'comparison' ? 'primary' : 'secondary'}
            >
              기기 비교
            </Button>
            <Button
              onClick={() => selectTab('list')}
              variant={tab === 'list' ? 'primary' : 'secondary'}
            >
              기기 목록
            </Button>
          </div>
          <MenuPopover
            items={[
              { label: '컬럼 관리', onClick: handleOpenColumnManage },
              ...(isAdmin ? [{ label: '표 출력 여부', onClick: handleOpenPrintVisibility }] : []),
              ...(isAdmin ? [
                { label: '기초 사용법 관리', onClick: () => selectTab('basic-usage-guide') },
                { label: '고객 필수 안내 관리', onClick: () => selectTab('customer-required-guide') },
                { label: '기기 사진 관리', onClick: () => selectTab('device-photo-manage') },
                { label: '기기 사용법 관리', onClick: () => selectTab('device-usage-guide') },
                { label: '기기 불량 관리', onClick: () => selectTab('device-defect-manage') },
              ] : []),
              { label: '기기 추가', onClick: handleOpenDeviceCreate },
            ]}
          />
        </div>
        <div className="flex-1 overflow-auto">
          {tab === 'comparison' && <DeviceComparison />}
          {tab === 'list' && <DeviceList refreshKey={deviceRefreshKey} />}
          {tab === 'basic-usage-guide' && (
            <div className="flex h-full min-h-0 flex-col">
              <BasicUsageGuideManageModal onCancel={() => selectTab('comparison')} />
            </div>
          )}
          {tab === 'customer-required-guide' && <div className="flex h-full min-h-0 flex-col"><CustomerRequiredGuideManage onCancel={() => selectTab('comparison')} /></div>}
          {tab === 'device-usage-guide' && <DeviceUsageGuideManage />}
          {tab === 'device-defect-manage' && <DeviceDefectManage />}
          {tab === 'device-photo-manage' && <DevicePhotoManage />}
        </div>
      </div>
    </section>
  );
}
