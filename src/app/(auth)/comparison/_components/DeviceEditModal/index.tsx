'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import Button from '@/app/_components/Button';
import { useComparisonColumns } from '@/app/_hooks/useComparisonColumns';
import { updateComparisonDevice } from '@/app/_services/comparisonDeviceService';

interface DeviceEditModalProps {
  deviceId: string;
  initialValues: Record<string, string>; // column_id -> value
  onCancel: () => void;
  onSuccess: () => void;
}

export default function DeviceEditModal({
  deviceId,
  initialValues,
  onCancel,
  onSuccess,
}: DeviceEditModalProps) {
  const { columns, isLoading } = useComparisonColumns();
  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (columnId: string, value: string) => {
    setValues((prev) => ({ ...prev, [columnId]: value }));
    if (errors[columnId]) setErrors((prev) => ({ ...prev, [columnId]: '' }));
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    columns.forEach((col) => {
      if (!values[col.id]?.trim()) newErrors[col.id] = '값을 입력하세요.';
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      setIsSubmitting(true);
      const deviceValues = columns.map((col) => ({
        column_id: col.id,
        value: values[col.id]?.trim() || '',
      }));
      await updateComparisonDevice(deviceId, deviceValues);
      toast.success('기기 정보가 수정됐습니다.');
      onSuccess();
    } catch {
      toast.error('기기 수정에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full flex flex-col min-h-0">
      <h2 className="text-lg font-semibold mb-4 shrink-0">기기 수정</h2>

      <div className="overflow-y-auto min-h-0 flex-1 space-y-3">
        {isLoading ? (
          <p className="text-sm text-gray-500 text-center py-6">불러오는 중...</p>
        ) : (
          columns.map((col) => (
            <div key={col.id}>
              <label className="block text-sm font-medium mb-1">
                {col.name} <span className="text-rose-600">*</span>
              </label>
              <input
                className="w-full rounded border border-brand-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                placeholder={`${col.name} 입력`}
                value={values[col.id] || ''}
                onChange={(e) => handleChange(col.id, e.target.value)}
              />
              {errors[col.id] && (
                <p className="mt-1 text-xs text-rose-600">{errors[col.id]}</p>
              )}
            </div>
          ))
        )}
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 mt-6 shrink-0">
        <Button size="sm" variant="gray" disabled={isSubmitting} onClick={onCancel}>
          취소
        </Button>
        <Button
          size="sm"
          disabled={isSubmitting || isLoading || columns.length === 0}
          onClick={handleSubmit}
        >
          {isSubmitting ? '저장 중...' : '저장'}
        </Button>
      </div>
    </div>
  );
}
