'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  Children,
  cloneElement,
  isValidElement,
} from 'react';

export type DropdownOption = {
  label: string;
  value: string | number;
};

interface DropdownContextType {
  isOpen: boolean;
  toggleDropdown: () => void;
  closeDropdown: () => void;
  openDropdown: () => void;
  options: DropdownOption[];
  selectedOption: DropdownOption | null;
  handleSelect: (option: DropdownOption) => void;
  focusedIndex: number | null;
  setFocusedIndex: (index: number | null) => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
  itemCount: number;
  setItemCount: (count: number) => void;
}

const DropdownContext = createContext<DropdownContextType | null>(null);

const DropdownProvider = ({ children }: { children: React.ReactNode }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedOption, setSelectedOption] = useState<DropdownOption | null>(
    null
  );
  const [options, setOptions] = useState<DropdownOption[]>([]);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [itemCount, setItemCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
  }, []);

  const openDropdown = useCallback(() => {
    setIsOpen(true);
    setFocusedIndex(0);
  }, []);

  const toggleDropdown = useCallback(() => {
    if (isOpen) {
      setIsOpen(false);
      setFocusedIndex(null);
    } else {
      setIsOpen(true);
      setFocusedIndex(0);
    }
  }, [isOpen]);

  const handleSelect = useCallback(
    (option: DropdownOption) => {
      setSelectedOption(option);
      closeDropdown();
      setFocusedIndex(null);
      // 포커스를 다시 trigger로 이동
      setTimeout(() => {
        triggerRef.current?.focus();
      }, 0);
    },
    [closeDropdown]
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        closeDropdown();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [closeDropdown]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeDropdown();
        setFocusedIndex(null);
        triggerRef.current?.focus();
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeDropdown]);

  // Arrow 키 네비게이션 (dropdown이 열려있을 때, 아이템에서만 처리)
  useEffect(() => {
    if (!isOpen || itemCount === 0) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const isItem = target.getAttribute('role') === 'option';

      // 아이템에서만 처리 (trigger는 자체 handler에서 처리)
      if (!isItem) return;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        // 다음 아이템으로
        setFocusedIndex((prev) => {
          if (prev === null) return 0;
          return prev < itemCount - 1 ? prev + 1 : 0;
        });
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        // 이전 아이템으로
        setFocusedIndex((prev) => {
          if (prev === null) return itemCount - 1;
          return prev > 0 ? prev - 1 : itemCount - 1;
        });
      } else if (event.key === 'Home') {
        event.preventDefault();
        setFocusedIndex(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        setFocusedIndex(itemCount - 1);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, itemCount]);

  const value = useMemo(
    () => ({
      isOpen,
      toggleDropdown,
      closeDropdown,
      openDropdown,
      selectedOption,
      options,
      setOptions,
      handleSelect,
      focusedIndex,
      setFocusedIndex,
      triggerRef,
      contentRef,
      itemCount,
      setItemCount,
    }),
    [
      isOpen,
      toggleDropdown,
      closeDropdown,
      openDropdown,
      selectedOption,
      options,
      setOptions,
      handleSelect,
      focusedIndex,
      itemCount,
    ]
  );

  return (
    <DropdownContext.Provider value={value}>
      <div ref={dropdownRef} className="relative">
        {children}
      </div>
    </DropdownContext.Provider>
  );
};

export const useDropdown = () => {
  const context = useContext(DropdownContext);
  if (!context)
    throw new Error('useDropdown must be used within a DropdownProvider');
  return context;
};

