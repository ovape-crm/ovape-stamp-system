'use client';

import Button from '@/app/_components/Button';
import { Dropdown, DropdownOption } from '@/app/_components/Dropdown';
import { useState } from 'react';
import { ItemCategoryType } from '@/app/_domains/_item/_types/item.types';

interface ItemSearchBoxProps {
  categories: ItemCategoryType[];
  onSearch?: (filters: {
    categoryId?: string;
    searchTarget?: string;
    searchKeyword?: string;
  }) => void;
}

const searchTargetOptions = [
  { label: '품목 코드', value: 'item_code' },
  { label: '품목 명', value: 'item_name' },
  { label: '액상 종류', value: 'liquid_type' },
  { label: '액상 맛', value: 'liquid_flavor' },
];

const ItemSearchBox = ({ categories, onSearch }: ItemSearchBoxProps) => {
  const [categoryId, setCategoryId] = useState('');
  const [searchTarget, setSearchTarget] = useState('item_name');
  const [keyword, setKeyword] = useState('');

  const categoryOptions = [
    { label: '전체', value: '' },
    ...categories.map((c) => ({ label: c.name, value: c.id })),
  ];

  const handleSearch = () => {
    onSearch?.({
      categoryId: categoryId || undefined,
      searchTarget: keyword ? searchTarget : undefined,
      searchKeyword: keyword || undefined,
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-brand-100 p-4 sm:p-6">
      <div className="flex flex-col gap-4 text-xs sm:text-sm">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 sm:gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="font-medium text-gray-600">카테고리</label>
            <div className="w-full sm:w-[200px]">
              <Dropdown controlledValue={categoryId}>
                <Dropdown.Trigger>
                  {categoryOptions.find((o) => o.value === categoryId)?.label ?? '전체'}
                </Dropdown.Trigger>
                <Dropdown.Content>
                  {categoryOptions.map((option) => (
                    <Dropdown.Item
                      key={option.value}
                      option={option}
                      onSelect={(o: DropdownOption) => {
                        const newCategoryId = String(o.value);
                        setCategoryId(newCategoryId);
                        onSearch?.({
                          categoryId: newCategoryId || undefined,
                          searchTarget: keyword ? searchTarget : undefined,
                          searchKeyword: keyword || undefined,
                        });
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
              onKeyPress={handleKeyPress}
              className="w-full px-3 py-1.5 sm:px-4 sm:py-2 border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-transparent text-xs sm:text-sm"
            />
          </div>
          <Button onClick={handleSearch} size="sm">
            검색
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ItemSearchBox;
