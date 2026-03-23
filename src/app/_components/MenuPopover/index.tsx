'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type MenuPopoverItem = {
  label: string;
  onClick: () => void;
};

interface MenuPopoverProps {
  items: MenuPopoverItem[];
}

export default function MenuPopover({ items }: MenuPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const updatePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPosition({
      top: rect.bottom + window.scrollY + 6,
      right: window.innerWidth - rect.right - window.scrollX,
    });
  };

  const toggle = () => {
    if (!isOpen) updatePosition();
    setIsOpen((prev) => !prev);
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !popoverRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        className="p-1.5 rounded-lg font-medium shadow-sm transition-colors bg-white/70 border border-brand-200 text-brand-700 hover:bg-brand-50 hover:border-brand-300"
        aria-label="메뉴"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {isOpen &&
        position &&
        typeof window !== 'undefined' &&
        createPortal(
          <div
            ref={popoverRef}
            className="fixed z-[3000] min-w-[140px] rounded-lg shadow-lg bg-white border border-brand-100 overflow-hidden py-1"
            style={{ top: `${position.top}px`, right: `${position.right}px` }}
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  item.onClick();
                  setIsOpen(false);
                }}
                className="w-full text-left px-4 py-2 text-sm text-brand-700 hover:bg-brand-50 transition-colors"
              >
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