const DropdownTrigger = ({ children }: { children: React.ReactNode }) => {
  const {
    toggleDropdown,
    isOpen,
    selectedOption,
    triggerRef,
    setFocusedIndex,
    itemCount,
  } = useDropdown();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleDropdown();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        toggleDropdown();
      } else {
        // 이미 열려있으면 첫 번째 아이템으로 포커스
        setFocusedIndex(0);
      }
    } else if (e.key === 'ArrowUp' && isOpen) {
      e.preventDefault();
      setFocusedIndex(itemCount > 0 ? itemCount - 1 : 0);
    }
  };

  const triggerClasses = [
    'w-full',
    'rounded-lg',
    'font-medium',
    'transition-colors',
    'shadow-sm',
    'outline-none',
    'focus:ring-2',
    'focus:ring-offset-2',
    'focus:ring-brand-500',
    'focus:border-brand-500',
    'cursor-pointer',
    'bg-white/70',
    'border',
    'border-brand-200',
    'text-brand-700',
    'hover:bg-brand-50',
    'hover:border-brand-300',
    'px-6',
    'py-2',
    'text-base',
    'flex',
    'items-center',
    'justify-between',
    'gap-2',
    'text-left',
  ].join(' ');

  return (
    <button
      ref={triggerRef}
      type="button"
      onClick={toggleDropdown}
      onKeyDown={handleKeyDown}
      className={triggerClasses}
      aria-expanded={isOpen}
      aria-haspopup="listbox"
      aria-label="Select an option"
    >
      <span>{selectedOption ? selectedOption.label : children}</span>
      <svg
        className={`w-4 h-4 transition-transform flex-shrink-0 ${
          isOpen ? 'rotate-180' : ''
        }`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 9l-7 7-7-7"
        />
      </svg>
    </button>
  );
};

const DropdownContent = ({ children }: { children: React.ReactNode }) => {
  const { isOpen, contentRef, setItemCount } = useDropdown();

  // 자동으로 index를 주입하고 아이템 개수 추적
  const itemsWithIndex = useMemo(() => {
    const items = Children.toArray(children).filter(
      (child) => isValidElement(child) && child.type === DropdownItem
    );
    setItemCount(items.length);
    return Children.map(items, (child, index) => {
      if (isValidElement(child)) {
        return cloneElement(child, {
          ...(child.props as Record<string, unknown>),
          index,
        } as React.ComponentProps<typeof DropdownItem>);
      }
      return child;
    });
  }, [children, setItemCount]);

  const contentClasses = [
    'absolute',
    'z-50',
    'w-full',
    'mt-2',
    'rounded-lg',
    'shadow-lg',
    'bg-white',
    'border',
    'border-brand-200',
    'overflow-hidden',
    'transition-all',
    'duration-200',
    isOpen
      ? 'opacity-100 translate-y-0'
      : 'opacity-0 -translate-y-2 pointer-events-none',
  ].join(' ');

  if (!isOpen) return null;

  return (
    <div ref={contentRef} className={contentClasses} role="listbox">
      <div className="py-1">{itemsWithIndex}</div>
    </div>
  );
};

const DropdownItem = ({
  option,
  onSelect,
  index = -1,
}: {
  option: DropdownOption;
  onSelect?: (option: DropdownOption) => void;
  index?: number;
}) => {
  const {
    handleSelect,
    selectedOption,
    focusedIndex,
    setFocusedIndex,
    isOpen,
  } = useDropdown();
  const itemRef = useRef<HTMLDivElement>(null);

  const isSelected = selectedOption?.value === option.value;
  const isFocused = index >= 0 && focusedIndex === index;

  // 포커스된 아이템으로 스크롤
  useEffect(() => {
    if (isFocused && isOpen && itemRef.current) {
      itemRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      itemRef.current.focus();
    }
  }, [isFocused, isOpen]);

  const handleClick = () => {
    handleSelect(option);
    onSelect?.(option);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  const itemClasses = [
    'px-6',
    'py-2',
    'text-base',
    'cursor-pointer',
    'transition-colors',
    'text-brand-700',
    'outline-none',
    'focus:bg-brand-100',
    'focus:ring-2',
    'focus:ring-brand-500',
    'focus:ring-inset',
    isSelected ? 'bg-brand-50 text-brand-900 font-medium' : 'hover:bg-brand-50',
    isFocused && !isSelected ? 'bg-brand-100' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={itemRef}
      role="option"
      tabIndex={isFocused ? 0 : -1}
      aria-selected={isSelected}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setFocusedIndex(index)}
      className={itemClasses}
    >
      <div className="flex items-center justify-between">
        <span>{option.label}</span>
        {isSelected && (
          <svg
            className="w-5 h-5 text-brand-600 flex-shrink-0"
            fill="currentColor"
            viewBox="0 0 20 20"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </div>
    </div>
  );
};

DropdownProvider.Trigger = DropdownTrigger;
DropdownProvider.Content = DropdownContent;
DropdownProvider.Item = DropdownItem;

export { DropdownProvider as Dropdown };
