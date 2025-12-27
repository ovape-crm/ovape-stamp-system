'use client';

import { useState, useCallback } from 'react';
import Button from '@/app/_components/Button';
import Loading from '@/app/_components/Loading';
import { useLogsByAfterServiceId } from '@/app/_hooks/useLogsByAfterServiceId';
import { updateLogNote } from '@/services/logService';
import toast from 'react-hot-toast';
import AfterServiceLogItem from './AfterServiceLogItem';
import { AfterServiceLogType } from '@/app/_types/log.types';

const PAGE_SIZE = 10;

const AfterServiceLogList = ({
  afterServiceId,
}: {
  afterServiceId: number;
}) => {
  const { logs, isLoading, error, hasMore, loadMore, refresh } =
    useLogsByAfterServiceId(afterServiceId, PAGE_SIZE);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const startEdit = useCallback((log: AfterServiceLogType) => {
    setEditingId(log.id);
    setNoteDraft(log.note ?? '');
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setNoteDraft('');
  }, []);

  const saveNote = useCallback(
    async (log: AfterServiceLogType) => {
      try {
        setIsSaving(true);
        await updateLogNote(log.id, noteDraft);
        await refresh(); // 로그 목록 새로고침
        setEditingId(null);
        setNoteDraft('');
        toast.success('노트를 저장했습니다.');
      } catch (e) {
        console.error('Failed to save note:', e);
        toast.error('노트 저장에 실패했습니다. 다시 시도해 주세요.');
      } finally {
        setIsSaving(false);
      }
    },
    [noteDraft, refresh]
  );

  if (isLoading && logs.length === 0) {
    return (
      <div className="bg-white border border-brand-100 rounded-lg p-5 mt-5 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">AS 이력</h3>
        <div className="flex justify-center items-center py-10">
          <Loading size="sm" text="불러오는 중..." />
        </div>
      </div>
    );
  }

  if (error && logs.length === 0) {
    return (
      <div className="bg-white border border-brand-100 rounded-lg p-5 mt-5 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">AS 이력</h3>
        <div className="flex justify-center items-center py-10">
          <p className="text-red-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-brand-100 rounded-lg p-5 mt-5 shadow-sm">
      <h3 className="text-lg font-bold bg-gradient-to-r from-brand-600 to-brand-700 bg-clip-text text-transparent mb-4">
        진행 상황
      </h3>
      {logs.length === 0 ? (
        <div className="text-center py-10 text-gray-500 text-sm">
          AS 이력이 없습니다.
        </div>
      ) : (
        <div className="space-y-3">
          {logs.map((log: AfterServiceLogType) => {
            const isEditing = editingId === log.id;
            const currentNote = isEditing ? noteDraft : log.note ?? '';
            return (
              <AfterServiceLogItem
                key={log.id}
                log={log}
                isEditing={isEditing}
                noteDraft={noteDraft}
                currentNote={currentNote}
                onNoteChange={setNoteDraft}
                onSave={() => saveNote(log)}
                onCancel={cancelEdit}
                onEdit={() => startEdit(log)}
                isSaving={isSaving}
              />
            );
          })}
          {hasMore && (
            <div className="pt-2">
              <Button onClick={loadMore} size="sm" variant="secondary">
                더 보기
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AfterServiceLogList;
