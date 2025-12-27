'use client';

import Button from '@/app/_components/Button';
import {
  ActionInfoLabel,
  LogActorInfo,
} from '@/app/(auth)/_components/HistoriesComponents';
import { AfterServiceLogType } from '@/app/_types/log.types';

interface AfterServiceLogItemProps {
  log: AfterServiceLogType;
  isEditing: boolean;
  noteDraft: string;
  currentNote: string;
  onNoteChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onEdit: () => void;
  isSaving: boolean;
}

const AfterServiceLogItem = ({
  log,
  isEditing,
  noteDraft,
  currentNote,
  onNoteChange,
  onSave,
  onCancel,
  onEdit,
  isSaving,
}: AfterServiceLogItemProps) => {
  return (
    <div className="flex items-center justify-between p-4 rounded-lg border border-brand-50 hover:bg-brand-50/30 transition-colors">
      <ActionInfoLabel action={log.action} />

      <div className="flex-1 pl-4 ml-4 border-l border-brand-100">
        {isEditing ? (
          <div key="edit" className="flex flex-col gap-2 pr-4">
            <textarea
              className="flex-1 text-sm px-2 py-2 rounded border border-brand-200 focus:outline-none focus:ring-2 focus:ring-brand-200 resize-none min-h-[60px]"
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
            <span className="flex-1 text-sm text-gray-600 break-words whitespace-pre-line">
              {currentNote || <span className="text-gray-400"> - </span>}
            </span>
          </div>
        )}
      </div>

      <div className="text-right">
        {log.users && (
          <LogActorInfo users={log.users} created_at={log.created_at} />
        )}
      </div>
    </div>
  );
};

export default AfterServiceLogItem;
