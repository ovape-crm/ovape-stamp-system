'use client';

import Button from '@/app/_components/Button';
import { Dropdown, DropdownOption } from '@/app/_components/Dropdown';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { ItemCategoryType } from '@/app/_domains/_item/_types/item.types';
import { SearchCondition } from '@/app/_domains/_item/_queryKeys/itemKeys';

interface ItemSearchBoxProps {
  categories: ItemCategoryType[];
  onSearch?: (filters: {
    isUse?: boolean;
    categoryId?: string;
    searchConditions?: SearchCondition[];
  }) => void;
}

const useStatusOptions = [
  { label: '전체', value: '' },
  { label: '사용', value: 'true' },
  { label: '미사용', value: 'false' },
];

const searchTargetOptions = [
  { label: '품목 코드', value: 'item_code' },
  { label: '품목 명', value: 'item_name' },
  { label: '액상 종류', value: 'liquid_type' },
  { label: '액상 맛', value: 'liquid_flavor' },
];

const getTargetLabel = (value: string) =>
  searchTargetOptions.find((o) => o.value === value)?.label ?? value;

const ItemSearchBox = ({ categories, onSearch }: ItemSearchBoxProps) => {
  const [useStatus, setUseStatus] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [searchTarget, setSearchTarget] = useState('item_name');
  const [keyword, setKeyword] = useState('');
  const [conditions, setConditions] = useState<SearchCondition[]>([]);

  const categoryOptions = [
    { label: '전체', value: '' },
    ...categories.map((c) => ({ label: c.name, value: String(c.id) })),
  ];

  const fireSearch = (
    nextUseStatus: string,
    nextCategoryId: string,
    nextConditions: SearchCondition[],
  ) => {
    onSearch?.({
      isUse: nextUseStatus === '' ? undefined : nextUseStatus === 'true',
      categoryId: nextCategoryId || undefined,
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
    fireSearch(useStatus, categoryId, next);
  };

  const handleRemoveCondition = (index: number) => {
    const next = conditions.filter((_, i) => i !== index);
    setConditions(next);
    fireSearch(useStatus, categoryId, next);
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
            <label className="font-medium text-gray-600">사용 상태</label>
            <div className="w-full sm:w-[140px]">
              <Dropdown controlledValue={useStatus}>
                <Dropdown.Trigger>
                  {useStatusOptions.find((o) => o.value === useStatus)?.label ?? '전체'}
                </Dropdown.Trigger>
                <Dropdown.Content>
                  {useStatusOptions.map((option, i) => (
                    <Dropdown.Item
                      key={`use-${i}-${option.value}`}
                      option={option}
                      onSelect={(o: DropdownOption) => {
                        const newStatus = String(o.value);
                        setUseStatus(newStatus);
                        fireSearch(newStatus, categoryId, conditions);
                      }}
                    />
                  ))}
                </Dropdown.Content>
              </Dropdown>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="font-medium text-gray-600">품목 종류</label>
            <div className="w-full sm:w-[200px]">
              <Dropdown controlledValue={categoryId}>
                <Dropdown.Trigger>
                  {categoryOptions.find((o) => o.value === categoryId)?.label ?? '전체'}
                </Dropdown.Trigger>
                <Dropdown.Content>
                  {categoryOptions.map((option, i) => (
                    <Dropdown.Item
                      key={`cat-${i}-${option.value}`}
                      option={option}
                      onSelect={(o: DropdownOption) => {
                        const newCategoryId = String(o.value);
                        setCategoryId(newCategoryId);
                        fireSearch(useStatus, newCategoryId, conditions);
                      }}
                    />
                  ))}
                </Dropdown.Content>
              </Dropdown>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="font-medium text-gray-600">검색 조건</label>
            <div className="w-full sm:w-[200px]">
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

export default ItemSearchBox;
