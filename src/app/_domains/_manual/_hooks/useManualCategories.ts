import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getManualCategoryTree,
  createManualTopCategory,
  updateManualTopCategory,
  updateManualTopCategoryOrders,
  deleteManualTopCategory,
  createManualSubCategory,
  updateManualSubCategory,
  updateManualSubCategoryOrders,
  deleteManualSubCategory,
} from '../_services/manualCategoryService';
import { manualKeys } from '../_queryKeys/manualKeys';

export const useManualCategories = (tab: string) => {
  const queryClient = useQueryClient();

  const { data, isPending: isLoading } = useQuery({
    queryKey: manualKeys.categoryTree(tab),
    queryFn: () => getManualCategoryTree(tab),
  });

  const topCategories = data?.topCategories ?? [];
  const subCategoriesByTop = data?.subCategoriesByTop ?? {};

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: manualKeys.categoryTree(tab) });

  // ==========================================================================
  // 상위 타입
  // ==========================================================================

  const addTopMutation = useMutation({
    mutationFn: (name: string) =>
      createManualTopCategory({ tab, name, orderIndex: topCategories.length + 1 }),
    onSuccess: invalidate,
  });

  const editTopMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      updateManualTopCategory({ id, name }),
    onSuccess: invalidate,
  });

  const removeTopMutation = useMutation({
    mutationFn: (id: string) => deleteManualTopCategory(id),
    onSuccess: invalidate,
  });

  const moveTopMutation = useMutation({
    mutationFn: async ({
      id,
      direction,
    }: {
      id: string;
      direction: 'up' | 'down';
    }) => {
      const idx = topCategories.findIndex((c) => c.id === id);
      if (direction === 'up' && idx <= 0) return;
      if (direction === 'down' && idx >= topCategories.length - 1) return;

      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      const a = topCategories[idx];
      const b = topCategories[swapIdx];

      await updateManualTopCategoryOrders([
        { id: a.id, order_index: b.order_index },
        { id: b.id, order_index: a.order_index },
      ]);
    },
    onSuccess: invalidate,
  });

  // ==========================================================================
  // 하위 타입
  // ==========================================================================

  const addSubMutation = useMutation({
    mutationFn: ({
      topCategoryId,
      name,
    }: {
      topCategoryId: string;
      name: string;
    }) => {
      const siblings = subCategoriesByTop[topCategoryId] ?? [];
      return createManualSubCategory({
        topCategoryId,
        name,
        orderIndex: siblings.length + 1,
      });
    },
    onSuccess: invalidate,
  });

  const editSubMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      updateManualSubCategory({ id, name }),
    onSuccess: invalidate,
  });

  const removeSubMutation = useMutation({
    mutationFn: (id: string) => deleteManualSubCategory(id),
    onSuccess: invalidate,
  });

  const moveSubMutation = useMutation({
    mutationFn: async ({
      topCategoryId,
      id,
      direction,
    }: {
      topCategoryId: string;
      id: string;
      direction: 'up' | 'down';
    }) => {
      const siblings = subCategoriesByTop[topCategoryId] ?? [];
      const idx = siblings.findIndex((c) => c.id === id);
      if (direction === 'up' && idx <= 0) return;
      if (direction === 'down' && idx >= siblings.length - 1) return;

      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      const a = siblings[idx];
      const b = siblings[swapIdx];

      await updateManualSubCategoryOrders([
        { id: a.id, order_index: b.order_index },
        { id: b.id, order_index: a.order_index },
      ]);
    },
    onSuccess: invalidate,
  });

  const isSubmitting =
    addTopMutation.isPending ||
    editTopMutation.isPending ||
    removeTopMutation.isPending ||
    moveTopMutation.isPending ||
    addSubMutation.isPending ||
    editSubMutation.isPending ||
    removeSubMutation.isPending ||
    moveSubMutation.isPending;

  return {
    topCategories,
    subCategoriesByTop,
    isLoading,
    isSubmitting,
    addTopCategory: (name: string) => addTopMutation.mutateAsync(name),
    editTopCategory: (id: string, name: string) =>
      editTopMutation.mutateAsync({ id, name }),
    removeTopCategory: (id: string) => removeTopMutation.mutateAsync(id),
    moveTopCategory: (id: string, direction: 'up' | 'down') =>
      moveTopMutation.mutateAsync({ id, direction }),
    addSubCategory: (topCategoryId: string, name: string) =>
      addSubMutation.mutateAsync({ topCategoryId, name }),
    editSubCategory: (id: string, name: string) =>
      editSubMutation.mutateAsync({ id, name }),
    removeSubCategory: (id: string) => removeSubMutation.mutateAsync(id),
    moveSubCategory: (
      topCategoryId: string,
      id: string,
      direction: 'up' | 'down',
    ) => moveSubMutation.mutateAsync({ topCategoryId, id, direction }),
  };
};
