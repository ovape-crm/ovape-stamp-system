'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCustomer } from '@/app/_hooks/useCustomer';
import { useLogs } from '@/app/_hooks/useLogs';
import CustomerInfo from './_components/CustomerInfo';
import StampSection from './_components/StampSection';
import LogList from './_components/LogList';
import CustomerEditModal from './_components/CustomerEditModal';
import Loading from '@/app/_components/Loading';
import toast from 'react-hot-toast';
import { useModal } from '@/app/contexts/ModalContext';
import { updateCustomer, deleteCustomer } from '@/services/customerService';
import Button from '@/app/_components/Button';

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const customerId = params.id as string;
  const { open, close } = useModal();
  const { customer, isLoading, error, refresh } = useCustomer(customerId);
  const {
    logs,
    isLoading: logsLoading,
    error: logsError,
    refresh: refreshLogs,
    loadMore,
    hasMore,
  } = useLogs(customerId);

  const handleUpdate = () => {
    refresh();
    refreshLogs();
  };

  const handleEditCustomer = async (values: {
    name: string;
    phone: string;
    gender: 'male' | 'female';
    note?: string;
  }) => {
    try {
      await updateCustomer(customerId, values);
      toast.success('고객 정보가 수정되었습니다.');
      close();
      handleUpdate();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      if (error.message === 'DUPLICATE_CUSTOMER') {
        toast.error('이미 존재하는 전화번호입니다.');
      } else {
        toast.error('고객 정보 수정에 실패했습니다.');
      }
    }
  };

  const handleDeleteCustomer = async () => {
    try {
      await deleteCustomer(customerId);
      toast.success('고객 정보가 삭제되었습니다.');
      close();
      handleUpdate();
      router.push('/customers');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      if (error.message === 'NOT_FOUND_CUSTOMER') {
        toast.error('고객 정보를 찾을 수 없습니다.');
      } else {
        toast.error('고객 정보 삭제에 실패했습니다.');
      }
      toast.error('고객 정보 삭제에 실패했습니다.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loading size="lg" text="고객 정보 불러오는 중..." />
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-center">
          <p className="text-red-500 mb-4">
            {error || '고객을 찾을 수 없습니다.'}
          </p>
          <button
            onClick={() => router.push('/customers')}
            className="px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600"
          >
            목록으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  const stampCount = customer.stamps?.[0]?.count || 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-10">
      {/* 헤더 */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-brand-600 to-brand-700 bg-clip-text text-transparent">
          고객 상세
        </h1>
        <Button onClick={() => router.push('/customers')} variant="tertiary">
          ← 목록으로
        </Button>
      </div>

      {/* 메인 컨텐츠 */}
      <div className="flex gap-6 mb-6 items-stretch">
        <div className="flex-1 self-stretch">
          <CustomerInfo
            customer={customer}
            onEdit={() => {
              if (customer) {
                open({
                  content: (
                    <CustomerEditModal
                      customer={customer}
                      onSubmit={handleEditCustomer}
                      onDelete={handleDeleteCustomer}
                      onCancel={close}
                    />
                  ),
                  options: { dismissOnBackdrop: false, dismissOnEsc: true },
                });
              }
            }}
          />
        </div>
        <StampSection
          stampCount={stampCount}
          target={{
            id: customerId,
            name: customer.name,
            phone: customer.phone,
          }}
          onUpdate={handleUpdate}
        />
      </div>

      {/* 로그 섹션 */}
      <div className="mb-10">
        <LogList logs={logs} isLoading={logsLoading} error={logsError} />
        <div className="mt-4 flex justify-center">
          {logsLoading ? null : hasMore ? (
            <Button
              onClick={async () => {
                const added = await loadMore();
                if (added > 0) toast.success(`${added}개 더 불러오기 성공!`);
              }}
              variant="secondary"
              size="sm"
            >
              더 불러오기
            </Button>
          ) : (
            <div className="text-xs text-gray-400">마지막 페이지입니다.</div>
          )}
        </div>
      </div>
    </div>
  );
}
