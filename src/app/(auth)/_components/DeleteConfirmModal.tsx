'use client';

import { useState } from 'react';
import Button from '@/app/_components/Button';

interface DeleteConfirmModalProps {
  onConfirm: () => Promise<void>;
  onCancel: () => void;
  title?: string;
  description?: string;
}

const DeleteConfirmModal = ({ onConfirm, onCancel, title = '로그 삭제', description = '이 로그를 삭제하시겠습니까?' }: DeleteConfirmModalProps) => {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirm = async () => {
    setIsDeleting(true);
    try {
      await onConfirm();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="w-full">
      <h2 className="text-lg font-semibold mb-3">{title}</h2>

      <div className="space-y-2">
        <p className="text-sm text-gray-700">{description}</p>
        <p className="text-xs text-rose-500">삭제된 항목은 복구할 수 없습니다.</p>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 mt-6">
        <Button size="sm" variant="gray" onClick={onCancel} disabled={isDeleting}>
          취소
        </Button>
        <Button size="sm" variant="danger" onClick={handleConfirm} disabled={isDeleting}>
          {isDeleting ? '삭제 중...' : '삭제'}
        </Button>
      </div>
    </div>
  );
};

export default DeleteConfirmModal;
