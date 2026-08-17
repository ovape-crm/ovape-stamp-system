'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { getCustomers } from '@/app/_domains/_customer/_services/customerService';
import { CustomerType } from '@/app/_domains/_customer/_types/customer.types';
import { formatPhoneNumber } from '@/app/_utils/utils';

interface CustomerSelectorProps {
  value: string | null;
  onChange: (customerId: string | null, customer: CustomerType | null) => void;
  error?: string;
  required?: boolean;
  initialCustomer?: CustomerType | null;
}

export default function CustomerSelector({
  value,
  onChange,
  error,
  required = false,
  initialCustomer,
}: CustomerSelectorProps) {
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState<CustomerType[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerType | null>(
    null,
  );
  const searchRef = useRef<HTMLDivElement>(null);

  // initialCustomer가 변경되면 선택된 고객 정보 업데이트
  useEffect(() => {
    if (initialCustomer) {
      setSelectedCustomer(initialCustomer);
    } else if (!value) {
      setSelectedCustomer(null);
    }
  }, [initialCustomer, value]);

  // ========================================================================
  // 고객 검색 기능
  // ========================================================================
  const searchCustomers = useCallback(async (keyword: string) => {
    if (!keyword.trim()) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    setIsSearching(true);
    try {
      const searchParams = {
        target: 'all' as const,
        keyword: keyword.trim(),
        sortBy: 'name' as const,
        sortOrder: 'asc' as const,
      };

      // 검색 결과 전체를 먼저 세지 않고 상위 20명만 조회합니다.
      const results = await getCustomers(20, 0, searchParams);
      setSearchResults(results);
      setShowResults(results.length > 0);
    } catch (error) {
      console.error('고객 검색 실패:', error);
      setSearchResults([]);
      setShowResults(false);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // 검색어 변경 시 디바운스 처리
  useEffect(() => {
    const timer = setTimeout(() => {
      searchCustomers(searchKeyword);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchKeyword, searchCustomers]);

  // 외부 클릭 시 결과 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        setShowResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ========================================================================
  // 이벤트 핸들러
  // ========================================================================

  // 고객 선택 핸들러
  const handleCustomerSelect = (customer: CustomerType) => {
    setSelectedCustomer(customer);
    // customer.id를 string으로 확실히 변환
    const customerId = String(customer.id);
    onChange(customerId, customer);
    setSearchKeyword(''); // 검색창 비우기
    setShowResults(false);
  };

  // 고객 선택 해제 핸들러
  const handleCustomerRemove = () => {
    setSelectedCustomer(null);
    onChange(null, null);
    setSearchKeyword('');
  };

  return (
    <div className="space-y-3">
      {/* 고객 검색 */}
      <div ref={searchRef} className="relative">
        <label className="block text-sm font-medium mb-1">
          고객 검색 {required && <span className="text-rose-600">*</span>}
        </label>
        {selectedCustomer ? (
          <div className="flex h-10 w-full items-center rounded-lg border border-gray-300 bg-white px-3 shadow-sm">
            <div className="flex min-w-0 flex-1 items-center gap-3 text-sm">
              <span className="truncate font-semibold text-gray-900">
                {selectedCustomer.name}
              </span>
              <span className="shrink-0 text-gray-600">
                {formatPhoneNumber(selectedCustomer.phone)}
              </span>
            </div>
            <button
              type="button"
              onClick={handleCustomerRemove}
              className="ml-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
              aria-label="고객 선택 해제"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        ) : (
          <div className="relative">
            <input
              type="text"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition hover:border-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              placeholder="이름 또는 전화번호로 검색하세요"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              onFocus={() => {
                if (searchResults.length > 0) setShowResults(true);
              }}
            />
            {isSearching && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-300 border-t-brand-600" />
              </div>
            )}
          </div>
        )}
        {!selectedCustomer && showResults && searchResults.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto">
            {searchResults.map((customer) => (
              <div
                key={customer.id}
                className="px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0"
                onClick={() => handleCustomerSelect(customer)}
              >
                <p className="text-sm font-medium text-gray-900">
                  {customer.name}
                </p>
                <p className="text-xs text-gray-600">
                  {formatPhoneNumber(customer.phone)}
                </p>
              </div>
            ))}
          </div>
        )}
        {!selectedCustomer &&
          showResults &&
          searchResults.length === 0 &&
          searchKeyword.trim() &&
          !isSearching && (
            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-4">
              <p className="text-sm text-gray-500 text-center">
                검색 결과가 없습니다.
              </p>
            </div>
          )}
        {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
      </div>

    </div>
  );
}
