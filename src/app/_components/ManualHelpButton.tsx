'use client';

import { useDeferredValue, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Button from '@/app/_components/Button';
import Loading from '@/app/_components/Loading';
import TaggedContent from '@/app/_components/TaggedContent';
import { manualHelpKeys } from '@/app/_domains/_manual/_queryKeys/manualHelpKeys';
import {
  deleteManualHelpBinding,
  getCurrentUserIsAdmin,
  getManualHelpBinding,
  saveManualHelpBinding,
  searchManualHelpOptions,
} from '@/app/_domains/_manual/_services/manualHelpService';

const ManualHelpButton = ({
  locationKey,
  ariaLabel,
  className = '',
  onPlacementEdit,
  buttonSize = 24,
}: {
  locationKey: string;
  ariaLabel: string;
  className?: string;
  onPlacementEdit?: () => void;
  buttonSize?: number;
}) => {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const deferredKeyword = useDeferredValue(keyword);
  const adminQuery = useQuery({
    queryKey: [...manualHelpKeys.all, 'current-user-is-admin'],
    queryFn: getCurrentUserIsAdmin,
    staleTime: 5 * 60 * 1000,
  });
  const isAdmin = adminQuery.data ?? false;
  const bindingQuery = useQuery({
    queryKey: manualHelpKeys.binding(locationKey),
    queryFn: () => getManualHelpBinding(locationKey),
    retry: false,
  });
  const optionsQuery = useQuery({
    queryKey: manualHelpKeys.options(deferredKeyword.trim()),
    queryFn: () => searchManualHelpOptions(deferredKeyword),
    enabled: isOpen && isAdmin && isSelecting,
  });

  useEffect(() => {
    if (!isOpen) return;
    setIsSelecting(isAdmin && !bindingQuery.data);
    setSelectedId(bindingQuery.data?.manualId ?? '');
  }, [bindingQuery.data, isAdmin, isOpen]);

  const close = () => {
    setIsOpen(false);
    setKeyword('');
  };
  const refreshBinding = () =>
    queryClient.invalidateQueries({
      queryKey: manualHelpKeys.all,
    });
  const handleSave = async () => {
    if (!selectedId) return;
    try {
      setIsSaving(true);
      await saveManualHelpBinding(locationKey, selectedId);
      await refreshBinding();
      setIsSelecting(false);
      toast.success('매뉴얼을 연결했습니다.');
    } catch (error) {
      console.error('Failed to save manual help binding:', error);
      toast.error('매뉴얼을 연결하지 못했습니다.');
    } finally {
      setIsSaving(false);
    }
  };
  const handleDelete = async () => {
    try {
      setIsSaving(true);
      await deleteManualHelpBinding(locationKey);
      await refreshBinding();
      setSelectedId('');
      close();
      toast.success('배치된 ?를 삭제했습니다. 원본 매뉴얼은 유지됩니다.');
    } catch (error) {
      console.error('Failed to delete manual help binding:', error);
      toast.error('배치된 ?를 삭제하지 못했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const manual = bindingQuery.data?.manual;
  const topName = manual?.manual_sub_categories?.manual_top_categories?.name;
  const subName = manual?.manual_sub_categories?.name;

  return (
    <>
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={(event) => {
          event.stopPropagation();
          if (onPlacementEdit) {
            onPlacementEdit();
            return;
          }
          setIsOpen(true);
        }}
        style={{ width: buttonSize, height: buttonSize }}
        className={`group flex shrink-0 items-center justify-center rounded-full border border-brand-200 bg-brand-50 text-brand-600 shadow-sm ring-1 ring-white transition-all duration-150 hover:border-brand-400 hover:bg-brand-500 hover:text-white hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-1 active:scale-95 ${className}`}
      >
        <span style={{ fontSize: Math.max(11, Math.round(buttonSize * 0.54)) }} className="font-extrabold leading-none">?</span>
      </button>

      {isOpen &&
        createPortal(
        <div
          className="fixed inset-0 z-[2200] flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">
                {isSelecting ? '매뉴얼 선택' : '도움말'}
              </h2>
              <button
                type="button"
                aria-label="도움말 닫기"
                onClick={close}
                className="flex h-8 w-8 items-center justify-center rounded-full text-xl text-gray-500 hover:bg-gray-100"
              >
                ×
              </button>
            </div>

            {bindingQuery.isPending ? (
              <Loading size="sm" text="매뉴얼을 불러오는 중..." />
            ) : bindingQuery.isError ? (
              <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
                매뉴얼 연결 정보를 불러오지 못했습니다.
              </p>
            ) : isSelecting && isAdmin ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <input
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="매뉴얼 제목 검색"
                  className="mb-3 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-900 shadow-sm outline-none transition placeholder:font-normal placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50/70 p-2">
                  {optionsQuery.isPending ? (
                    <Loading size="sm" text="매뉴얼 목록 불러오는 중..." />
                  ) : optionsQuery.data?.length ? (
                    optionsQuery.data.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setSelectedId(option.id)}
                        className={`w-full rounded-lg border p-3 text-left text-sm transition ${selectedId === option.id ? 'border-brand-400 bg-brand-50 text-brand-800' : 'border-gray-200 bg-white text-gray-700 hover:border-brand-300'}`}
                      >
                        <span className="block font-semibold">{option.title}</span>
                        <span className="mt-1 block text-xs text-gray-500">
                          {option.manual_sub_categories?.manual_top_categories?.name}
                          {option.manual_sub_categories?.name
                            ? ` › ${option.manual_sub_categories.name}`
                            : ''}
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="p-4 text-center text-sm text-gray-500">
                      검색된 매뉴얼이 없습니다.
                    </p>
                  )}
                </div>
                <div className="mt-4 flex justify-end gap-2 border-t border-gray-200 pt-3">
                  {bindingQuery.data && (
                    <Button
                      size="sm"
                      variant="gray"
                      onClick={() => setIsSelecting(false)}
                    >
                      취소
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={!selectedId || isSaving}
                  >
                    {isSaving ? '연결 중...' : '연결'}
                  </Button>
                </div>
              </div>
            ) : manual ? (
              <div className="flex min-h-0 flex-1 flex-col">
                {(topName || subName) && (
                  <span className="mb-2 inline-flex w-fit rounded-md bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
                    {[topName, subName].filter(Boolean).join(' › ')}
                  </span>
                )}
                <h3 className="mb-3 text-base font-semibold">{manual.title}</h3>
                <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <TaggedContent
                    content={manual.content}
                    className="text-sm leading-relaxed text-gray-800"
                  />
                </div>
                <div className="mt-4 flex items-center justify-between gap-2 border-t border-gray-200 pt-3">
                  <div>
                    {isAdmin && (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={handleDelete}
                        disabled={isSaving}
                      >
                        삭제하기
                      </Button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {isAdmin && (
                      <Button
                        size="sm"
                        variant="gray"
                        onClick={() => setIsSelecting(true)}
                        disabled={isSaving}
                      >
                        연결 변경
                      </Button>
                    )}
                    <Button size="sm" variant="gray" onClick={close}>
                      닫기
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
                  연결된 매뉴얼이 없습니다.
                </p>
                <div className="mt-4 flex justify-end">
                  <Button size="sm" variant="gray" onClick={close}>
                    닫기
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>,
          document.body,
        )}
    </>
  );
};

export default ManualHelpButton;
