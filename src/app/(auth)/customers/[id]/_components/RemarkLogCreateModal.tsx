'use client';

import { useState } from 'react';
import Button from '@/app/_components/Button';

interface RemarkLogCreateModalProps {
  onSubmit: (note: string) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
  initialNote?: string;
  mode?: 'create' | 'edit';
  title?: string;
  label?: string;
  placeholder?: string;
}

const RemarkLogCreateModal = ({
  onSubmit,
  onCancel,
  isSubmitting = false,
  initialNote = '',
  mode = 'create',
  title,
  label = '특이사항',
  placeholder = '특이사항을 입력하세요',
}: RemarkLogCreateModalProps) => {
  const [note, setNote] = useState(initialNote);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!note.trim()) {
      return;
    }
    await onSubmit(note.trim());
    if (mode === 'create') setNote('');
  };

  return (
    <form onSubmit={handleSubmit} className="w-full" noValidate>
      <h2 className="text-lg font-semibold mb-3">
        {title ?? `특이사항 이력 ${mode === 'create' ? '추가' : '수정'}`}
      </h2>

      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700">
            {label} <span className="text-rose-600">*</span>
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full min-h-32 rounded border border-brand-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 resize-none"
            placeholder={placeholder}
            disabled={isSubmitting}
            rows={6}
          />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 mt-6">
        <Button
          size="sm"
          variant="gray"
          disabled={isSubmitting}
          onClick={onCancel}
          type="button"
        >
          취소
        </Button>
        <Button
          size="sm"
          type="submit"
          disabled={isSubmitting || !note.trim()}
        >
          {isSubmitting
            ? mode === 'create'
              ? '추가 중...'
              : '저장 중...'
            : mode === 'create'
              ? '추가'
              : '저장'}
        </Button>
      </div>
    </form>
  );
};

export default RemarkLogCreateModal;
