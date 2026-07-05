'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Button from '@/app/_components/Button';
import { Dropdown, DropdownOption } from '@/app/_components/Dropdown';
import {
  ManualTopCategoryType,
  ManualSubCategoryType,
} from '@/app/_domains/_manual/_types/manual.types';
import { ManualSearchCondition } from '@/app/_domains/_manual/_queryKeys/manualKeys';

interface ManualSearchBoxProps {
  topCategories: ManualTopCategoryType[];
  subCategoriesByTop: Record<string, ManualSubCategoryType[]>;
  onSearch?: (filters: {
    subCategoryId?: string;
    subCategoryIds?: string[];
    searchConditions?: ManualSearchCondition[];
  }) => void;
}

const searchTargetOptions = [
  { label: '제목', value: 'title' },
  { label: '내용', value: 'content' },
];

const getTargetLabel = (value: string) =>
  searchTargetOptions.find((o) => o.value === value)?.label ?? value;

const ManualSearchBox = ({
  topCategories,
  subCategoriesByTop,
  onSearch,
}: ManualSearchBoxProps) => {
  const [topCategoryId, setTopCategoryId] = useState('');
  const [subCategoryId, setSubCategoryId] = useState('');
  const [searchTarget, setSearchTarget] = useState('title');
  const [keyword, setKeyword] = useState('');
  const [conditions, setConditions] = useState<ManualSearchCondition[]>([]);

  // 상위 타입이 바뀌면(더 이상 유효하지 않으면) 하위 타입 선택 초기화
  useEffect(() => {
    if (!topCategoryId) {
      setSubCategoryId('');
      return;
    }
    const siblings = subCategoriesByTop[topCategoryId] ?? [];
    if (!siblings.some((s) => s.id === subCategoryId)) {
      setSubCategoryId('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topCategoryId]);

  const topCategoryOptions = [
    { label: '전체', value: '' },
    ...topCategories.map((c) => ({ label: c.name, value: c.id })),
  ];

  const subCategoryOptions = [
    { label: '전체', value: '' },
    ...(subCategoriesByTop[topCategoryId] ?? []).map((c) => ({
      label: c.name,
      value: c.id,
    })),
  ];

  const resolveCategoryFilter = (nextTopId: string, nextSubId: string) => {
    if (nextSubId) {
      return { subCategoryId: nextSubId, subCategoryIds: undefined };
    }
    if (nextTopId) {
      return {
        subCategoryId: undefined,
        subCategoryIds: (subCategoriesByTop[nextTopId] ?? []).map((s) => s.id),
      };
    }
    return { subCategoryId: undefined, subCategoryIds: undefined };
  };

  const fireSearch = (
    nextTopId: string,
    nextSubId: string,
    nextConditions: ManualSearchCondition[],
  ) => {
    onSearch?.({
      ...resolveCategoryFilter(nextTopId, nextSubId),
      searchConditions: nextConditions.length ? nextConditions : undefined,
    });
  };

  const handleAddCondition = () => {
    if (!keyword.trim()) return;
    if (conditions.some((c) => c.searchTarget === searchTarget)) {
      toast.error(`"${getTargetLabel(searchTarget)}" 필터를 제거 후 다시 검색해주세요.`);
      return;
    }
    const next = [
      ...conditions,
      { searchTarget, searchKeyword: keyword.trim() },
    ];
    setConditions(next);
    setKeyword('');
    fireSearch(topCategoryId, subCategoryId, next);
  };

  const handleRemoveCondition = (index: number) => {
    const next = conditions.filter((_, i) => i !== index);
    setConditions(next);
    fireSearch(topCategoryId, subCategoryId, next);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') handleAddCondition();
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-brand-100 p-4 sm:p-6">
      <div className="flex flex-col gap-4 text-xs sm:text-sm">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 sm:gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="font-medium text-gray-600">카테고리</label>
            <div className="w-full sm:w-[180px]">
              <Dropdown controlledValue={topCategoryId}>
                <Dropdown.Trigger>
                  {topCategoryOptions.find((o) => o.value === topCategoryId)?.label ?? '전체'}
                </Dropdown.Trigger>
                <Dropdown.Content>
                  {topCategoryOptions.map((option, i) => (
                    <Dropdown.Item
                      key={`top-${i}-${option.value}`}
                      option={option}
                      onSelect={(o: DropdownOption) => {
                        const newTopId = String(o.value);
                        setTopCategoryId(newTopId);
                        setSubCategoryId('');
                        fireSearch(newTopId, '', conditions);
                      }}
                    />
                  ))}
                </Dropdown.Content>
              </Dropdown>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="font-medium text-gray-600">하위 카테고리</label>
            <div className="w-full sm:w-[180px]">
              <Dropdown controlledValue={subCategoryId}>
                <Dropdown.Trigger>
                  {subCategoryOptions.find((o) => o.value === subCategoryId)?.label ?? '전체'}
                </Dropdown.Trigger>
                <Dropdown.Content>
                  {subCategoryOptions.map((option, i) => (
                    <Dropdown.Item
                      key={`sub-${i}-${option.value}`}
                      option={option}
                      onSelect={(o: DropdownOption) => {
                        const newSubId = String(o.value);
                        setSubCategoryId(newSubId);
                        fireSearch(topCategoryId, newSubId, conditions);
                      }}
                    />
                  ))}
                </Dropdown.Content>
              </Dropdown>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="font-medium text-gray-600">검색 조건</label>
            <div className="w-full sm:w-[160px]">
              <Dropdown>
                <Dropdown.Trigger>
                  {searchTargetOptions.find((o) => o.value === searchTarget)?.label}
                </Dropdown.Trigger>
                <Dropdown.Content>
                  {searchTargetOptions.map((option) => (
                    <Dropdown.Item
                      key={option.value}
                      option={option}
                      onSelect={(o: DropdownOption) =>
                        setSearchTarget(o.value as string)
                      }
                    />
                  ))}
                </Dropdown.Content>
              </Dropdown>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 pt-2 border-t border-gray-100">
          <div className="flex-1">
            <input
              type="text"
              placeholder="검색어를 입력하세요"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full px-3 py-1.5 sm:px-4 sm:py-2 border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-transparent text-xs sm:text-sm"
            />
          </div>
          <Button onClick={handleAddCondition} size="sm">
            검색
          </Button>
        </div>

        {conditions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {conditions.map((cond, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-brand-50 text-brand-700 border border-brand-200 rounded-full text-xs"
              >
                {getTargetLabel(cond.searchTarget)} = &quot;{cond.searchKeyword}&quot;
                <button
                  type="button"
                  onClick={() => handleRemoveCondition(i)}
                  className="text-brand-400 hover:text-brand-600 font-bold leading-none cursor-pointer"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ManualSearchBox;
