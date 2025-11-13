'use client';

import { useCustomers } from '@/app/_hooks/useCustomers';
import CustomerList from './_components/CustomerList';
import SearchBox from './_components/SearchBox';
import { useModal } from '@/app/contexts/ModalContext';
import CustomerCreateModal from './_components/CustomerCreateModal';
import { createCustomer } from '@/services/customerService';
import toast from 'react-hot-toast';
import { useState } from 'react';
import Button from '@/app/_components/Button';
import { addStamp } from '@/services/stampService';
import { PaymentTypeEnumType } from '@/app/_enums/enums';

export default function CustomersPage() {
  // ========================================================================
  // Hooks 및 상태
  // ========================================================================
  const { customers, isLoading, error, search, refresh, hasQuery } =
    useCustomers();
  const { open, close } = useModal();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ========================================================================
  // 고객 추가 핸들러
  // ========================================================================
  const handleCustomerSubmit = async (values: {
    name: string;
    phone: string;
    gender: 'male' | 'female';
    note?: string;
    isStampAdd: boolean;
    stampAmount?: number;
    stampPaymentType?: PaymentTypeEnumType['value'];
    stampNote?: string;
  }) => {
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

      // 2. 스탬프 추가 (선택 사항)
      if (values.isStampAdd) {
        if (
          !values.stampAmount ||
          values.stampAmount <= 0 ||
          !values.stampPaymentType
        ) {
          toast.error('스탬프 정보를 모두 입력해주세요.');
          return;
        }
        try {
          await addStamp(
            data.id,
            Number(values.stampAmount),
            values.stampNote ?? '',
            values.stampPaymentType
          );
          toast.success('스탬프가 적립되었습니다.');
        } catch (stampError) {
          console.error('스탬프 추가 실패:', stampError);
          toast.error(
            stampError instanceof Error
              ? stampError.message
              : '스탬프 적립에 실패했습니다.'
          );
          throw stampError;
        }
      }

      close();
      refresh();
    } catch (err) {
      console.error('고객 추가 실패:', err);
      if (err instanceof Error && err.message === 'DUPLICATE_CUSTOMER') {
        toast.error('이미 존재하는 전화번호입니다.');
      } else {
        toast.error(
          err instanceof Error ? err.message : '고객 추가에 실패했습니다.'
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

      {/* 고객 목록 또는 안내 메시지 */}
      {!hasQuery ? (
        <div className="bg-white rounded-lg border border-brand-100 p-10 text-center text-gray-500">
          검색어를 입력해주세요.
        </div>
      ) : (
        <CustomerList
          customers={customers}
          isLoading={isLoading}
          error={error}
          onUpdate={refresh}
        />
      )}
    </div>
  );
}
