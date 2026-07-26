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
import { createPortal } from 'react-dom';

export type DropdownOption = {
  label: string;
  value: string | number;
};

interface DropdownContextType {
  isOpen: boolean;
  toggleDropdown: () => void;
  closeDropdown: () => void;
  selectedOption: DropdownOption | null;
  handleSelect: (option: DropdownOption) => void;
  focusedIndex: number | null;
  setFocusedIndex: (index: number | null) => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
  itemCount: number;
  setItemCount: (count: number) => void;
  disabled: boolean;
  controlledValue?: string | number;
}

const DropdownContext = createContext<DropdownContextType | null>(null);

interface DropdownProviderProps {
  children: React.ReactNode;
  disabled?: boolean;
  controlledValue?: string | number;
}

const DropdownProvider = ({
  children,
  disabled = false,
  controlledValue,
}: DropdownProviderProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedOption, setSelectedOption] = useState<DropdownOption | null>(
    null
  );

  // 외부 controlledValue가 변경되면 내부 selectedOption을 초기화
  useEffect(() => {
    if (controlledValue !== undefined) {
      if (selectedOption && selectedOption.value !== controlledValue) {
        setSelectedOption(null);
      }
    }
  }, [controlledValue]); // eslint-disable-line react-hooks/exhaustive-deps
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [itemCount, setItemCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
    setFocusedIndex(null);
  }, []);

  const toggleDropdown = useCallback(() => {
    if (disabled) return;
    if (isOpen) {
      closeDropdown();
    } else {
      setIsOpen(true);
      setFocusedIndex(0);
    }
  }, [isOpen, closeDropdown, disabled]);

  const handleSelect = useCallback(
    (option: DropdownOption) => {
      setSelectedOption(option);
      closeDropdown();
      setTimeout(() => {
        triggerRef.current?.focus();
      }, 0);
    },
    [closeDropdown]
  );

  // 외부 클릭 감지 (Portal로 렌더링된 content도 고려)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const isInsideDropdown =
        dropdownRef.current?.contains(target) ||
        contentRef.current?.contains(target);

      if (!isInsideDropdown) {
        closeDropdown();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [closeDropdown]);

  // ESC 키 처리
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        closeDropdown();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeDropdown]);

  // Arrow 키 네비게이션
  useEffect(() => {
    if (!isOpen || itemCount === 0) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.getAttribute('role') !== 'option') return;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setFocusedIndex((prev) => {
          if (prev === null) return 0;
          return prev < itemCount - 1 ? prev + 1 : 0;
        });
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
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
      selectedOption,
      handleSelect,
      focusedIndex,
      setFocusedIndex,
      triggerRef,
      contentRef,
      itemCount,
      setItemCount,
      disabled,
      controlledValue,
    }),
    [
      isOpen,
      toggleDropdown,
      closeDropdown,
      selectedOption,
      handleSelect,
      focusedIndex,
      itemCount,
      disabled,
      controlledValue,
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

const DropdownTrigger = ({
  children,
  compact = false,
}: {
  children: React.ReactNode;
  compact?: boolean;
}) => {
  const {
    toggleDropdown,
    isOpen,
    selectedOption,
    triggerRef,
    setFocusedIndex,
    itemCount,
    disabled,
  } = useDropdown();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleDropdown();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        toggleDropdown();
      } else {
        setFocusedIndex(0);
      }
    } else if (e.key === 'ArrowUp' && isOpen) {
      e.preventDefault();
      setFocusedIndex(itemCount > 0 ? itemCount - 1 : 0);
    }
  };

  return (
    <button
      ref={triggerRef}
      type="button"
      onClick={disabled ? undefined : toggleDropdown}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      className={`flex w-full items-center justify-between gap-2 rounded-lg border text-left shadow-sm outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500 ${
        compact
          ? 'h-11 border-gray-300 bg-white px-2.5 text-xs font-semibold text-gray-700'
          : 'border-brand-200 bg-white/70 px-3 py-1.5 text-xs font-medium text-brand-700 focus:ring-offset-2 sm:px-6 sm:py-2 sm:text-base'
      } ${
        disabled
          ? 'opacity-50 cursor-not-allowed'
          : compact
            ? 'cursor-pointer hover:border-brand-300 hover:bg-gray-50'
            : 'cursor-pointer hover:bg-brand-50 hover:border-brand-300'
      }`}
      aria-expanded={isOpen}
      aria-haspopup="listbox"
      aria-label="Select an option"
      aria-disabled={disabled}
    >
      <span className="truncate">
        {selectedOption ? selectedOption.label : children}
      </span>
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

const DropdownContent = ({
  children,
  compact = false,
}: {
  children: React.ReactNode;
  compact?: boolean;
}) => {
  const { isOpen, setItemCount, triggerRef, contentRef } = useDropdown();
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  // 아이템 개수 추적
  useEffect(() => {
    const items = Children.toArray(children).filter(
      (child) => isValidElement(child) && child.type === DropdownItem
    );
    setItemCount(items.length);
  }, [children, setItemCount]);

  // 자동으로 index를 주입
  const itemsWithIndex = useMemo(() => {
    const items = Children.toArray(children).filter(
      (child) => isValidElement(child) && child.type === DropdownItem
    );
    return Children.map(items, (child, index) => {
      if (isValidElement(child)) {
        return cloneElement(child, {
          ...(child.props as Record<string, unknown>),
          index,
        } as React.ComponentProps<typeof DropdownItem>);
      }
      return child;
    });
  }, [children]);

  // trigger 위치 계산 (Portal 사용)
  useEffect(() => {
    if (!isOpen || !triggerRef.current) {
      setPosition(null);
      return;
    }

    const updatePosition = () => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setPosition({
          top: rect.bottom + 8,
          left: rect.left,
          width: rect.width,
        });
      }
    };

    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, triggerRef]);

  if (!isOpen) return null;
  if (!position) return null;

  const content = (
    <div
      ref={contentRef}
      className={`fixed z-[3000] overflow-hidden rounded-lg border bg-white opacity-100 shadow-lg transition-all duration-200 translate-y-0 ${
        compact ? "border-gray-300" : "border-brand-200"
      }`}
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        width: `${position.width}px`,
      }}
      role="listbox"
    >
      <div
        className={`${compact ? "py-0.5" : "py-1"} max-h-[300px] overflow-auto`}
      >
        {itemsWithIndex}
      </div>
    </div>
  );

  if (typeof window === 'undefined') return null;
  return createPortal(content, document.body);
};

