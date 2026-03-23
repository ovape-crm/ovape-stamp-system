'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import Button from '@/app/_components/Button';
import { useComparisonColumns } from '@/app/_hooks/useComparisonColumns';

// ============================================================================
// 폼 검증 스키마
// ============================================================================

const columnSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: '컬럼 이름을 입력하세요.' })
    .max(50, { message: '50자 이하로 입력하세요.' }),
});

type ColumnFormValues = z.infer<typeof columnSchema>;

// ============================================================================
// 컴포넌트
// ============================================================================

export default function ColumnManageModal({
  onCancel,
  onUpdate,
}: {
  onCancel: () => void;
  onUpdate?: () => void;
}) {
  const { columns, isLoading, isSubmitting, addColumn, editColumn, removeColumn, moveColumn } =
    useComparisonColumns();
  const [editingId, setEditingId] = useState<string | null>(null);

  // 추가 폼
  const {
    register: registerAdd,
    handleSubmit: handleAddSubmit,
    reset: resetAdd,
    formState: { errors: addErrors },
  } = useForm<ColumnFormValues>({ resolver: zodResolver(columnSchema) });

  // 수정 폼
  const {
    register: registerEdit,
    handleSubmit: handleEditSubmit,
    reset: resetEdit,
    formState: { errors: editErrors },
  } = useForm<ColumnFormValues>({ resolver: zodResolver(columnSchema) });

  // ========================================================================
  // 이벤트 핸들러
  // ========================================================================

  const handleAdd = async (values: ColumnFormValues) => {
    try {
      await addColumn(values);
      resetAdd();
      toast.success('컬럼이 추가됐습니다.');
      onUpdate?.();
    } catch {
      toast.error('컬럼 추가에 실패했습니다.');
    }
  };

  const handleEditStart = (column: { id: string; name: string }) => {
    setEditingId(column.id);
    resetEdit({ name: column.name });
  };

  const handleEditSave = async (values: ColumnFormValues) => {
    if (!editingId) return;
    try {
      await editColumn(editingId, values);
      setEditingId(null);
      toast.success('컬럼이 수정됐습니다.');
      onUpdate?.();
    } catch {
      toast.error('컬럼 수정에 실패했습니다.');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await removeColumn(id);
      if (editingId === id) setEditingId(null);
      toast.success('컬럼이 삭제됐습니다.');
      onUpdate?.();
    } catch {
      toast.error('컬럼 삭제에 실패했습니다.');
    }
  };

  const handleMove = async (id: string, direction: 'up' | 'down') => {
    try {
      await moveColumn(id, direction);
      onUpdate?.();
    } catch {
      toast.error('순서 변경에 실패했습니다.');
    }
  };

  // ========================================================================
  // 렌더링
  // ========================================================================

  return (
    <div className="w-full flex flex-col min-h-0">
      <h2 className="text-lg font-semibold mb-4 shrink-0">컬럼 관리</h2>

      <div className="overflow-y-auto min-h-0 flex-1 space-y-4">
        {/* 컬럼 목록 */}
        {isLoading ? (
          <p className="text-sm text-gray-500 text-center py-6">불러오는 중...</p>
        ) : columns.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-6">
            등록된 컬럼이 없습니다.
          </p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-2 font-medium text-gray-600 w-16">
                  순서
                </th>
                <th className="text-left py-2 px-2 font-medium text-gray-600">
                  컬럼명
                </th>
                <th className="text-left py-2 px-2 font-medium text-gray-600">
                  키
                </th>
                <th className="text-right py-2 px-2 font-medium text-gray-600">
                  작업
                </th>
              </tr>
            </thead>
            <tbody>
              {columns.map((col, idx) =>
                editingId === col.id ? (
                  <tr key={col.id} className="border-b border-gray-100">
                    <td className="py-2 px-2 text-gray-500">
                      {col.sort_order}
                    </td>
                    <td className="py-2 px-2">
                      <input
                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand-300"
                        {...registerEdit('name')}
                      />
                      {editErrors.name && (
                        <p className="text-xs text-rose-600 mt-1">
                          {editErrors.name.message}
                        </p>
                      )}
                    </td>
                    <td className="py-2 px-2 text-gray-400 font-mono text-xs">
                      {col.key}
                    </td>
                    <td className="py-2 px-2 text-right space-x-1">
                      <Button
                        size="xs"
                        disabled={isSubmitting}
                        onClick={handleEditSubmit(handleEditSave)}
                      >
                        저장
                      </Button>
                      <Button
                        size="xs"
                        variant="gray"
                        disabled={isSubmitting}
                        onClick={() => setEditingId(null)}
                      >
                        취소
                      </Button>
                    </td>
                  </tr>
                ) : (
                  <tr key={col.id} className="border-b border-gray-100">
                    <td className="py-2 px-2">
                      <div className="flex gap-1 items-center">
                        <button
                          type="button"
                          onClick={() => handleMove(col.id, 'up')}
                          disabled={idx === 0 || isSubmitting}
                          className="disabled:opacity-30 text-gray-400 hover:text-gray-700 text-xs"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMove(col.id, 'down')}
                          disabled={idx === columns.length - 1 || isSubmitting}
                          className="disabled:opacity-30 text-gray-400 hover:text-gray-700 text-xs"
                        >
                          ▼
                        </button>
                      </div>
                    </td>
                    <td className="py-2 px-2">{col.name}</td>
                    <td className="py-2 px-2 text-gray-400 font-mono text-xs">
                      {col.key}
                    </td>
                    <td className="py-2 px-2 text-right space-x-1">
                      <Button
                        size="xs"
                        variant="gray"
                        disabled={isSubmitting}
                        onClick={() => handleEditStart(col)}
                      >
                        수정
                      </Button>
                      <Button
                        size="xs"
                        variant="secondary"
                        disabled={isSubmitting}
                        onClick={() => handleDelete(col.id)}
                      >
                        삭제
                      </Button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        )}

        {/* 컬럼 추가 폼 */}
        <form
          onSubmit={handleAddSubmit(handleAdd)}
          className="border-t border-gray-200 pt-4"
        >
          <p className="text-sm font-medium mb-2">컬럼 추가</p>
          <div className="flex gap-2 items-start">
            <div className="flex-1">
              <input
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-300"
                placeholder="컬럼명 (예: 저항값)"
                {...registerAdd('name')}
              />
              {addErrors.name && (
                <p className="text-xs text-rose-600 mt-1">
                  {addErrors.name.message}
                </p>
              )}
            </div>
            <Button size="sm" type="submit" disabled={isSubmitting}>
              추가
            </Button>
          </div>
          <div className="pb-2" />
        </form>
      </div>

      <div className="flex justify-end pt-4 border-t border-gray-200 shrink-0">
        <Button size="sm" variant="gray" onClick={onCancel}>
          닫기
        </Button>
      </div>
    </div>
  );
}
