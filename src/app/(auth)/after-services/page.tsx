'use client';

import { useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import Button from '@/app/_components/Button';
import { useModal } from '@/app/contexts/ModalContext';
import AfterServiceCreateModal from './_components/AfterServiceCreateModal';
import AfterServiceList from './_components/AfterServiceList';
import AfterServiceDetailDrawer from './_components/AfterServiceDetailDrawer';
import { createAfterService } from '@/services/afterService';
import toast from 'react-hot-toast';
import { AfterServiceItemTypeEnumType } from '@/app/_enums/enums';
import AfterServiceSearchBox from './_components/AfterServiceSearchBox';
import AfterServiceProgressBox from './_components/AfterServiceProgressBox';

const AfterServicesPage = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { open, close } = useModal();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [filters, setFilters] = useState<{
    status?: string;
    groupStatus?: 'received' | 'inProgress' | 'completed';
    searchTarget?: string;
    searchKeyword?: string;
  }>({});

  // 쿼리 파라미터에서 id 가져오기
  const selectedAfterServiceId = searchParams.get('id');
  const isDrawerOpen = !!selectedAfterServiceId;

  // ========================================================================
  // AS 생성 핸들러
  // ========================================================================
  const handleAfterServiceSubmit = async (values: {
    customerId: string;
    itemType: AfterServiceItemTypeEnumType['value'];
    itemName: string;
    quantity: number;
    symptom: string;
    note?: string;
  }) => {
    try {
      setIsSubmitting(true);

      await createAfterService({
        customerId:
          values.customerId.length > 0 ? String(values.customerId) : null,
        itemType: values.itemType,
        itemName: values.itemName,
        quantity: values.quantity,
        symptom: values.symptom,
        note: values.note,
      });

      toast.success('AS가 등록되었습니다.');
      close();
      // AS 목록 새로고침
      setRefreshKey((prev) => prev + 1);
    } catch (err) {
      console.error('AS 등록 실패:', err);
      toast.error(
        err instanceof Error ? err.message : 'AS 등록에 실패했습니다.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusChange = (status: string) => {
    if (filters.groupStatus) {
      // groupStatus가 활성화되어 있으면 status 필터 변경 무시
      return;
    }
    setFilters((prev) => ({
      ...prev,
      status,
    }));
  };

  const handleSearch = (target: string, keyword: string) => {
    setFilters((prev) => ({
      ...prev,
      searchTarget: target,
      searchKeyword: keyword,
    }));
  };

  const handleGroupClick = (
    group: 'all' | 'received' | 'inProgress' | 'completed',
  ) => {
    if (group === 'all') {
      setFilters((prev) => {
        const { groupStatus, ...rest } = prev;
        return rest;
      });
    } else {
      setFilters((prev) => ({
        ...prev,
        groupStatus: group,
        status: undefined, // groupStatus가 있으면 status는 무시
      }));
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-10 space-y-4">
      <AfterServiceSearchBox
        onStatusChange={handleStatusChange}
        onSearch={handleSearch}
        disabled={!!filters.groupStatus}
      />
      <div className="flex flex-col gap-2 justify-between">
        <AfterServiceProgressBox
          refreshKey={refreshKey}
          onGroupClick={handleGroupClick}
          selectedGroup={filters.groupStatus}
          onClearGroup={() => {
            setFilters((prev) => {
              const { groupStatus, ...rest } = prev;
              return rest;
            });
          }}
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={() => {
              setIsSubmitting(false);
              open({
                content: (
                  <AfterServiceCreateModal
                    onCancel={close}
                    isSubmitting={isSubmitting}
                    onSubmit={handleAfterServiceSubmit}
                  />
                ),
                options: { dismissOnBackdrop: false, dismissOnEsc: true },
              });
            }}
          >
            AS 생성
          </Button>
        </div>
      </div>

      {/* AS 상세 Drawer */}
      <AfterServiceDetailDrawer
        isOpen={isDrawerOpen}
        onClose={() => {
          // 쿼리 파라미터에서 id 제거
          const params = new URLSearchParams(searchParams.toString());
          params.delete('id');
          const newSearch = params.toString();
          router.push(newSearch ? `${pathname}?${newSearch}` : pathname);
        }}
        afterServiceId={selectedAfterServiceId}
        onRefreshList={() => {
          // AS 목록 새로고침
          setRefreshKey((prev) => prev + 1);
        }}
        onDelete={() => {
          // Drawer 닫기 (쿼리 파라미터에서 id 제거)
          const params = new URLSearchParams(searchParams.toString());
          params.delete('id');
          const newSearch = params.toString();
          router.push(newSearch ? `${pathname}?${newSearch}` : pathname);
        }}
      />

      {/* AS 목록 */}
      <AfterServiceList
        refreshKey={refreshKey}
        filters={filters}
        onRowClick={(id) => {
          // 쿼리 파라미터에 id 추가
          const params = new URLSearchParams(searchParams.toString());
          params.set('id', id);
          router.push(`${pathname}?${params.toString()}`);
        }}
      />
    </div>
  );
};

export default AfterServicesPage;
