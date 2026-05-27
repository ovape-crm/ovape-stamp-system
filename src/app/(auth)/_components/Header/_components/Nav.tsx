'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const Nav = () => {
  const pathname = usePathname();

  const navLinks = [
    { href: '/customers', label: '고객' },
    { href: '/histories', label: '이력' },
    { href: '/after-services', label: 'AS 현황' },
    { href: '/comparison', label: '기기 비교' },
    { href: '/items', label: '품목 관리' },
    {
      href: '/inventory',
      label: '재고 관리',
      matchPaths: ['/inventory', '/inbound'],
    },
  ];

  return (
    <nav className="flex gap-0.5 sm:gap-2">
      {navLinks.map((link) => {
        const paths = link.matchPaths ?? [link.href];
        const isActive = paths.some((p) => pathname?.startsWith(p));
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`
              px-2 py-1.5 sm:px-4 sm:py-2 rounded-lg font-medium
              transition-colors duration-150
              ${
                isActive
                  ? 'text-brand-600 bg-white shadow-sm'
                  : 'text-brand-700 hover:text-brand-600 hover:bg-white/50'
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
