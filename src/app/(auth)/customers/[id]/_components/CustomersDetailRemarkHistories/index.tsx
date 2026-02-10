import {
  LogActorInfo,
} from '@/app/(auth)/_components/HistoriesComponents';
import Button from '@/app/_components/Button';
import Loading from '@/app/_components/Loading';
import { CustomersLogsResType } from '@/app/_types/log.types';
import { updateLogNote } from '@/services/logService';
import { useCallback, useState } from 'react';
import { toast } from 'react-hot-toast';

const CustomersDetailRemarkHistories = ({
  logs,
  isLoading,
  error,
}: {
  isLoading: boolean;
  error: string;
  logs: CustomersLogsResType;
}) => {
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
        console.error(e);
        toast.error('노트 저장에 실패했습니다. 다시 시도해 주세요.');
      } finally {
        setIsSaving(false);
      }
    },
    [noteDraft]
  );

  if (error) {
    return (
      <div className="text-center py-8 text-rose-600 text-sm">{error}</div>
    );
  }

  if (isLoading) {
    return <Loading size="lg" text="특이사항 내역 불러오는 중..." />;
  }

  if (logs.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">데이터가 없습니다.</div>
    );
  }

  // 날짜별 그룹핑
  const logsByDate = logs.reduce<Record<string, CustomersLogsResType>>(
    (acc, log) => {
      const dateKey = new Date(log.created_at).toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });

      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(log);
      return acc;
    },
    {}
  );

  const sortedDates = Object.keys(logsByDate).sort(
    (a, b) => new Date(b).getTime() - new Date(a).getTime()
  );

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[900px] space-y-3 text-xs sm:text-sm">
        {sortedDates.map((dateKey) => {
          const logsOfDate = logsByDate[dateKey];
          const [yyyy, mm, dd] = dateKey.split('.').map((s) => s.trim());
          const prettyDate = `${yyyy}년 ${mm}월 ${dd}일`;

          return (
            <div key={dateKey} className="space-y-3">
              {/* 날짜 헤더 */}
              <div className="w-full py-1">
                <div className="w-full px-4 py-2 rounded-lg bg-brand-50/80 border border-brand-100 shadow-xs flex items-center justify-center">
                  <span className="text-xs sm:text-sm font-semibold text-brand-800 tracking-wide whitespace-nowrap">
                    {prettyDate}
                  </span>
                </div>
              </div>

              {/* 해당 날짜의 로그들 */}
              {logsOfDate.map((log) => {
                const isEditing = editingId === log.id;
                const currentNote = getCurrentNote(log);

                return (
                  <div
                    key={log.id}
                    className="flex items-center justify-between p-3 rounded border border-brand-50 hover:bg-brand-50/30 transition-colors whitespace-nowrap"
                  >
                    {/* Label - 항상 "특이사항" */}
                    <div className="flex items-center gap-4 sm:gap-6">
                      <span className="px-3 py-1 rounded-full text-[11px] sm:text-xs font-semibold whitespace-nowrap bg-purple-100 text-purple-800">
                        특이사항
                      </span>

                      {log.users && (
                        <div className="text-left">
                          <LogActorInfo
                            users={log.users}
                            created_at={log.created_at}
                          />
                        </div>
                      )}
                    </div>

                    {/* 메모 */}
                    <div className="flex-1 pl-4 ml-4 border-l border-brand-100">
                      {isEditing ? (
                        <div className="flex flex-col gap-2 pr-4">
                          <textarea
                            className="flex-1 text-xs sm:text-sm px-2 py-2 rounded border border-brand-200 focus:outline-none focus:ring-2 focus:ring-brand-200 resize-none min-h-[50px]"
                            value={noteDraft}
                            onChange={(e) => setNoteDraft(e.target.value)}
                            placeholder="메모를 입력하세요"
                            disabled={isSaving}
                            rows={3}
                          />
                          <div className="flex items-center gap-2">
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
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Button
                            variant="secondary"
                            size="xs"
                            onClick={() => startEdit(log)}
                            disabled={isSaving}
                          >
                            ✏️
                          </Button>
                          <span className="flex-1 text-xs sm:text-sm text-gray-600 break-words whitespace-pre-line">
                            {currentNote || (
                              <span className="text-gray-400"> - </span>
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CustomersDetailRemarkHistories;
