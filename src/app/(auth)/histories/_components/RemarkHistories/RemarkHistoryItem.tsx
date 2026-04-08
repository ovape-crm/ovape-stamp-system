'use client';

import Button from '@/app/_components/Button';
import { LogsResType } from '@/app/_domains/_log/_types/log.types';
import {
  CustomerInfo,
  LogActorInfo,
} from '@/app/(auth)/_components/HistoriesComponents';
import useCopy from '@/app/_domains/_log/_hooks/useCopy';

interface RemarkHistoryItemProps {
  log: LogsResType;
  isEditing: boolean;
  noteDraft: string;
  currentNote: string;
  onNoteChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onEdit: () => void;
  onNavigate: () => void;
  isSaving: boolean;
  isAdmin: boolean;
  onDelete: () => void;
}

const RemarkHistoryItem = ({
  log,
  isEditing,
  noteDraft,
  currentNote,
  onNoteChange,
  onSave,
  onCancel,
  onEdit,
  onNavigate,
  isSaving,
  isAdmin,
  onDelete,
}: RemarkHistoryItemProps) => {
  const { copyLogToClipboard } = useCopy();

  return (
    <div className="flex items-center justify-between p-2.5 sm:p-4 rounded-lg border border-brand-50 hover:bg-brand-50/30 transition-colors whitespace-nowrap text-xs sm:text-sm">
      {/* Label - 항상 "특이사항" */}
      <div className="flex items-center gap-4">
        <span className="px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap bg-purple-100 text-purple-800">
          특이사항
        </span>
        <CustomerInfo
          name={log.customers?.name}
          phone={log.customers?.phone}
          onClick={onNavigate}
        />
      </div>

      {/* 메모 */}
      <div className="flex-1 pl-3 ml-3 sm:pl-4 sm:ml-4 border-l border-brand-100">
        {isEditing ? (
          <div key="edit" className="flex flex-col gap-2 pr-4">
            <textarea
              className="flex-1 text-xs sm:text-sm px-2 py-1.5 sm:py-2 rounded border border-brand-200 focus:outline-none focus:ring-2 focus:ring-brand-200 resize-none min-h-[50px] sm:min-h-[60px]"
              value={noteDraft}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder="메모를 입력하세요"
              disabled={isSaving}
              rows={3}
            />

            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="xs"
                onClick={onSave}
                disabled={isSaving}
              >
                저장
              </Button>
              <Button
                variant="secondary"
                size="xs"
                onClick={onCancel}
                disabled={isSaving}
              >
                취소
              </Button>
            </div>
          </div>
        ) : (
          <div key="view" className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="xs"
              onClick={onEdit}
              disabled={isSaving}
            >
              ✏️
            </Button>
            <span className="flex-1 text-xs sm:text-sm text-gray-600 break-words whitespace-pre-line">
              {currentNote || <span className="text-gray-400"> - </span>}
            </span>
          </div>
        )}
      </div>

      {/* 작성자 */}
      <div className="text-right">
        {log.users && (
          <LogActorInfo users={log.users} created_at={log.created_at} updated_at={log.updated_at} />
        )}
      </div>

      <div className="ml-4 flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            copyLogToClipboard(
              log,
              { name: log.customers?.name, phone: log.customers?.phone, gender: log.customers?.gender },
              '특이사항',
            )
          }
          disabled={isSaving}
        >
          복사
        </Button>
        {isAdmin && (
          <Button
            variant="danger"
            size="sm"
            onClick={onDelete}
            disabled={isSaving}
          >
            삭제
          </Button>
        )}
      </div>
    </div>
  );
};

export default RemarkHistoryItem;
