'use client';

import { useRef, useState } from 'react';
import Button from '@/app/_components/Button';
import supabase from '@/libs/supabaseClient';
import toast from 'react-hot-toast';

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
  const [revisedNote, setRevisedNote] = useState<string | null>(null);
  const [spellCheckError, setSpellCheckError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isLocalSubmitting, setIsLocalSubmitting] = useState(false);
  const submitLockRef = useRef(false);
  const isPending = isSubmitting || isLocalSubmitting;

  const handleSpellCheck = async () => {
    const content = note.trim();
    if (!content || isPending || isChecking) return;

    try {
      setIsChecking(true);
      setSpellCheckError(null);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('로그인이 필요합니다.');
      const response = await fetch('/api/spell-check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ content }),
      });
      const result = (await response.json()) as {
        revised?: string;
        message?: string;
      };
      if (!response.ok || !result.revised) {
        throw new Error(result.message || '맞춤법 검사에 실패했습니다.');
      }
      setRevisedNote(result.revised);
    } catch (error) {
      const message = error instanceof Error ? error.message : '맞춤법 검사에 실패했습니다.';
      setSpellCheckError(message);
      toast.error(message);
    } finally {
      setIsChecking(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!note.trim() || isPending || submitLockRef.current) {
      return;
    }

    submitLockRef.current = true;
    setIsLocalSubmitting(true);

    try {
      await onSubmit(note.trim());
      if (mode === 'create') setNote('');
    } finally {
      submitLockRef.current = false;
      setIsLocalSubmitting(false);
    }
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
            onChange={(e) => {
              setNote(e.target.value);
              setRevisedNote(null);
              setSpellCheckError(null);
            }}
            className="w-full min-h-32 rounded border border-brand-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 resize-none"
            placeholder={placeholder}
            disabled={isPending}
            rows={6}
          />
          {spellCheckError && (
            <p className="mt-2 text-sm text-rose-600" role="alert">
              {spellCheckError}
            </p>
          )}
        </div>
        {revisedNote !== null && (
          <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-3">
            <p className="text-sm font-semibold text-gray-800">교정 결과</p>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-700">
              {revisedNote}
            </p>
            <div className="mt-3 flex justify-end">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setNote(revisedNote);
                  setRevisedNote(null);
                }}
                disabled={isPending}
              >
                교정문 적용
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-gray-200 pt-4">
        <Button
          size="sm"
          variant="gray"
          disabled={isPending}
          onClick={onCancel}
          type="button"
        >
          취소
        </Button>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={handleSpellCheck}
            disabled={isPending || isChecking || !note.trim()}
          >
            {isChecking ? '검사 중...' : '맞춤법 검사'}
          </Button>
          <Button
            size="sm"
            type="submit"
            disabled={isPending || !note.trim()}
          >
            {isPending
              ? mode === 'create'
                ? '추가 중...'
                : '저장 중...'
              : mode === 'create'
                ? '추가'
                : '저장'}
          </Button>
        </div>
      </div>
    </form>
  );
};

export default RemarkLogCreateModal;