const DropdownItem = ({
  option,
  onSelect,
  index = -1,
  compact = false,
}: {
  option: DropdownOption;
  onSelect?: (option: DropdownOption) => void;
  index?: number;
  compact?: boolean;
}) => {
  const {
    handleSelect,
    selectedOption,
    focusedIndex,
    setFocusedIndex,
    isOpen,
    controlledValue,
  } = useDropdown();
  const itemRef = useRef<HTMLDivElement>(null);

  const selectedValue = selectedOption?.value ?? controlledValue;
  const isSelected = selectedValue === option.value;
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

  return (
    <div
      ref={itemRef}
      role="option"
      tabIndex={isFocused ? 0 : -1}
      aria-selected={isSelected}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setFocusedIndex(index)}
      className={`${
        compact
          ? "px-2.5 py-1.5 text-xs text-gray-700 focus:bg-gray-100"
          : "px-4 py-1.5 text-sm text-brand-700 focus:bg-brand-100 focus:ring-2 focus:ring-brand-500 focus:ring-inset sm:px-6 sm:py-2 sm:text-base"
      } cursor-pointer outline-none transition-colors ${
        isSelected
          ? compact
            ? "bg-gray-100 font-semibold text-brand-700"
            : "bg-brand-50 font-medium text-brand-900"
          : compact
            ? "hover:bg-gray-50"
            : "hover:bg-brand-50"
      } ${
        isFocused && !isSelected
          ? compact
            ? "bg-gray-100"
            : "bg-brand-100"
          : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <span>{option.label}</span>
        {isSelected && (
          <svg
            className={`${compact ? "h-3.5 w-3.5" : "h-5 w-5"} flex-shrink-0 text-brand-600`}
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
