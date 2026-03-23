import { useState, useEffect, useCallback } from 'react';
import {
  getComparisonColumns,
  createComparisonColumn,
  updateComparisonColumn,
  updateComparisonColumnOrders,
  deleteComparisonColumn,
} from '@/app/_services/comparisonColumnService';
import { ComparisonColumnType } from '@/app/_types/comparison.types';

export const useComparisonColumns = () => {
  const [columns, setColumns] = useState<ComparisonColumnType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const fetchColumns = useCallback(async () => {
    try {
      setIsLoading(true);
      setError('');
      const data = await getComparisonColumns();
      setColumns(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setColumns([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchColumns();
  }, [fetchColumns]);

  const refresh = () => {
    fetchColumns();
  };

  const addColumn = async (values: { name: string }) => {
    try {
      setIsSubmitting(true);
      const sort_order = columns.length + 1;
      const key = Math.random().toString(36).slice(2, 10);
      const data = await createComparisonColumn({ ...values, key, sort_order });
      setColumns((prev) => [...prev, data]);
    } catch (err) {
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const editColumn = async (
    id: string,
    updates: { name?: string },
  ) => {
    try {
      setIsSubmitting(true);
      const data = await updateComparisonColumn(id, updates);
      setColumns((prev) => prev.map((col) => (col.id === id ? data : col)));
    } catch (err) {
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const removeColumn = async (id: string) => {
    try {
      setIsSubmitting(true);
      await deleteComparisonColumn(id);
      setColumns((prev) => {
        const filtered = prev.filter((col) => col.id !== id);
        return filtered.map((col, idx) => ({ ...col, sort_order: idx + 1 }));
      });
    } catch (err) {
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const moveColumn = async (id: string, direction: 'up' | 'down') => {
    const idx = columns.findIndex((col) => col.id === id);
    if (direction === 'up' && idx <= 0) return;
    if (direction === 'down' && idx >= columns.length - 1) return;

    const next = [...columns];
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    const reordered = next.map((col, i) => ({ ...col, sort_order: i + 1 }));

    // 낙관적 업데이트
    setColumns(reordered);

    try {
      setIsSubmitting(true);
      await updateComparisonColumnOrders(
        reordered.map(({ id, sort_order }) => ({ id, sort_order })),
      );
    } catch (err) {
      // 실패 시 롤백
      setColumns(columns);
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    columns,
    isLoading,
    isSubmitting,
    error,
    refresh,
    addColumn,
    editColumn,
    removeColumn,
    moveColumn,
  };
};
