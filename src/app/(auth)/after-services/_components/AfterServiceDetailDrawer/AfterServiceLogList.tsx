'use client';

import { useState, useCallback } from 'react';
import Button from '@/app/_components/Button';
import Loading from '@/app/_components/Loading';
import { useLogsByAfterServiceId } from '@/app/_domains/_log/_hooks/useLogsByAfterServiceId';
import { updateLogNote } from '@/app/_domains/_log/_services/logService';
import toast from 'react-hot-toast';
import AfterServiceLogItem from './AfterServiceLogItem';
import { AfterServiceLogType } from '@/app/_domains/_log/_types/log.types';
import {
  ActionInfoLabel,
  LogActorInfo,
  ChangeFields,
} from '@/app/(auth)/_components/HistoriesComponents';

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
        refresh();
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
    [noteDraft, refresh],
  );

  // 날짜별 그룹핑
  const logsByDate = logs.reduce<Record<string, AfterServiceLogType[]>>(
    (acc, log) => {
      const dateKey = new Date(log.created_at).toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }); // 예: 25. 12. 02

      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(log);
      return acc;
    },
    {},
  );

  const sortedDates = Object.keys(logsByDate).sort(
    (a, b) => new Date(b).getTime() - new Date(a).getTime(),
  );

  if (isLoading && logs.length === 0) {
    return (
      <div className="bg-white border border-brand-100 rounded-lg p-4 sm:p-5 mt-5 shadow-sm">
        <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">
          AS 이력
        </h3>
        <div className="flex justify-center items-center py-8 sm:py-10">
          <Loading size="sm" text="불러오는 중..." />
        </div>
      </div>
    );
  }

  if (error && logs.length === 0) {
    return (
      <div className="bg-white border border-brand-100 rounded-lg p-4 sm:p-5 mt-5 shadow-sm">
        <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">
          AS 이력
        </h3>
        <div className="flex justify-center items-center py-8 sm:py-10">
          <p className="text-red-500 text-xs sm:text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-brand-100 rounded-lg p-4 sm:p-5 mt-5 shadow-sm text-xs sm:text-sm">
      <h3 className="text-base sm:text-lg font-bold bg-gradient-to-r from-brand-600 to-brand-700 bg-clip-text text-transparent mb-3 sm:mb-4">
        진행 상황
      </h3>
      {logs.length === 0 ? (
        <div className="text-center py-8 sm:py-10 text-gray-500 text-xs sm:text-sm">
          AS 이력이 없습니다.
        </div>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <div className="min-w-[900px] space-y-4 sm:space-y-6">
            {sortedDates.map((dateKey) => {
              const logsOfDate = logsByDate[dateKey];

              // 보기 좋은 형식으로 변환 (예: "25년 12월 02일")
              const [yyyy, mm, dd] = dateKey.split('.').map((s) => s.trim());
              const prettyDate = `${yyyy}년 ${mm}월 ${dd}일`;

              return (
                <div key={dateKey} className="space-y-3 sm:space-y-4">
                  {/* 날짜 헤더 */}
                  <div className="w-full py-0.5 sm:py-1">
                    <div className="w-full px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg bg-brand-50/80 border border-brand-100 shadow-xs flex items-center justify-start sm:justify-center">
                      <span className="text-xs sm:text-sm font-semibold text-brand-800 tracking-wide whitespace-nowrap">
                        {prettyDate}
                      </span>
                    </div>
                  </div>

                  {/* 해당 날짜 로그들 */}
                  <div className="space-y-2.5 sm:space-y-3">
                    {logsOfDate.map((log: AfterServiceLogType) => {
                      // update-after-service-info 액션인 경우 CustomersDetailUpdateHistories와 동일한 형식으로 렌더링
                      if (log.action === 'update-after-service-info') {
                        return (
                          <div
                            key={log.id}
                            className="flex items-center justify-between p-2.5 sm:p-3 rounded border border-brand-50 hover:bg-brand-50/30 transition-colors whitespace-nowrap text-xs sm:text-sm"
                          >
                            <div className="flex items-center gap-3 sm:gap-6">
                              <ActionInfoLabel action={log.action} />
                              {log.jsonb && <ChangeFields jsonb={log.jsonb} />}
                            </div>

                            {log.users && (
                              <div className="text-right">
                                <LogActorInfo
                                  users={log.users}
                                  created_at={log.created_at}
                                  updated_at={log.updated_at}
                                  jsonb={log.jsonb}
                                />
                              </div>
                            )}
                          </div>
                        );
                      }

                      // 기존 로그 아이템 렌더링 (다른 액션들)
                      const isEditing = editingId === log.id;
                      const currentNote = isEditing
                        ? noteDraft
                        : (log.note ?? '');
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
                  </div>
                </div>
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
        </div>
      )}
    </div>
  );
};

export default AfterServiceLogList;
