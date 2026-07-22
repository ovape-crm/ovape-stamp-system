import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getComparisonColumns,
  createComparisonColumn,
  updateComparisonColumn,
  updateComparisonColumnOrders,
  deleteComparisonColumn,
} from '@/app/_domains/_comparison/_services/comparisonColumnService';
import { comparisonKeys } from '@/app/_domains/_comparison/_queryKeys/comparisonKeys';

export const useComparisonColumns = () => {
  const queryClient = useQueryClient();

  const {
    data: columns = [],
    isPending: isLoading,
    isError,
  } = useQuery({
    queryKey: comparisonKeys.columns(),
    queryFn: getComparisonColumns,
  });

  const addMutation = useMutation({
    mutationFn: (values: { name: string }) => {
      const key = Math.random().toString(36).slice(2, 10);
      const sort_order = columns.length + 1;
      return createComparisonColumn({ ...values, key, sort_order });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: comparisonKeys.columns() });
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: { name?: string } }) =>
      updateComparisonColumn(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: comparisonKeys.columns() });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => deleteComparisonColumn(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: comparisonKeys.columns() });
    },
  });

  const moveMutation = useMutation({
    mutationFn: async ({ id, direction }: { id: string; direction: 'up' | 'down' }) => {
      const idx = columns.findIndex((col) => col.id === id);
      if (direction === 'up' && idx <= 0) return;
      if (direction === 'down' && idx >= columns.length - 1) return;

      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      const a = columns[idx];
      const b = columns[swapIdx];

      // 낙관적 업데이트
      const next = [...columns];
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      queryClient.setQueryData(comparisonKeys.columns(), next);

      // 교환되는 두 컬럼의 sort_order만 업데이트
      await updateComparisonColumnOrders([
        { id: a.id, sort_order: b.sort_order },
        { id: b.id, sort_order: a.sort_order },
      ]);
    },
    onError: () => {
      // 실패 시 서버 데이터로 롤백
      queryClient.invalidateQueries({ queryKey: comparisonKeys.columns() });
    },
  });

  const isSubmitting =
    addMutation.isPending ||
    editMutation.isPending ||
    removeMutation.isPending ||
    moveMutation.isPending;

  const addColumn = (values: { name: string }) => addMutation.mutateAsync(values);
  const editColumn = (id: string, updates: { name?: string }) =>
    editMutation.mutateAsync({ id, updates });
  const removeColumn = (id: string) => removeMutation.mutateAsync(id);
  const moveColumn = (id: string, direction: 'up' | 'down') =>
    moveMutation.mutateAsync({ id, direction });

  return {
    columns,
    isLoading,
    isError,
    isSubmitting,
    addColumn,
    editColumn,
    removeColumn,
    moveColumn,
  };
};
