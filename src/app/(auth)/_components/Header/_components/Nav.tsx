'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import toast from 'react-hot-toast';
import Button from '@/app/_components/Button';
import { useUser } from '@/app/_contexts/UserContext';
import { useStaffOpening } from '@/app/_contexts/StaffOpeningContext';
import supabase from '@/libs/supabaseClient';

type GroupKey = 'customer' | 'product' | 'store';
type MenuItem = { href: string; label: string; group_key: GroupKey; sort_order: number };

const groupLabels: Record<GroupKey, string> = {
  customer: '고객 관리',
  product: '상품 관리',
  store: '매장 운영',
};
const groupOrder: GroupKey[] = ['customer', 'product', 'store'];
const defaultMenuItems: MenuItem[] = [
  { href: '/customers', label: '고객', group_key: 'customer', sort_order: 0 },
  { href: '/histories', label: '이력', group_key: 'customer', sort_order: 1 },
  { href: '/after-services', label: 'AS 현황', group_key: 'customer', sort_order: 2 },
  { href: '/product-search', label: '상품 검색', group_key: 'product', sort_order: 0 },
  { href: '/items', label: '품목 관리', group_key: 'product', sort_order: 1 },
  { href: '/inventory', label: '재고/입고', group_key: 'product', sort_order: 2 },
  { href: '/comparison', label: '기기 비교', group_key: 'product', sort_order: 3 },
  { href: '/liqud-stand', label: '시연대', group_key: 'product', sort_order: 4 },
  { href: '/cash-management', label: '시재', group_key: 'store', sort_order: 0 },
  { href: '/reports', label: '보고서', group_key: 'store', sort_order: 1 },
  { href: '/work-journal', label: '근무일지', group_key: 'store', sort_order: 2 },
  { href: '/manuals', label: '매뉴얼', group_key: 'store', sort_order: 3 },
];

type NavProps = { orientation?: 'horizontal' | 'vertical'; onNavigate?: () => void };

