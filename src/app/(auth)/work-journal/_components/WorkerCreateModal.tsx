'use client';

import { FormEvent, useState } from 'react';
import Button from '@/app/_components/Button';
import { WorkerDetailType } from '@/app/_domains/_workJournal/_types/workJournal.types';

type WorkerFormValues = {
  name: string;
  phoneNumber: string;
  bankAccount: string;
  firstWorkDate: string;
  note: string;
};

interface WorkerCreateModalProps {
  workers: WorkerDetailType[];
  onCreate: (values: WorkerFormValues) => Promise<void>;
  onUpdate: (workerId: string, values: Omit<WorkerFormValues, 'name'>) => Promise<void>;
  onDelete: (name: string) => Promise<void>;
  onCancel: () => void;
}

const EMPTY_FORM: WorkerFormValues = {
  name: '',
  phoneNumber: '',
  bankAccount: '',
  firstWorkDate: '',
  note: '',
};

const WorkerCreateModal = ({
  workers,
  onCreate,
  onUpdate,
  onDelete,
  onCancel,
}: WorkerCreateModalProps) => {
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingWorkerId, setEditingWorkerId] = useState('');
  const [visibleWorkers, setVisibleWorkers] = useState(workers);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingName, setDeletingName] = useState('');

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingWorkerId('');
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.firstWorkDate || isSubmitting) return;

    try {
      setIsSubmitting(true);
      if (editingWorkerId) {
        await onUpdate(editingWorkerId, {
          phoneNumber: form.phoneNumber,
          bankAccount: form.bankAccount,
          firstWorkDate: form.firstWorkDate,
          note: form.note,
        });
        setVisibleWorkers((previous) =>
          previous.map((worker) =>
            worker.id === editingWorkerId
              ? {
                  ...worker,
                  phone_number: form.phoneNumber,
                  bank_account: form.bankAccount,
                  first_work_date: form.firstWorkDate,
                  note: form.note || null,
                }
              : worker,
          ),
        );
        resetForm();
      } else {
        await onCreate(form);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEditing = (worker: WorkerDetailType) => {
    setEditingWorkerId(worker.id);
    setForm({
      name: worker.name,
      phoneNumber: worker.phone_number,
      bankAccount: worker.bank_account,
      firstWorkDate: worker.first_work_date,
      note: worker.note ?? '',
    });
  };

  return (
    <div className="flex max-h-[75vh] w-full flex-col">
      <h2 className="shrink-0 text-lg font-semibold text-gray-900">근무자 관리</h2>
      <p className="mt-1 shrink-0 text-sm text-gray-500">
        개인정보는 관리자 계정에서만 확인할 수 있습니다.
      </p>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
        <form onSubmit={handleSubmit} className="rounded-lg border border-brand-100 bg-brand-50/40 p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-800">
            {editingWorkerId ? '근무자 정보 수정' : '새 근무자 추가'}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <WorkerField label="이름" required>
              <input
                autoFocus
                value={form.name}
                readOnly={!!editingWorkerId}
                onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))}
                maxLength={50}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 read-only:bg-gray-100"
                placeholder="이름"
              />
            </WorkerField>
            <WorkerField label="전화번호">
              <input
                value={form.phoneNumber}
                onChange={(event) => setForm((previous) => ({ ...previous, phoneNumber: event.target.value }))}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                placeholder="010-0000-0000"
              />
            </WorkerField>
            <WorkerField label="계좌번호">
              <input
                value={form.bankAccount}
                onChange={(event) => setForm((previous) => ({ ...previous, bankAccount: event.target.value }))}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                placeholder="은행명 계좌번호"
              />
            </WorkerField>
            <WorkerField label="최초 근무 날짜" required>
              <input
                type="date"
                value={form.firstWorkDate}
                onChange={(event) => setForm((previous) => ({ ...previous, firstWorkDate: event.target.value }))}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
            </WorkerField>
          </div>
          <WorkerField label="특이사항" className="mt-3">
            <textarea
              value={form.note}
              onChange={(event) => setForm((previous) => ({ ...previous, note: event.target.value }))}
              className="min-h-20 w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              placeholder="특이사항이 없으면 비워두세요"
            />
          </WorkerField>
          <div className="mt-3 flex justify-end gap-2">
            {editingWorkerId && (
              <Button type="button" size="sm" variant="gray" onClick={resetForm}>
                수정 취소
              </Button>
            )}
            <Button
              type="submit"
              size="sm"
              disabled={!form.name.trim() || !form.firstWorkDate || isSubmitting}
            >
              {isSubmitting ? '저장 중...' : editingWorkerId ? '수정 저장' : '근무자 추가'}
            </Button>
          </div>
        </form>

        <div className="mt-5">
          <h3 className="text-sm font-medium text-gray-700">등록된 근무자</h3>
          {visibleWorkers.length > 0 ? (
            <div className="mt-2 space-y-2">
              {visibleWorkers.map((worker) => (
                <div key={worker.id} className="rounded-lg border border-gray-100 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900">{worker.name}</p>
                      <div className="mt-1 space-y-0.5 text-xs text-gray-500">
                        <p>전화번호: {worker.phone_number || '-'}</p>
                        <p>계좌번호: {worker.bank_account || '-'}</p>
                        <p>최초 근무일: {worker.first_work_date || '-'}</p>
                        <p className="whitespace-pre-wrap">특이사항: {worker.note || '-'}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button type="button" size="xs" variant="gray" onClick={() => startEditing(worker)}>
                        수정
                      </Button>
                      <Button
                        type="button"
                        size="xs"
                        variant="danger"
                        disabled={deletingName === worker.name}
                        onClick={async () => {
                          if (!window.confirm(`${worker.name}님을 근무자 선택 목록에서 삭제하시겠습니까?`)) return;
                          try {
                            setDeletingName(worker.name);
                            await onDelete(worker.name);
                            setVisibleWorkers((previous) =>
                              previous.filter((item) => item.id !== worker.id),
                            );
                            if (editingWorkerId === worker.id) resetForm();
                          } finally {
                            setDeletingName('');
                          }
                        }}
                      >
                        {deletingName === worker.name ? '삭제 중...' : '삭제'}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 rounded-lg bg-gray-50 px-3 py-4 text-center text-sm text-gray-500">
              등록된 근무자가 없습니다.
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex shrink-0 justify-end border-t border-gray-100 pt-4">
        <Button type="button" size="sm" variant="gray" onClick={onCancel}>
          닫기
        </Button>
      </div>
    </div>
  );
};

const WorkerField = ({
  label,
  required = false,
  className = '',
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) => (
  <label className={`block ${className}`}>
    <span className="mb-1 block text-xs font-medium text-gray-600">
      {label} {required && <span className="text-rose-600">*</span>}
    </span>
    {children}
  </label>
);

export default WorkerCreateModal;
