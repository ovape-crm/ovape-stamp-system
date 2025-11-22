'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { getCustomers } from '@/services/customerService';
import { CustomerType } from '@/app/_types/customer.types';
import { formatPhoneNumber } from '@/app/_utils/utils';

interface CustomerSelectorProps {
  value: string | null;
  onChange: (customerId: string | null, customer: CustomerType | null) => void;
  error?: string;
  required?: boolean;
}

export default function CustomerSelector({
  value,
  onChange,
  error,
  required = false,
}: CustomerSelectorProps) {
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState<CustomerType[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerType | null>(
    null
  );
  const searchRef = useRef<HTMLDivElement>(null);

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
      const results = await getCustomers({
        target: 'all',
        keyword: keyword.trim(),
      });
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

  // value가 변경되면 선택된 고객 정보 업데이트
  // value가 null이면 선택 해제
  useEffect(() => {
    if (!value && selectedCustomer) {
      setSelectedCustomer(null);
      setSearchKeyword('');
    }
    // value가 있지만 selectedCustomer가 없는 경우는 onChange에서 처리됨
  }, [value, selectedCustomer]);

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
        <div className="relative">
          <input
            type="text"
            className="w-full rounded border border-brand-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
            placeholder="이름 또는 전화번호로 검색하세요"
            value={searchKeyword}
            onChange={(e) => {
              setSearchKeyword(e.target.value);
              // 검색어 변경 시 선택된 고객은 유지 (검색창은 검색용)
            }}
            onFocus={() => {
              // 고객이 선택되어 있지 않을 때만 검색 결과 표시
              if (!selectedCustomer && searchResults.length > 0) {
                setShowResults(true);
              }
            }}
          />
          {isSearching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-brand-300 border-t-brand-600 rounded-full animate-spin" />
            </div>
          )}
        </div>
        {!selectedCustomer && showResults && searchResults.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-brand-200 rounded-lg shadow-lg max-h-60 overflow-auto">
            {searchResults.map((customer) => (
              <div
                key={customer.id}
                className="px-4 py-3 cursor-pointer hover:bg-brand-50 transition-colors border-b border-brand-50 last:border-b-0"
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
            <div className="absolute z-50 w-full mt-1 bg-white border border-brand-200 rounded-lg shadow-lg p-4">
              <p className="text-sm text-gray-500 text-center">
                검색 결과가 없습니다.
              </p>
            </div>
          )}
        {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
      </div>

      {/* 선택된 고객 카드 */}
      {selectedCustomer && (
        <div className="bg-brand-50 rounded-lg border border-brand-200 p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-base font-semibold text-gray-900">
                  {selectedCustomer.name}
                </h3>
              </div>
              <p className="text-sm text-gray-700 mb-1">
                {formatPhoneNumber(selectedCustomer.phone)}
              </p>
              {selectedCustomer.note && (
                <p className="text-xs text-gray-600 mt-2 whitespace-pre-wrap">
                  <span className="font-medium">특이사항:</span>{' '}
                  {selectedCustomer.note}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={handleCustomerRemove}
              className="ml-2 text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="고객 선택 해제"
            >
              <svg
                className="w-5 h-5"
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
        </div>
      )}
    </div>
  );
}
