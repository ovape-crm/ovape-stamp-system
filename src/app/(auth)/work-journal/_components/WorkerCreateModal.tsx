'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Button from '@/app/_components/Button';
import { WorkerDetailType } from '@/app/_domains/_workJournal/_types/workJournal.types';

type WorkerFormValues = {
  name: string;
  phoneNumber: string;
  bankAccount: string;
  firstWorkDate: string;
  note: string;
  pin: string;
};

interface WorkerCreateModalProps {
  workers: WorkerDetailType[];
  onCreate: (values: WorkerFormValues) => Promise<void>;
  onUpdate: (
    workerId: string,
    values: Omit<WorkerFormValues, 'name'>,
  ) => Promise<void>;
  onDelete: (name: string) => Promise<void>;
  onCancel: () => void;
  embedded?: boolean;
}

const EMPTY_FORM: WorkerFormValues = {
  name: '',
  phoneNumber: '',
  bankAccount: '',
  firstWorkDate: '',
  note: '',
  pin: '',
};

const toForm = (worker: WorkerDetailType): WorkerFormValues => ({
  name: worker.name,
  phoneNumber: worker.phone_number,
  bankAccount: worker.bank_account,
  firstWorkDate: worker.first_work_date,
  note: worker.note ?? '',
  pin: worker.pin_code ?? '',
});

