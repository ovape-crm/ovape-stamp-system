'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export type DeviceSearchOption = {
  id: string;
  label: string;
  searchText: string;
};

export default function DeviceSearchSelect({
  options,
  value,
  onChange,
}: {
  options: DeviceSearchOption[];
  value: string;
  onChange: (deviceId: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.id === value);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredOptions = useMemo(
    () => options.filter((option) => !normalizedQuery || option.searchText.toLocaleLowerCase().includes(normalizedQuery)),
    [normalizedQuery, options],
  );

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  const select = (deviceId: string) => {
    onChange(deviceId);
    setQuery('');
    setIsOpen(false);
  };

  return <div ref={containerRef} className="relative">
    <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="device-search">기기 선택</label>
    <div className="relative">
      <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true"><circle cx="11" cy="11" r="6" /><path strokeLinecap="round" d="m16 16 4 4" /></svg>
      <input
        id="device-search"
        value={isOpen ? query : selected?.label ?? ''}
        onFocus={() => { setQuery(''); setIsOpen(true); }}
        onChange={(event) => { setQuery(event.target.value); setIsOpen(true); }}
        placeholder="기기명으로 검색하세요"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls="device-search-options"
        className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-10 text-sm font-medium text-gray-900 shadow-sm outline-none transition placeholder:font-normal placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      />
      {value && <button type="button" onClick={() => select('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 transition hover:text-gray-700" aria-label="선택한 기기 지우기">×</button>}
    </div>
    {isOpen && <div id="device-search-options" role="listbox" className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-gray-300 bg-white py-1 shadow-lg">
      {filteredOptions.length ? filteredOptions.map((option) => {
        const isSelected = option.id === value;
        return <button key={option.id} type="button" role="option" aria-selected={isSelected} onClick={() => select(option.id)} className={`flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2 text-left text-sm transition ${isSelected ? 'bg-gray-100 font-semibold text-gray-900' : 'text-gray-700 hover:bg-gray-50'}`}>
          <span className="truncate">{option.label}</span>
          {isSelected && <svg className="h-4 w-4 shrink-0 text-brand-600" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 0 1 0 1.414l-8 8a1 1 0 0 1-1.414 0l-4-4a1 1 0 1 1 1.414-1.414L8 12.586l7.293-7.293a1 1 0 0 1 1.414 0Z" clipRule="evenodd" /></svg>}
        </button>;
      }) : <p className="px-3 py-6 text-center text-sm text-gray-500">검색 결과가 없습니다.</p>}
    </div>}
  </div>;
}
