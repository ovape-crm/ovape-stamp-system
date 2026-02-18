'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCustomer } from '@/app/_hooks/useCustomer';
import { useLogsByCustomerId } from '@/app/_hooks/useLogsByCustomerId';
import NotFoundView from '@/app/_components/NotFoundView';
import CustomerInfo from './_components/CustomerInfo';
import StampSection from './_components/StampSection';
import CustomerEditModal from './_components/CustomerEditModal';
import Loading from '@/app/_components/Loading';
import toast from 'react-hot-toast';
import { useModal } from '@/app/_contexts/ModalContext';
import {
  updateCustomer,
  deleteCustomer,
} from '@/app/_services/customerService';
import Button from '@/app/_components/Button';
import { useUser } from '@/app/_contexts/UserContext';
import { useState } from 'react';
import { LogCategoryEnum, LogCategoryEnumType } from '@/app/_enums/enums';
import CustomersDetailStampsHistories from './_components/CustomersDetailStampsHistories';
import CustomersDetailUpdateHistories from './_components/CustomersDetailUpdateHistories';
import CustomersDetailRemarkHistories from './_components/CustomersDetailRemarkHistories';
import CustomerAfterServices from './_components/CustomerAfterServices';
import RemarkLogCreateModal from './_components/RemarkLogCreateModal';
import { createLog } from '@/app/_services/logService';

const PAGE_SIZE = 10;

export default function CustomerDetailPage() {
  const { isAdmin } = useUser();
  const params = useParams();
  const router = useRouter();
  const customerId = params.id as string;
  const { open, close } = useModal();
  const { customer, isLoading, error, refresh } = useCustomer(customerId);
  const [refreshKey, setRefreshKey] = useState(0);

  const [logCategory, setLogCategory] = useState<LogCategoryEnumType['value']>(
    LogCategoryEnum.STAMP.value,
  );

  const {
    logs,
    isLoading: logsLoading,
    error: logsError,
    refresh: refreshLogs,
    loadMore,
    hasMore,
  } = useLogsByCustomerId(customerId, PAGE_SIZE, logCategory);

  const {
    logs: remarkLogs,
    isLoading: remarkLogsLoading,
    error: remarkLogsError,
    refresh: refreshRemarkLogs,
    loadMore: loadMoreRemarks,
    hasMore: hasMoreRemarks,
  } = useLogsByCustomerId(customerId, PAGE_SIZE, LogCategoryEnum.REMARK.value);

  const handleUpdate = () => {
    refresh();
    refreshLogs();
    refreshRemarkLogs();
    setRefreshKey((prev) => prev + 1);
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
    if (!isAdmin) {
      return;
    }
    try {
      await deleteCustomer(customerId);
      toast.success('고객 정보가 삭제되었습니다.');
      close();
      router.push('/customers');
      handleUpdate();
    } catch {
      toast.error('고객 정보 삭제에 실패했습니다.');
    }
  };

  const handleCreateRemarkLog = async (note: string) => {
    try {
      await createLog(
        LogCategoryEnum.REMARK.value,
        customerId,
        'create-remark',
        note,
      );
      toast.success('특이사항 이력이 추가되었습니다.');
      close();
      refreshRemarkLogs();
    } catch (error) {
      console.error('Failed to create remark log:', error);
      toast.error('특이사항 이력 추가에 실패했습니다.');
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
    return <NotFoundView full={false} />;
  }

  const stampCount = customer.stamps?.[0]?.count || 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-10">
      {/* 헤더 */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-brand-600 to-brand-700 bg-clip-text text-transparent">
          고객 상세
        </h1>
        <Button onClick={() => router.push('/customers')} variant="tertiary">
          ← 목록으로
        </Button>
      </div>

      {/* 메인 컨텐츠 */}
      <div className="flex flex-col md:flex-row gap-4 md:gap-6 mb-6 items-stretch">
        <div className="flex-1 self-stretch">
          <CustomerInfo
            customer={customer}
            onEdit={() => {
              if (customer) {
                open({
                  content: (
                    <CustomerEditModal
                      isAdmin={isAdmin}
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
        <div className="flex-1 self-stretch">
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
      </div>

      {/* 특이사항 이력 섹션 */}
      <div className="mb-6">
        <div className="bg-white rounded-lg shadow-sm border border-brand-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base sm:text-lg font-semibold text-brand-700">
              특이사항 이력
            </h2>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                open({
                  content: (
                    <RemarkLogCreateModal
                      onSubmit={handleCreateRemarkLog}
                      onCancel={close}
                    />
                  ),
                  options: { dismissOnBackdrop: false, dismissOnEsc: true },
                });
              }}
            >
              + 이력 추가
            </Button>
          </div>
          <div className="space-y-2.5">
            <CustomersDetailRemarkHistories
              logs={remarkLogs}
              isLoading={remarkLogsLoading}
              error={remarkLogsError}
            />
          </div>
        </div>
        {hasMoreRemarks && !remarkLogsLoading && (
          <div className="mt-4 flex justify-center">
            <Button
              onClick={async () => {
                const added = await loadMoreRemarks();
                if (added > 0) toast.success(`${added}개 더 불러오기 성공!`);
              }}
              variant="secondary"
              size="sm"
            >
              더 불러오기
            </Button>
          </div>
        )}
      </div>

      {/* 로그 섹션 */}
      <div className="mb-6">
        <div className="bg-white rounded-lg shadow-sm border border-brand-100 p-4">
          <div className="mb-3 pb-2 border-b border-brand-100 flex gap-2 text-xs">
            <Button
              variant={
                logCategory === LogCategoryEnum.STAMP.value
                  ? 'primary'
                  : 'secondary'
              }
              size="sm"
              onClick={() => setLogCategory(LogCategoryEnum.STAMP.value)}
            >
              스탬프 이력
            </Button>
            <Button
              variant={
                logCategory === LogCategoryEnum.CUSTOMER.value
                  ? 'primary'
                  : 'secondary'
              }
              size="sm"
              onClick={() => setLogCategory(LogCategoryEnum.CUSTOMER.value)}
            >
              고객 이력
            </Button>
          </div>
          <div className="space-y-2.5">
            {logCategory === LogCategoryEnum.STAMP.value ? (
              <CustomersDetailStampsHistories
                targetUser={{ phone: customer.phone, name: customer.name }}
                logs={logs}
                isLoading={logsLoading}
                error={logsError}
              />
            ) : (
              <CustomersDetailUpdateHistories
                logs={logs}
                isLoading={logsLoading}
                error={logsError}
              />
            )}
          </div>
        </div>
        {hasMore && !logsLoading && (
          <div className="mt-4 flex justify-center">
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
          </div>
        )}
      </div>

      {/* AS 현황 섹션 */}
      <div className="mb-10">
        <div className="bg-white rounded-lg shadow-sm border border-brand-100 p-6">
          <h2 className="text-lg sm:text-xl font-semibold text-brand-700 mb-4">
            AS 현황
          </h2>
          <CustomerAfterServices
            customerId={customerId}
            refreshKey={refreshKey}
          />
        </div>
      </div>
    </div>
  );
}
