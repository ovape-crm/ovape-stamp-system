'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/app/_components/Button';
import { useModal } from '@/app/_contexts/ModalContext';
import { useItemCategories } from '@/app/_domains/_item/_hooks/useItemCategories';
import { createItem, updateItem, deleteItem } from '@/app/_domains/_item/_services/itemService';
import { getAllItemsForBulk } from '@/app/_domains/_item/_services/itemBulkService';
import {
  itemKeys,
  ItemFilters,
} from '@/app/_domains/_item/_queryKeys/itemKeys';
import { ItemType } from '@/app/_domains/_item/_types/item.types';
import ItemSearchBox from './_components/ItemSearchBox';
import ItemList from './_components/ItemList';
import ItemCreateModal from './_components/ItemCreateModal';
import CategoryManageModal from './_components/CategoryManageModal';
import type { FormValues } from './_components/ItemCreateModal';
import DeleteConfirmModal from '@/app/(auth)/_components/DeleteConfirmModal';
import toast from 'react-hot-toast';
import { useUser } from '@/app/_contexts/UserContext';
import Loading from '@/app/_components/Loading';
import ItemBulkReplaceModal from './_components/ItemBulkReplaceModal';

const ItemsPage = () => {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { open, close } = useModal();
  const { isAdmin, isLoading } = useUser();
  const { categories } = useItemCategories();
  const [filters, setFilters] = useState<ItemFilters>({});

  useEffect(() => {
    if (!isLoading && !isAdmin) router.replace('/product-search');
  }, [isAdmin, isLoading, router]);

  const handleSearch = (newFilters: ItemFilters) => {
    setFilters(newFilters);
  };

  const effectiveFilters = useMemo<ItemFilters>(
    () =>
      isAdmin
        ? filters
        : { ...filters, excludePurchasePrice: true },
    [isAdmin, filters],
  );

  const handleItemSubmit = async (values: FormValues) => {
    await createItem({
      categoryId: values.categoryId || null,
      itemCode: values.itemCode,
      itemName: values.itemName,
      purchasePrice: values.purchasePrice ?? null,
      sellingPrice: values.sellingPrice ?? null,
      liquidType: values.liquidType ?? '',
      liquidFlavor: values.liquidFlavor ?? '',
      note: values.note ?? '',
    });
    toast.success('품목이 추가되었습니다.');
    close();
    queryClient.invalidateQueries({ queryKey: itemKeys.lists() });
  };

  const handleItemEdit = (item: ItemType) => {
    open({
      content: (
        <ItemCreateModal
          categories={categories}
          editItem={item}
          onSubmit={async (values) => {
            await updateItem(item.id, {
              categoryId: values.categoryId || null,
              itemCode: values.itemCode,
              itemName: values.itemName,
              purchasePrice: values.purchasePrice ?? null,
              sellingPrice: values.sellingPrice ?? null,
              liquidType: values.liquidType ?? '',
              liquidFlavor: values.liquidFlavor ?? '',
              note: values.note ?? '',
              isUse: values.isUse ?? true,
            });
            toast.success('품목이 수정되었습니다.');
            close();
            queryClient.invalidateQueries({ queryKey: itemKeys.lists() });
          }}
          onCancel={close}
        />
      ),
      options: { dismissOnBackdrop: false, dismissOnEsc: true },
    });
  };

  const handleItemDelete = (item: ItemType) => {
    open({
      content: (
        <DeleteConfirmModal
          title="품목 삭제"
          description={`"${item.item_name}" 품목을 삭제하시겠습니까?`}
          onConfirm={async () => {
            await deleteItem(item.id);
            toast.success('품목이 삭제되었습니다.');
            close();
            queryClient.invalidateQueries({ queryKey: itemKeys.lists() });
          }}
          onCancel={close}
        />
      ),
      options: { dismissOnBackdrop: false },
    });
  };

  const handleOpenCategoryManage = () => {
    open({
      content: <CategoryManageModal onClose={close} />,
      options: { dismissOnBackdrop: false, dismissOnEsc: true },
    });
  };

  const handleOpenBulkReplace = async () => {
    try {
      const items = await getAllItemsForBulk();
      open({
        content: <ItemBulkReplaceModal items={items} categories={categories} onClose={close} onSaved={async () => { await queryClient.invalidateQueries({ queryKey: itemKeys.lists() }); }} />,
        options: { dismissOnBackdrop: false, dismissOnEsc: false, size: 'max-w-4xl' },
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '품목 목록을 불러오지 못했습니다.');
    }
  };

  if (isLoading || !isAdmin) return <Loading size="lg" text="권한을 확인하는 중..." />;

  return (
    <section className="mx-auto flex h-[calc(100vh-3.5rem)] max-w-7xl flex-col px-4 py-6 sm:h-[calc(100vh-5rem)] sm:px-6 lg:px-8">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-brand-100 bg-white p-4 shadow-sm sm:p-6">
        <div className="shrink-0 space-y-3 pb-4">
        <ItemSearchBox categories={categories} onSearch={handleSearch} />

        {isAdmin && (
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={handleOpenBulkReplace}>
              품목 일괄 교체
            </Button>
            <Button size="sm" variant="gray" onClick={handleOpenCategoryManage}>
              종류 관리
            </Button>
            <Button
              size="sm"
              onClick={() => {
                open({
                  content: (
                    <ItemCreateModal
                      categories={categories}
                      onSubmit={handleItemSubmit}
                      onCancel={close}
                    />
                  ),
                  options: { dismissOnBackdrop: false, dismissOnEsc: true },
                });
              }}
            >
              품목 추가
            </Button>
          </div>
        )}
        </div>

        <div className="min-h-0 flex-1">
          <ItemList
            filters={effectiveFilters}
            isAdmin={isAdmin}
            onEdit={isAdmin ? handleItemEdit : undefined}
            onDelete={isAdmin ? handleItemDelete : undefined}
          />
        </div>
      </div>
    </section>
  );
};

export default ItemsPage;
