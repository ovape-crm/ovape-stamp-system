'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navLinks = [
  { href: '/customers', label: '고객' },
  { href: '/histories', label: '이력' },
  { href: '/after-services', label: 'AS 현황' },
  { href: '/comparison', label: '기기 비교' },
  { href: '/items', label: '품목 관리' },
  { href: '/manuals', label: '매뉴얼' },
];

type NavProps = {
  orientation?: 'horizontal' | 'vertical';
  onNavigate?: () => void;
};

const Nav = ({ orientation = 'horizontal', onNavigate }: NavProps) => {
  const pathname = usePathname();
  const isVertical = orientation === 'vertical';

  return (
    <nav className={isVertical ? 'flex flex-col gap-1.5' : 'flex gap-0.5 sm:gap-2'}>
      {navLinks.map((link) => {
        const isActive = pathname?.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            className={`
              rounded-lg font-medium
              transition-colors duration-150
              ${isVertical ? 'px-4 py-3 text-sm' : 'px-2 py-1.5 sm:px-4 sm:py-2'}
              ${
                isActive
                  ? 'text-brand-700 bg-white shadow-sm'
                  : 'text-brand-700 hover:text-brand-600 hover:bg-white/60'
              }
            `}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
};

export default Nav;
