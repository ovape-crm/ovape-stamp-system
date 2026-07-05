'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import Button from '@/app/_components/Button';
import Loading from '@/app/_components/Loading';
import { useManualCategories } from '@/app/_domains/_manual/_hooks/useManualCategories';

interface ManualCategoryManageModalProps {
  tab: string;
  tabLabel: string;
  onClose: () => void;
}

type EditingState = { id: string; name: string };

const getErrorCode = (err: unknown) => (err as { code?: string })?.code;

const ManualCategoryManageModal = ({
  tab,
  tabLabel,
  onClose,
}: ManualCategoryManageModalProps) => {
  const {
    topCategories,
    subCategoriesByTop,
    isLoading,
    isSubmitting,
    addTopCategory,
    editTopCategory,
    removeTopCategory,
    moveTopCategory,
    addSubCategory,
    editSubCategory,
    removeSubCategory,
    moveSubCategory,
  } = useManualCategories(tab);

  const [expandedTopId, setExpandedTopId] = useState<string | null>(null);
  const [newTopName, setNewTopName] = useState('');
  const [newSubName, setNewSubName] = useState('');
  const [editingTop, setEditingTop] = useState<EditingState | null>(null);
  const [editingSub, setEditingSub] = useState<EditingState | null>(null);

  const toggleExpand = (topId: string) => {
    setExpandedTopId((prev) => (prev === topId ? null : topId));
    setNewSubName('');
    setEditingSub(null);
  };

  // ==========================================================================
  // 상위 타입
  // ==========================================================================

  const handleAddTop = async () => {
    if (!newTopName.trim()) return;
    try {
      await addTopCategory(newTopName.trim());
      setNewTopName('');
      toast.success('상위 카테고리가 추가되었습니다.');
    } catch {
      toast.error('상위 카테고리 추가에 실패했습니다.');
    }
  };

  const handleSaveTop = async (id: string) => {
    if (!editingTop || !editingTop.name.trim()) return;
    try {
      await editTopCategory(id, editingTop.name.trim());
      setEditingTop(null);
      toast.success('상위 카테고리가 수정되었습니다.');
    } catch {
      toast.error('상위 카테고리 수정에 실패했습니다.');
    }
  };

  const handleDeleteTop = async (id: string) => {
    try {
      await removeTopCategory(id);
      if (expandedTopId === id) setExpandedTopId(null);
      toast.success('상위 카테고리가 삭제되었습니다.');
    } catch (err) {
      if (getErrorCode(err) === '23503') {
        toast.error('하위 카테고리에 연결된 매뉴얼이 있어 삭제할 수 없습니다.');
      } else {
        toast.error('상위 카테고리 삭제에 실패했습니다.');
      }
    }
  };

  // ==========================================================================
  // 하위 타입
  // ==========================================================================

  const handleAddSub = async (topId: string) => {
    if (!newSubName.trim()) return;
    try {
      await addSubCategory(topId, newSubName.trim());
      setNewSubName('');
      toast.success('하위 카테고리가 추가되었습니다.');
    } catch {
      toast.error('하위 카테고리 추가에 실패했습니다.');
    }
  };

  const handleSaveSub = async (id: string) => {
    if (!editingSub || !editingSub.name.trim()) return;
    try {
      await editSubCategory(id, editingSub.name.trim());
      setEditingSub(null);
      toast.success('하위 카테고리가 수정되었습니다.');
    } catch {
      toast.error('하위 카테고리 수정에 실패했습니다.');
    }
  };

  const handleDeleteSub = async (id: string) => {
    try {
      await removeSubCategory(id);
      toast.success('하위 카테고리가 삭제되었습니다.');
    } catch (err) {
      if (getErrorCode(err) === '23503') {
        toast.error('연결된 매뉴얼이 있어 삭제할 수 없습니다.');
      } else {
        toast.error('하위 카테고리 삭제에 실패했습니다.');
      }
    }
  };

  return (
    <div className="w-full flex flex-col min-h-0">
      <h2 className="text-lg font-semibold mb-4 shrink-0">
        카테고리 관리 <span className="text-sm font-normal text-gray-500">({tabLabel})</span>
      </h2>

      <div className="overflow-y-auto min-h-0 flex-1">
        {isLoading ? (
          <Loading size="sm" text="불러오는 중..." />
        ) : topCategories.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">
            등록된 상위 카테고리가 없습니다.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {topCategories.map((top, topIdx) => {
              const subs = subCategoriesByTop[top.id] ?? [];
              const isExpanded = expandedTopId === top.id;

              return (
                <div
                  key={top.id}
                  className="border border-gray-100 rounded-lg overflow-hidden"
                >
                  {/* 상위 타입 행 */}
                  <div
                    onClick={() => {
                      if (editingTop?.id !== top.id) toggleExpand(top.id);
                    }}
                    className={`flex items-center gap-2 px-3 py-2.5 bg-gray-50 transition-colors ${
                      editingTop?.id === top.id
                        ? ''
                        : 'cursor-pointer hover:bg-gray-100'
                    }`}
                  >
                    <div
                      className="flex gap-1 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => moveTopCategory(top.id, 'up')}
                        disabled={topIdx === 0 || isSubmitting}
                        className="disabled:opacity-30 text-gray-400 hover:text-gray-700 text-xs"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => moveTopCategory(top.id, 'down')}
                        disabled={topIdx === topCategories.length - 1 || isSubmitting}
                        className="disabled:opacity-30 text-gray-400 hover:text-gray-700 text-xs"
                      >
                        ▼
                      </button>
                    </div>

                    {editingTop?.id === top.id ? (
                      <div
                        className="flex flex-1 items-center gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="text"
                          value={editingTop.name}
                          onChange={(e) =>
                            setEditingTop({ ...editingTop, name: e.target.value })
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveTop(top.id);
                          }}
                          autoFocus
                          className="flex-1 px-2 py-1 text-sm border border-brand-200 rounded focus:outline-none focus:ring-2 focus:ring-brand-300"
                        />
                        <Button
                          size="xs"
                          disabled={isSubmitting}
                          onClick={() => handleSaveTop(top.id)}
                        >
                          저장
                        </Button>
                        <Button
                          size="xs"
                          variant="gray"
                          onClick={() => setEditingTop(null)}
                        >
                          취소
                        </Button>
                      </div>
                    ) : (
                      <>
                        <span className="flex-1 flex items-center gap-1.5 text-sm font-medium text-gray-800">
                          {top.name}
                          {subs.length > 0 && (
                            <span className="text-gray-400 font-normal">
                              ({subs.length})
                            </span>
                          )}
                          <span className="text-gray-400 text-base leading-none flex items-center">
                            {isExpanded ? '▾' : '▸'}
                          </span>
                        </span>
                        <div
                          className="flex gap-1 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            size="xs"
                            variant="gray"
                            onClick={() =>
                              setEditingTop({ id: top.id, name: top.name })
                            }
                          >
                            수정
                          </Button>
                          <Button
                            size="xs"
                            variant="danger"
                            disabled={isSubmitting}
                            onClick={() => handleDeleteTop(top.id)}
                          >
                            삭제
                          </Button>
                        </div>
                      </>
                    )}
                  </div>

                  {/* 하위 타입 목록 */}
                  {isExpanded && (
                    <div className="pl-8 pr-3 py-2 flex flex-col gap-1 bg-white border-t border-gray-100">
                      {subs.length === 0 ? (
                        <p className="text-xs text-gray-400 py-1">
                          등록된 하위 카테고리가 없습니다.
                        </p>
                      ) : (
                        subs.map((sub, subIdx) => (
                          <div
                            key={sub.id}
                            className="flex items-center gap-2 px-2 py-1.5 rounded bg-gray-50/70"
                          >
                            <div className="flex gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => moveSubCategory(top.id, sub.id, 'up')}
                                disabled={subIdx === 0 || isSubmitting}
                                className="disabled:opacity-30 text-gray-400 hover:text-gray-700 text-xs"
                              >
                                ▲
                              </button>
                              <button
                                type="button"
                                onClick={() => moveSubCategory(top.id, sub.id, 'down')}
                                disabled={subIdx === subs.length - 1 || isSubmitting}
                                className="disabled:opacity-30 text-gray-400 hover:text-gray-700 text-xs"
                              >
                                ▼
                              </button>
                            </div>

                            {editingSub?.id === sub.id ? (
                              <>
                                <input
                                  type="text"
                                  value={editingSub.name}
                                  onChange={(e) =>
                                    setEditingSub({
                                      ...editingSub,
                                      name: e.target.value,
                                    })
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveSub(sub.id);
                                  }}
                                  autoFocus
                                  className="flex-1 px-2 py-1 text-sm border border-brand-200 rounded focus:outline-none focus:ring-2 focus:ring-brand-300"
                                />
                                <Button
                                  size="xs"
                                  disabled={isSubmitting}
                                  onClick={() => handleSaveSub(sub.id)}
                                >
                                  저장
                                </Button>
                                <Button
                                  size="xs"
                                  variant="gray"
                                  onClick={() => setEditingSub(null)}
                                >
                                  취소
                                </Button>
                              </>
                            ) : (
                              <>
                                <span className="flex-1 text-sm text-gray-700">
                                  {sub.name}
                                </span>
                                <Button
                                  size="xs"
                                  variant="gray"
                                  onClick={() =>
                                    setEditingSub({ id: sub.id, name: sub.name })
                                  }
                                >
                                  수정
                                </Button>
                                <Button
                                  size="xs"
                                  variant="danger"
                                  disabled={isSubmitting}
                                  onClick={() => handleDeleteSub(sub.id)}
                                >
                                  삭제
                                </Button>
                              </>
                            )}
                          </div>
                        ))
                      )}

                      <div className="flex gap-2 pt-1">
                        <input
                          type="text"
                          value={newSubName}
                          onChange={(e) => setNewSubName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleAddSub(top.id);
                          }}
                          placeholder="새 하위 카테고리 이름"
                          className="flex-1 px-3 py-1.5 text-sm border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300"
                        />
                        <Button
                          size="xs"
                          disabled={isSubmitting || !newSubName.trim()}
                          onClick={() => handleAddSub(top.id)}
                        >
                          추가
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 새 상위 카테고리 추가 */}
      <div className="flex gap-2 pt-3 mt-3 border-t border-gray-100 shrink-0">
        <input
          type="text"
          value={newTopName}
          onChange={(e) => setNewTopName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAddTop();
          }}
          placeholder="새 상위 카테고리 이름"
          className="flex-1 px-3 py-1.5 text-sm border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300"
        />
        <Button
          size="sm"
          onClick={handleAddTop}
          disabled={isSubmitting || !newTopName.trim()}
        >
          추가
        </Button>
      </div>

      <div className="flex justify-end pt-3 shrink-0">
        <Button size="sm" variant="gray" onClick={onClose}>
          닫기
        </Button>
      </div>
    </div>
  );
};

export default ManualCategoryManageModal;
