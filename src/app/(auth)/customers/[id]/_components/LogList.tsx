'use client';

import Loading from '@/app/_components/Loading';
import { useCallback, useState } from 'react';
import { updateLogNote } from '@/services/logService';
import { toast } from 'react-hot-toast';
import Button from '@/app/_components/Button';
import { CustomersLogsResType } from '@/app/_types/log.types';
import { getActionText } from '@/app/_utils/utils';

interface LogListProps {
  logs: CustomersLogsResType;
  isLoading: boolean;
  error: string;
}

const LogList = ({ logs, isLoading, error }: LogListProps) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [noteOverridesById, setNoteOverridesById] = useState<
    Record<string, string>
  >({});

  const getCurrentNote = useCallback(
    (log: CustomersLogsResType[number]) =>
      noteOverridesById[log.id] ?? log.note ?? '',
    [noteOverridesById]
  );

  const startEdit = useCallback(
    (log: CustomersLogsResType[number]) => {
      setEditingId(log.id);
      setNoteDraft(getCurrentNote(log));
    },
    [getCurrentNote]
  );

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setNoteDraft('');
  }, []);

  const saveNote = useCallback(
    async (log: CustomersLogsResType[number]) => {
      try {
        setIsSaving(true);
        const updated = await updateLogNote(log.id, noteDraft);
        setNoteOverridesById((prev) => ({ ...prev, [log.id]: updated.note }));
        setEditingId(null);
        setNoteDraft('');
        toast.success('노트를 저장했습니다.');
      } catch (e) {
        // keep simple UI feedback; could be replaced with toast
        console.error(e);
        toast.error('노트 저장에 실패했습니다. 다시 시도해 주세요.');
      } finally {
        setIsSaving(false);
      }
    },
    [noteDraft]
  );

  if (isLoading) {
    return <Loading size="md" text="스탬프 이력 불러오는 중..." />;
  }

  if (error) {
    return (
      <div className="flex justify-center items-center py-10">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-brand-100 p-6">
      <h2 className="text-xl font-semibold text-brand-700 mb-4 pb-3 border-b border-brand-100">
        스탬프 이력
      </h2>

      <div className="space-y-3">
        {logs.length === 0 ? (
          <div className="text-center py-10 text-gray-500">
            스탬프 이력이 없습니다.
          </div>
        ) : (
          logs.map((log: CustomersLogsResType[number]) => {
            const actionInfo = getActionText(log.action);
            const isEditing = editingId === log.id;
            const currentNote = getCurrentNote(log);
            return (
              <div
                key={log.id}
                className="flex items-center justify-between p-4 rounded-lg border border-brand-50 hover:bg-brand-50/30 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-semibold ${actionInfo.color}`}
                  >
                    {actionInfo.text}
                  </span>

                  <div>
                    <p className="text-sm text-gray-600">
                      작업자:{' '}
                      <span className="font-medium text-gray-900">
                        {log.users?.name || log.users?.email || '알 수 없음'}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex-1 pl-4 ml-4 border-l border-brand-100">
                  {isEditing ? (
                    <div className="flex items-center gap-2 pr-4">
                      <input
                        className="flex-1 text-sm px-2 py-1 rounded border border-brand-200 focus:outline-none focus:ring-2 focus:ring-brand-200"
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                        placeholder="메모를 입력하세요"
                        disabled={isSaving}
                      />
                      <Button
                        variant="primary"
                        size="xs"
                        onClick={() => saveNote(log)}
                        disabled={isSaving}
                      >
                        저장
                      </Button>
                      <Button
                        variant="secondary"
                        size="xs"
                        onClick={cancelEdit}
                        disabled={isSaving}
                      >
                        취소
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="xs"
                        onClick={() => startEdit(log)}
                      >
                        ✏️
                      </Button>
                      <span className="flex-1 text-sm text-gray-600 break-words">
                        {currentNote || (
                          <span className="text-gray-400"> - </span>
                        )}
                      </span>
                    </div>
                  )}
                </div>

                <div className="text-xs text-gray-400">
                  {new Date(log.created_at).toLocaleString('ko-KR', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default LogList;
