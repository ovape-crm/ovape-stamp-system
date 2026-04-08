'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import Button from '@/app/_components/Button';
import { useModal } from '@/app/_contexts/ModalContext';
import { useItemCategories } from '@/app/_domains/_item/_hooks/useItemCategories';
import { createItem, updateItem, deleteItem } from '@/app/_domains/_item/_services/itemService';
import {
  itemKeys,
  ItemFilters,
} from '@/app/_domains/_item/_queryKeys/itemKeys';
import { ItemType } from '@/app/_domains/_item/_types/item.types';
import ItemSearchBox from './_components/ItemSearchBox';
import ItemList from './_components/ItemList';
import ItemCreateModal from './_components/ItemCreateModal';
import type { FormValues } from './_components/ItemCreateModal';
import DeleteConfirmModal from '@/app/(auth)/_components/DeleteConfirmModal';
import toast from 'react-hot-toast';
import { useUser } from '@/app/_contexts/UserContext';

const ItemsPage = () => {
  const queryClient = useQueryClient();
  const { open, close } = useModal();
  const { isAdmin } = useUser();
  const { categories } = useItemCategories();
  const [filters, setFilters] = useState<ItemFilters>({});

  const handleSearch = (newFilters: ItemFilters) => {
    setFilters(newFilters);
  };

  const effectiveFilters = useMemo<ItemFilters>(
    () =>
      isAdmin
        ? filters
        : { ...filters, isUse: true, excludePurchasePrice: true },
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-10 space-y-4">
      <ItemSearchBox categories={categories} onSearch={handleSearch} />

      {isAdmin && (
        <div className="flex justify-end">
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

      <ItemList
        filters={effectiveFilters}
        categories={categories}
        isAdmin={isAdmin}
        onEdit={isAdmin ? handleItemEdit : undefined}
        onDelete={isAdmin ? handleItemDelete : undefined}
      />
    </div>
  );
};

export default ItemsPage;
