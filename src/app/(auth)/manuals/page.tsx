'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import Button from '@/app/_components/Button';
import { useModal } from '@/app/_contexts/ModalContext';
import { useUser } from '@/app/_contexts/UserContext';
import { ManualTabEnum, ManualTabEnumType } from '@/app/_enums/enums';
import { useManualCategories } from '@/app/_domains/_manual/_hooks/useManualCategories';
import {
  createManual,
  updateManual,
  deleteManual,
} from '@/app/_domains/_manual/_services/manualService';
import { manualKeys, ManualFilters } from '@/app/_domains/_manual/_queryKeys/manualKeys';
import { ManualType } from '@/app/_domains/_manual/_types/manual.types';
import DeleteConfirmModal from '@/app/(auth)/_components/DeleteConfirmModal';
import ManualSearchBox from './_components/ManualSearchBox';
import ManualList from './_components/ManualList';
import ManualCreateModal, {
  ManualFormValues,
} from './_components/ManualCreateModal';
import ManualDetailModal from './_components/ManualDetailModal';
import ManualCategoryManageModal from './_components/ManualCategoryManageModal';

const ManualsPage = () => {
  const queryClient = useQueryClient();
  const { open, close } = useModal();
  const { isAdmin } = useUser();

  const [tab, setTab] = useState<ManualTabEnumType['value']>(
    ManualTabEnum.CUSTOMER.value,
  );
  const [filters, setFilters] = useState<ManualFilters>({});

  const { topCategories, subCategoriesByTop } = useManualCategories(tab);

  const tabLabel =
    Object.values(ManualTabEnum).find((t) => t.value === tab)?.name ?? '';

  const handleChangeTab = (nextTab: ManualTabEnumType['value']) => {
    setTab(nextTab);
    setFilters({});
  };

  const handleSearch = (newFilters: ManualFilters) => {
    setFilters(newFilters);
  };

  // 카테고리 필터를 선택하지 않았을 때는 현재 탭(고객/매장)에 속한
  // 하위 카테고리로만 범위를 한정해, 다른 탭의 매뉴얼이 섞여 보이지 않도록 한다.
  const effectiveFilters = useMemo<ManualFilters>(() => {
    if (filters.subCategoryId || filters.subCategoryIds !== undefined) {
      return filters;
    }
    const tabSubCategoryIds = Object.values(subCategoriesByTop).flatMap(
      (subs) => subs.map((s) => s.id),
    );
    return { ...filters, subCategoryIds: tabSubCategoryIds };
  }, [filters, subCategoriesByTop]);

  const invalidateManuals = () =>
    queryClient.invalidateQueries({ queryKey: manualKeys.lists() });

  const handleManualSubmit = async (values: ManualFormValues) => {
    await createManual({
      subCategoryId: values.subCategoryId,
      title: values.title,
      content: values.content,
    });
    toast.success('매뉴얼이 추가되었습니다.');
    close();
    invalidateManuals();
  };

  const handleManualEdit = (manual: ManualType) => {
    open({
      content: (
        <ManualCreateModal
          topCategories={topCategories}
          subCategoriesByTop={subCategoriesByTop}
          editManual={manual}
          onSubmit={async (values) => {
            await updateManual(manual.id, {
              subCategoryId: values.subCategoryId,
              title: values.title,
              content: values.content,
            });
            toast.success('매뉴얼이 수정되었습니다.');
            close();
            invalidateManuals();
          }}
          onCancel={close}
        />
      ),
      options: { dismissOnBackdrop: false, dismissOnEsc: true },
    });
  };

  const handleManualDelete = (manual: ManualType) => {
    open({
      content: (
        <DeleteConfirmModal
          title="매뉴얼 삭제"
          description={`"${manual.title}" 매뉴얼을 삭제하시겠습니까?`}
          onConfirm={async () => {
            await deleteManual(manual.id);
            toast.success('매뉴얼이 삭제되었습니다.');
            close();
            invalidateManuals();
          }}
          onCancel={close}
        />
      ),
      options: { dismissOnBackdrop: false },
    });
  };

  const handleManualView = (manual: ManualType) => {
    open({
      content: <ManualDetailModal manual={manual} onClose={close} />,
      options: { dismissOnBackdrop: true, dismissOnEsc: true },
    });
  };

  const handleOpenCategoryManage = () => {
    open({
      content: (
        <ManualCategoryManageModal tab={tab} tabLabel={tabLabel} onClose={close} />
      ),
      options: { dismissOnBackdrop: false, dismissOnEsc: true },
    });
  };

  const handleOpenManualCreate = () => {
    open({
      content: (
        <ManualCreateModal
          topCategories={topCategories}
          subCategoriesByTop={subCategoriesByTop}
          onSubmit={handleManualSubmit}
          onCancel={close}
        />
      ),
      options: { dismissOnBackdrop: false, dismissOnEsc: true },
    });
  };

  return (
    <section className="mx-auto flex h-[calc(100vh-3.5rem)] max-w-7xl flex-col px-4 py-6 sm:h-[calc(100vh-5rem)] sm:px-6 lg:px-8">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-brand-100 bg-white p-4 shadow-sm sm:p-6">
        <div className="shrink-0 space-y-4 pb-4">
          <div className="flex flex-col gap-3 border-b border-brand-100 pb-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex gap-1 sm:gap-3">
              {Object.values(ManualTabEnum).map((t) => (
                <Button
                  key={t.value}
                  onClick={() => handleChangeTab(t.value)}
                  variant={tab === t.value ? 'primary' : 'secondary'}
                >
                  {t.name}
                </Button>
              ))}
            </div>
          </div>

          <ManualSearchBox
            key={tab}
            topCategories={topCategories}
            subCategoriesByTop={subCategoriesByTop}
            onSearch={handleSearch}
          />

          {isAdmin && (
            <div className="flex justify-end gap-2">
              <Link href="/manuals/placement-settings" className="inline-flex min-h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-700 shadow-sm transition hover:border-brand-300 hover:text-brand-700">
                공용 모달 배치 설정
              </Link>
              <Button size="sm" variant="gray" onClick={handleOpenCategoryManage}>
                카테고리 관리
              </Button>
              <Button size="sm" onClick={handleOpenManualCreate}>
                매뉴얼 추가
              </Button>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1">
          <ManualList
            filters={effectiveFilters}
            isAdmin={isAdmin}
            onView={handleManualView}
            onEdit={isAdmin ? handleManualEdit : undefined}
            onDelete={isAdmin ? handleManualDelete : undefined}
          />
        </div>
      </div>
    </section>
  );
};

export default ManualsPage;