const WorkerCreateModal = ({
  workers,
  onCreate,
  onUpdate,
  onDelete,
  onCancel,
  embedded = false,
}: WorkerCreateModalProps) => {
  const [visibleWorkers, setVisibleWorkers] = useState(workers);
  const [selectedId, setSelectedId] = useState('');
  const [editingWorkerId, setEditingWorkerId] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [search, setSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingName, setDeletingName] = useState('');
  const [pendingCreatedName, setPendingCreatedName] = useState('');

  useEffect(() => {
    setVisibleWorkers(workers);
    if (pendingCreatedName) {
      const createdWorker = workers.find(
        (worker) => worker.name === pendingCreatedName,
      );
      if (createdWorker) {
        setSelectedId(createdWorker.id);
        setForm(toForm(createdWorker));
        setPendingCreatedName('');
      }
    }
    if (selectedId && !workers.some((worker) => worker.id === selectedId)) {
      setSelectedId('');
      setEditingWorkerId('');
    }
  }, [workers, selectedId, pendingCreatedName]);

  const selectedWorker = visibleWorkers.find(
    (worker) => worker.id === selectedId,
  );
  const isEditing = isCreating || editingWorkerId === selectedId;
  const filteredWorkers = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('ko-KR');
    if (!keyword) return visibleWorkers;
    return visibleWorkers.filter((worker) =>
      worker.name.toLocaleLowerCase('ko-KR').includes(keyword),
    );
  }, [search, visibleWorkers]);

  const selectWorker = (worker: WorkerDetailType) => {
    setSelectedId(worker.id);
    setForm(toForm(worker));
    setIsCreating(false);
    setEditingWorkerId('');
  };

  const startCreating = () => {
    setSelectedId('');
    setForm(EMPTY_FORM);
    setIsCreating(true);
    setEditingWorkerId('');
  };

  const cancelEditing = () => {
    if (isCreating) {
      setIsCreating(false);
      setEditingWorkerId('');
      setForm(EMPTY_FORM);
      return;
    }
    if (selectedWorker) setForm(toForm(selectedWorker));
    setEditingWorkerId('');
  };

  const isInvalid =
    !form.name.trim() ||
    !form.firstWorkDate ||
    (isCreating && form.pin.length !== 4) ||
    (form.pin.length > 0 && form.pin.length !== 4);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isInvalid || isSubmitting) return;
    try {
      setIsSubmitting(true);
      if (isCreating) {
        const createdName = form.name.trim();
        await onCreate(form);
        setPendingCreatedName(createdName);
        setIsCreating(false);
        setEditingWorkerId('');
        setForm(EMPTY_FORM);
      } else if (selectedWorker) {
        await onUpdate(selectedWorker.id, {
          phoneNumber: form.phoneNumber,
          bankAccount: form.bankAccount,
          firstWorkDate: form.firstWorkDate,
          note: form.note,
          pin: form.pin,
        });
        setVisibleWorkers((previous) =>
          previous.map((worker) =>
            worker.id === selectedWorker.id
              ? {
                  ...worker,
                  phone_number: form.phoneNumber,
                  bank_account: form.bankAccount,
                  first_work_date: form.firstWorkDate,
                  note: form.note || null,
                  has_pin: Boolean(form.pin) || worker.has_pin,
                  pin_code: form.pin || worker.pin_code,
                }
              : worker,
          ),
        );
        setEditingWorkerId('');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={embedded ? 'w-full' : 'max-h-[75vh] w-full'}>
      <div className="mb-3 flex justify-end">
        <Button type="button" size="sm" onClick={startCreating}>
          근무자 추가
        </Button>
      </div>

      <div className="grid min-h-[620px] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm lg:grid-cols-[340px_1fr]">
        <aside className="border-b border-gray-200 bg-gray-50/50 p-5 lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-gray-900">근무자 목록</h3>
            <span className="text-sm text-gray-500">총 {visibleWorkers.length}명</span>
          </div>

          <div className="relative mt-4">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="m21 21-4.35-4.35m1.35-5.65a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
              />
            </svg>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-11 w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-10 pr-10 text-sm font-medium text-gray-900 shadow-sm outline-none transition placeholder:font-normal placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              placeholder="근무자명 검색"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="근무자명 검색어 지우기"
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-gray-100 text-base font-medium text-gray-500 transition hover:bg-gray-200 hover:text-gray-700 active:bg-gray-300"
              >
                ×
              </button>
            )}
          </div>

          <div className="mt-3 max-h-[450px] space-y-2 overflow-y-auto pr-1">
            {filteredWorkers.length ? (
              filteredWorkers.map((worker) => (
                <button
                  key={worker.id}
                  type="button"
                  onClick={() => selectWorker(worker)}
                  className={`w-full cursor-pointer rounded-xl border p-4 text-left transition-colors ${
                    selectedId === worker.id
                      ? 'border-brand-300 bg-brand-50'
                      : 'border-gray-200 bg-white hover:border-brand-200 hover:bg-brand-50/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <strong className="truncate text-sm text-gray-900">
                      {worker.name}
                    </strong>
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                      사용
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    최초 근무일 {worker.first_work_date || '-'} · PIN{' '}
                    {worker.pin_code ||
                      (worker.has_pin ? '재설정 필요' : '미설정')}
                  </p>
                </button>
              ))
            ) : (
              <p className="rounded-xl bg-white px-3 py-8 text-center text-sm text-gray-400">
                검색 결과가 없습니다.
              </p>
            )}
          </div>
        </aside>

        <section className="flex min-w-0 items-center justify-center p-5 sm:p-8">
          {!selectedWorker && !isCreating ? (
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                <svg
                  className="h-8 w-8"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.2}
                    d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87m-2-11.26a4 4 0 0 1 0 7.75"
                  />
                </svg>
              </div>
              <p className="mt-5 text-lg font-bold text-gray-900">
                근무자를 선택해 주세요
              </p>
              <p className="mt-2 text-sm text-gray-500">
                왼쪽 목록에서 근무자를 선택하면 상세 정보를 확인할 수 있습니다.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="w-full max-w-3xl">
              <div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <WorkerField label="이름" required>
                    <input
                      autoFocus={isCreating}
                      value={form.name}
                      readOnly={!isCreating}
                      aria-readonly={!isCreating}
                      onChange={(event) =>
                        setForm((previous) => ({
                          ...previous,
                          name: event.target.value,
                        }))
                      }
                      maxLength={50}
                      className={inputClass}
                      placeholder="이름"
                    />
                  </WorkerField>
                  <WorkerField label="전화번호">
                    <input
                      value={form.phoneNumber}
                      readOnly={!isEditing}
                      aria-readonly={!isEditing}
                      onChange={(event) =>
                        setForm((previous) => ({
                          ...previous,
                          phoneNumber: event.target.value,
                        }))
                      }
                      className={inputClass}
                      placeholder="010-0000-0000"
                    />
                  </WorkerField>
                  <WorkerField label="계좌번호">
                    <input
                      value={form.bankAccount}
                      readOnly={!isEditing}
                      aria-readonly={!isEditing}
                      onChange={(event) =>
                        setForm((previous) => ({
                          ...previous,
                          bankAccount: event.target.value,
                        }))
                      }
                      className={inputClass}
                      placeholder="은행명 계좌번호"
                    />
                  </WorkerField>
                  <WorkerField label="최초 근무 날짜" required>
                    <input
                      type="date"
                      value={form.firstWorkDate}
                      disabled={!isEditing}
                      onChange={(event) =>
                        setForm((previous) => ({
                          ...previous,
                          firstWorkDate: event.target.value,
                        }))
                      }
                      className={`${inputClass} cursor-pointer`}
                    />
                  </WorkerField>
                  <WorkerField
                    label="개인 PIN 4자리"
                    required={isCreating}
                  >
                    <input
                      type="text"
                      inputMode="numeric"
                      value={form.pin}
                      readOnly={!isEditing}
                      aria-readonly={!isEditing}
                      onChange={(event) =>
                        setForm((previous) => ({
                          ...previous,
                          pin: event.target.value.replace(/\D/g, '').slice(0, 4),
                        }))
                      }
                      minLength={4}
                      maxLength={4}
                      className={inputClass}
                      placeholder={
                        selectedWorker?.pin_code
                          ? 'PIN 4자리'
                          : selectedWorker?.has_pin
                            ? '기존 PIN을 한 번 재설정해 주세요'
                            : 'PIN 4자리'
                      }
                    />
                  </WorkerField>
                  <WorkerField label="사용 상태">
                    <div className="flex min-h-[42px] items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3">
                      <span className="text-sm text-gray-600">
                        근무자 선택 목록 표시
                      </span>
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        사용
                      </span>
                    </div>
                  </WorkerField>
                  <WorkerField label="특이사항" className="sm:col-span-2">
                    <textarea
                      value={form.note}
                      readOnly={!isEditing}
                      aria-readonly={!isEditing}
                      onChange={(event) =>
                        setForm((previous) => ({
                          ...previous,
                          note: event.target.value,
                        }))
                      }
                      className={`${inputClass} min-h-24 resize-none`}
                      placeholder="특이사항이 없으면 비워두세요"
                    />
                  </WorkerField>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-end gap-2">
                {selectedWorker && !isEditing ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      disabled={deletingName === selectedWorker.name}
                      onClick={async () => {
                        if (
                          !window.confirm(
                            `${selectedWorker.name}님을 근무자 선택 목록에서 삭제하시겠습니까?`,
                          )
                        )
                          return;
                        try {
                          setDeletingName(selectedWorker.name);
                          await onDelete(selectedWorker.name);
                          setSelectedId('');
                          setForm(EMPTY_FORM);
                        } finally {
                          setDeletingName('');
                        }
                      }}
                    >
                      {deletingName === selectedWorker.name ? '삭제 중...' : '삭제'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={(event) => {
                        event?.preventDefault();
                        event?.stopPropagation();
                        setForm(toForm(selectedWorker));
                        setEditingWorkerId(selectedWorker.id);
                      }}
                    >
                      수정하기
                    </Button>
                  </>
                ) : (
                  <>
                    <Button type="button" size="sm" variant="gray" onClick={cancelEditing}>
                      취소하기
                    </Button>
                    <Button type="submit" size="sm" disabled={isInvalid || isSubmitting}>
                      {isSubmitting
                        ? '저장 중...'
                        : isCreating
                          ? '근무자 추가'
                          : '변경사항 저장'}
                    </Button>
                  </>
                )}
              </div>
            </form>
          )}
        </section>
      </div>

      {!embedded && (
        <div className="mt-4 flex justify-end">
          <Button type="button" size="sm" variant="gray" onClick={onCancel}>
            닫기
          </Button>
        </div>
      )}
    </div>
  );
};

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:bg-gray-50 disabled:text-gray-700 disabled:opacity-100 read-only:bg-gray-50';

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
