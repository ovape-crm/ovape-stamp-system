'use client';

import { useState } from 'react';
import Button from '@/app/_components/Button';

interface ConfirmModalProps {
  title: string;
  description: string;
  confirmLabel?: string;
  confirmingLabel?: string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

const ConfirmModal = ({
  title,
  description,
  confirmLabel = '확인',
  confirmingLabel = '처리 중...',
  onConfirm,
  onCancel,
}: ConfirmModalProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full">
      <h2 className="text-lg font-semibold mb-3">{title}</h2>

      <p className="text-sm text-gray-700 whitespace-pre-line">{description}</p>

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 mt-6">
        <Button size="sm" variant="gray" onClick={onCancel} disabled={isSubmitting}>
          취소
        </Button>
        <Button size="sm" onClick={handleConfirm} disabled={isSubmitting}>
          {isSubmitting ? confirmingLabel : confirmLabel}
        </Button>
      </div>
    </div>
  );
};

export default ConfirmModal;
