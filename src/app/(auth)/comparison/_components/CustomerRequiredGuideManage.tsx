'use client';

import BasicUsageGuideManageModal from './BasicUsageGuideManageModal';

export default function CustomerRequiredGuideManage({ onCancel }: { onCancel: () => void }) {
  return <BasicUsageGuideManageModal onCancel={onCancel} kind="customerRequired" title="고객 필수 안내" />;
}
