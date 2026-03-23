'use client';

import { useState } from 'react';
import Button from '@/app/_components/Button';
import MenuPopover from '@/app/_components/MenuPopover';
import { useModal } from '@/app/_contexts/ModalContext';
import ColumnManageModal from './_components/ColumnManageModal';
import DeviceCreateModal from './_components/DeviceCreateModal';
import DeviceList from './_components/DeviceList';
import DeviceComparison from './_components/DeviceComparison';

type TabType = 'comparison' | 'list';

export default function ComparisonPage() {
  const [tab, setTab] = useState<TabType>('comparison');
  const [deviceRefreshKey, setDeviceRefreshKey] = useState(0);
  const { open, close } = useModal();

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

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 h-[calc(100vh-3.5rem)] sm:h-[calc(100vh-5rem)] flex flex-col">
      <div className="bg-white rounded-lg shadow-sm border border-brand-100 p-6 flex flex-col flex-1 overflow-hidden">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-brand-100 shrink-0">
          <div className="flex gap-1 sm:gap-3">
            <Button
              onClick={() => setTab('comparison')}
              variant={tab === 'comparison' ? 'primary' : 'secondary'}
            >
              기기 비교
            </Button>
            <Button
              onClick={() => setTab('list')}
              variant={tab === 'list' ? 'primary' : 'secondary'}
            >
              기기 목록
            </Button>
          </div>
          <MenuPopover
            items={[
              { label: '컬럼 관리', onClick: handleOpenColumnManage },
              { label: '기기 추가', onClick: handleOpenDeviceCreate },
            ]}
          />
        </div>
        <div className="flex-1 overflow-auto">
          {tab === 'comparison' && <DeviceComparison />}
          {tab === 'list' && <DeviceList refreshKey={deviceRefreshKey} />}
        </div>
      </div>
    </section>
  );
}
