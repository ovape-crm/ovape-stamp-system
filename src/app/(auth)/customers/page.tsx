'use client';

import { useCustomers } from '@/app/_domains/_customer/_hooks/useCustomers';
import CustomerList from './_components/CustomerList';
import SearchBox from './_components/SearchBox';
import { useModal } from '@/app/_contexts/ModalContext';
import CustomerCreateModal from './_components/CustomerCreateModal';
import { createCustomer } from '@/app/_domains/_customer/_services/customerService';
import toast from 'react-hot-toast';
import { useState } from 'react';
import Button from '@/app/_components/Button';
import { addStamp } from '@/app/_domains/_stamp/_services/stampService';
import { useQueryClient } from '@tanstack/react-query';
import { customerKeys } from '@/app/_domains/_customer/_queryKeys/customerKeys';
import { logKeys } from '@/app/_domains/_log/_queryKeys/logKeys';
import type { CustomerCreateValues } from './_components/CustomerCreateModal';

export default function CustomersPage() {
  // ========================================================================
  // Hooks 및 상태
  // ========================================================================
  const {
    customers,
    isLoading,
    error,
    search,
    loadMore,
    hasMore,
    isLoadingMore,
    totalCount,
    sortBy,
    sortOrder,
    setSort,
  } = useCustomers();
  const { open, close } = useModal();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ========================================================================
  // 고객 추가 핸들러
  // ========================================================================
  const handleCustomerSubmit = async (values: CustomerCreateValues) => {
    try {
      setIsSubmitting(true);

      // 1. 고객 생성
      const data = await createCustomer({
        name: values.name,
        phone: values.phone,
        gender: values.gender,
        note: values.note,
      });
      toast.success('고객이 추가되었습니다.');

      // 2. 출고 이력 추가 (선택 사항)
      if (values.isStampAdd && values.stampLog) {
        const stampLog = values.stampLog;
        const amount = stampLog.amount;
        try {
          await addStamp(
            data.id,
            amount,
            stampLog.note,
            stampLog.paymentType,
            stampLog.logMeta,
          );
          toast.success(amount === 0 ? '미적립으로 기록되었습니다.' : `스탬프 ${amount}개 적립 완료!`);
        } catch (stampError) {
          console.error('스탬프 추가 실패:', stampError);
          toast.error(
            stampError instanceof Error
              ? stampError.message
              : '스탬프 적립에 실패했습니다.',
          );
          throw stampError;
        }
      }

      close();
      queryClient.invalidateQueries({ queryKey: customerKeys.lists() });
      queryClient.invalidateQueries({ queryKey: logKeys.lists() });
    } catch (err) {
      console.error('고객 추가 실패:', err);
      if (err instanceof Error && err.message === 'DUPLICATE_CUSTOMER') {
        toast.error('이미 존재하는 전화번호입니다.');
      } else {
        toast.error(
          err instanceof Error ? err.message : '고객 추가에 실패했습니다.',
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // ========================================================================
  // 렌더링
  // ========================================================================

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-10 space-y-4">
      {/* 검색 박스 */}
      <SearchBox onSearch={search} />

      {/* 고객 추가 버튼 */}
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={() => {
            setIsSubmitting(false);
            open({
              content: (
                <CustomerCreateModal
                  onCancel={close}
                  isSubmitting={isSubmitting}
                  onSubmit={handleCustomerSubmit}
                />
              ),
              options: { dismissOnBackdrop: false, dismissOnEsc: true },
            });
          }}
        >
          고객 추가
        </Button>
      </div>

      {/* 고객 목록 */}
      <CustomerList
        customers={customers}
        isLoading={isLoading}
        error={error}
        onUpdate={() =>
          queryClient.invalidateQueries({ queryKey: customerKeys.lists() })
        }
        loadMore={loadMore}
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        totalCount={totalCount}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={setSort}
      />
    </div>
  );
}