const Nav = ({ orientation = 'horizontal', onNavigate }: NavProps) => {
  const pathname = usePathname();
  const { isAdmin } = useUser();
  const { isLocked, step: staffOpeningStep } = useStaffOpening();
  const [menuItems, setMenuItems] = useState(defaultMenuItems);
  const [openGroup, setOpenGroup] = useState<GroupKey | null>(null);
  const [inventorySubmenuOpen, setInventorySubmenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftItems, setDraftItems] = useState(defaultMenuItems);
  const [saving, setSaving] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const loadMenu = async () => {
      const { data, error } = await supabase.from('navigation_menu_settings').select('href, label, group_key, sort_order');
      if (!error && data?.length) setMenuItems(defaultMenuItems.map((fallback) => (data as MenuItem[]).find((item) => item.href === fallback.href) ?? fallback));
    };
    loadMenu();
  }, []);

  useEffect(() => {
    setOpenGroup(null);
    setInventorySubmenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!openGroup) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!navRef.current?.contains(event.target as Node)) setOpenGroup(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenGroup(null);
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [openGroup]);

  const visibleMenuItems = useMemo(
    () =>
      menuItems.filter(
        (item) =>
          (isAdmin || item.href !== '/items') &&
          (!isLocked ||
            item.href === '/work-journal' ||
            item.href === '/cash-management' ||
            (staffOpeningStep === 'checklist' && item.href === '/reports')),
      ),
    [isAdmin, isLocked, menuItems, staffOpeningStep],
  );
  const groupedItems = useMemo(
    () =>
      groupOrder
        .map((key) => ({
          key,
          label: groupLabels[key],
          links: visibleMenuItems
            .filter((item) => item.group_key === key)
            .sort((a, b) => a.sort_order - b.sort_order),
        }))
        .filter((group) => group.links.length > 0),
    [visibleMenuItems],
  );
  const closeAfterNavigate = () => { setOpenGroup(null); onNavigate?.(); };

  const moveDraft = (href: string, direction: -1 | 1) => {
    setDraftItems((current) => {
      const target = current.find((item) => item.href === href);
      if (!target) return current;
      const groupItems = current.filter((item) => item.group_key === target.group_key).sort((a, b) => a.sort_order - b.sort_order);
      const index = groupItems.findIndex((item) => item.href === href);
      const swap = groupItems[index + direction];
      if (!swap) return current;
      return current.map((item) => item.href === target.href ? { ...item, sort_order: swap.sort_order } : item.href === swap.href ? { ...item, sort_order: target.sort_order } : item);
    });
  };

  const saveMenu = async () => {
    setSaving(true);
    const normalized = groupOrder.flatMap((key) => draftItems.filter((item) => item.group_key === key).sort((a, b) => a.sort_order - b.sort_order).map((item, index) => ({ ...item, sort_order: index })));
    const { error } = await supabase.from('navigation_menu_settings').upsert(normalized, { onConflict: 'href' });
    setSaving(false);
    if (error) { toast.error(`메뉴 설정 저장 실패: ${error.message}`); return; }
    setMenuItems(normalized);
    setEditing(false);
    toast.success('메뉴 분류가 저장되었습니다.');
  };

  if (orientation === 'vertical') return (
    <nav className="flex flex-col gap-5">
      {groupedItems.map((group) => (
        <div key={group.key}>
          <p className="mb-1.5 px-2 text-[11px] font-bold tracking-wide text-brand-600/70">
            {group.label}
          </p>
          <div className="flex flex-col gap-1">
            {group.links.map((link) =>
              link.href === '/inventory' ? (
                <div key={link.href}>
                  <button
                    type="button"
                    onClick={() => setInventorySubmenuOpen((current) => !current)}
                    className={`flex w-full items-center justify-between rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                      pathname?.startsWith(link.href)
                        ? 'bg-white text-brand-700 shadow-sm'
                        : 'text-brand-700 hover:bg-white/60'
                    }`}
                    aria-expanded={inventorySubmenuOpen}
                  >
                    {link.label}
                    <span className={`transition-transform ${inventorySubmenuOpen ? 'rotate-90' : ''}`}>›</span>
                  </button>
                  {inventorySubmenuOpen && (
                    <div className="ml-4 mt-1 flex flex-col gap-1 border-l border-brand-200 pl-2">
                      <Link href="/inventory/stock" onClick={closeAfterNavigate} className="rounded-lg px-4 py-2.5 text-sm font-medium text-brand-700 hover:bg-white/60">재고</Link>
                      <Link href="/inventory/receive" onClick={closeAfterNavigate} className="rounded-lg px-4 py-2.5 text-sm font-medium text-brand-700 hover:bg-white/60">입고</Link>
                    </div>
                  )}
                </div>
              ) : (
                <Link key={link.href} href={link.href} onClick={closeAfterNavigate} className={`rounded-lg px-4 py-3 text-sm font-medium transition-colors ${pathname?.startsWith(link.href) ? 'bg-white text-brand-700 shadow-sm' : 'text-brand-700 hover:bg-white/60'}`}>
                  {link.label}
                </Link>
              ),
            )}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      <nav ref={navRef} className="flex items-center gap-2" onPointerLeave={(event) => { if (event.pointerType === 'mouse') setOpenGroup(null); }}>
        {groupedItems.map((group) => {
          const active = group.links.some((link) => pathname?.startsWith(link.href));
          return <div key={group.key} className="relative" onPointerEnter={(event) => { if (event.pointerType === 'mouse') setOpenGroup(group.key); }}><button type="button" aria-haspopup="menu" aria-expanded={openGroup === group.key} onClick={() => setOpenGroup((current) => current === group.key ? null : group.key)} className={`flex min-h-12 items-center gap-1 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${active ? 'bg-white text-brand-700 shadow-sm' : 'text-brand-700 hover:bg-white/60'}`}>{group.label}<svg className={`h-3.5 w-3.5 transition-transform ${openGroup === group.key ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 9 6 6 6-6" /></svg></button>{openGroup === group.key && <div className="absolute left-0 top-[calc(100%-2px)] z-50 min-w-44 pt-2"><div role="menu" className="overflow-visible rounded-xl border border-gray-100 bg-white p-1.5 shadow-xl">{group.links.map((link) => link.href === '/inventory' ? <div key={link.href} className="relative" onPointerEnter={(event) => { if (event.pointerType === 'mouse') setInventorySubmenuOpen(true); }} onPointerLeave={(event) => { if (event.pointerType === 'mouse') setInventorySubmenuOpen(false); }}><button type="button" role="menuitem" aria-haspopup="menu" aria-expanded={inventorySubmenuOpen} onClick={() => setInventorySubmenuOpen((current) => !current)} className={`flex min-h-12 w-full items-center justify-between rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${pathname?.startsWith(link.href) ? 'bg-brand-50 text-brand-700' : 'text-gray-700 hover:bg-gray-50 hover:text-brand-700'}`}><span>{link.label}</span><span>›</span></button>{inventorySubmenuOpen && <div className="absolute left-full top-0 z-50 pl-2"><div role="menu" className="min-w-28 rounded-xl border border-gray-100 bg-white p-1.5 shadow-xl"><Link href="/inventory/stock" onClick={closeAfterNavigate} role="menuitem" className="flex min-h-11 items-center rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-brand-50 hover:text-brand-700">재고</Link><Link href="/inventory/receive" onClick={closeAfterNavigate} role="menuitem" className="flex min-h-11 items-center rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-brand-50 hover:text-brand-700">입고</Link></div></div>}</div> : <Link key={link.href} href={link.href} onClick={closeAfterNavigate} role="menuitem" className={`flex min-h-12 items-center rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${pathname?.startsWith(link.href) ? 'bg-brand-50 text-brand-700' : 'text-gray-700 hover:bg-gray-50 hover:text-brand-700'}`}>{link.label}</Link>)}</div></div>}</div>;
        })}
        {isAdmin && <button type="button" onClick={() => { setDraftItems(menuItems); setEditing(true); }} className="hidden whitespace-nowrap rounded-lg border border-white/60 bg-white/30 px-2.5 py-1.5 text-xs font-semibold text-brand-700 hover:bg-white/60 xl:block">메뉴 편집</button>}
      </nav>

      {isAdmin && editing && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-gray-950/50 p-4 backdrop-blur-[2px]"><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl"><div className="border-b border-gray-100 px-6 py-5"><h2 className="text-lg font-bold text-gray-900">메뉴 분류 편집</h2><p className="mt-1 text-xs text-gray-500">카테고리를 선택하고 화살표로 같은 카테고리 안의 순서를 변경하세요.</p></div><div className="space-y-2 p-6">{groupOrder.flatMap((key) => draftItems.filter((item) => item.group_key === key).sort((a, b) => a.sort_order - b.sort_order)).map((item) => <div key={item.href} className="grid grid-cols-[1fr_150px_auto] items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 p-3"><span className="text-sm font-semibold text-gray-800">{item.label}</span><select value={item.group_key} onChange={(event) => setDraftItems((current) => current.map((draft) => draft.href === item.href ? { ...draft, group_key: event.target.value as GroupKey, sort_order: 999 } : draft))} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400">{groupOrder.map((groupKey) => <option key={groupKey} value={groupKey}>{groupLabels[groupKey]}</option>)}</select><div className="flex gap-1"><button type="button" onClick={() => moveDraft(item.href, -1)} className="rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm text-gray-600 hover:bg-gray-100" aria-label={`${item.label} 위로`}>↑</button><button type="button" onClick={() => moveDraft(item.href, 1)} className="rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm text-gray-600 hover:bg-gray-100" aria-label={`${item.label} 아래로`}>↓</button></div></div>)}</div><div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50 px-6 py-4"><Button variant="gray" onClick={() => setEditing(false)}>취소</Button><Button disabled={saving} onClick={saveMenu}>{saving ? '저장 중...' : '저장'}</Button></div></div></div>}
    </>
  );
};

export default Nav;
