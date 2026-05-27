'use client';

import { usePathname, useRouter } from 'next/navigation';
import Button from '@/app/_components/Button';

const TABS = [
  { href: '/inventory', label: '재고 현황' },
  { href: '/inbound', label: '입고 관리' },
];

const InventoryTabs = () => {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="flex gap-1 sm:gap-3">
      {TABS.map((tab) => {
        const isActive =
          pathname === tab.href || pathname?.startsWith(tab.href + '/');
        return (
          <Button
            key={tab.href}
            onClick={() => router.push(tab.href)}
            variant={isActive ? 'primary' : 'secondary'}
          >
            {tab.label}
          </Button>
        );
      })}
    </div>
  );
};

export default InventoryTabs;
