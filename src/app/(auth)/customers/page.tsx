'use client';

import { useCustomers } from '@/_hooks/useCustomers';
import CustomerList from './_components/CustomerList';
import SearchBox from './_components/SearchBox';
import { useModal } from '@/app/contexts/ModalContext';
import CustomerCreateModal from './_components/CustomerCreateModal';
import { createCustomer } from '@/services/customerService';
import toast from 'react-hot-toast';
import { useState } from 'react';

export default function CustomersPage() {
  const { customers, isLoading, error, search, refresh, hasQuery } =
    useCustomers();
  const { open, close } = useModal();
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-10 space-y-4">
      <SearchBox onSearch={search} />

      <div className="flex justify-end">
        <button
          className="px-3 py-2 text-sm font-medium text-white bg-brand-500 rounded hover:bg-brand-600 transition-colors"
          onClick={() => {
            setIsSubmitting(false); // 모달이 열릴 때 초기화
            open({
              content: (
                <CustomerCreateModal
                  onCancel={close}
                  isSubmitting={isSubmitting}
                  onSubmit={async (values) => {
                    try {
                      setIsSubmitting(true);
                      await createCustomer({
                        name: values.name,
                        phone: values.phone,
                        gender: values.gender,
                        note: values.note,
                      });
                      toast.success('고객이 추가되었습니다.');
                      close();
                      refresh();
                    } catch (err) {
                      console.error('고객 추가 실패:', err);
                      if (
                        err instanceof Error &&
                        err.message === 'DUPLICATE_CUSTOMER'
                      ) {
                        toast.error('이미 존재하는 전화번호입니다.');
                      } else {
                        toast.error(
                          err instanceof Error
                            ? err.message
                            : '고객 추가에 실패했습니다.'
                        );
                      }
                    } finally {
                      setIsSubmitting(false);
                    }
                  }}
                />
              ),
              options: { dismissOnBackdrop: false, dismissOnEsc: true },
            });
          }}
        >
          고객 추가
        </button>
      </div>

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
