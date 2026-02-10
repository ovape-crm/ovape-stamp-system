'use client';

import Button from '@/app/_components/Button';
import { Dropdown, DropdownOption } from '@/app/_components/Dropdown';
import { useState } from 'react';

interface SearchBoxProps {
  onSearch: (target: string, keyword: string) => void;
}

const targetOptions = [
  { label: '전체', value: 'all' },
  { label: '이름', value: 'name' },
  { label: '전화번호', value: 'phone' },
];

const SearchBox = ({ onSearch }: SearchBoxProps) => {
  const [target, setTarget] = useState('all');
  const [keyword, setKeyword] = useState('');

  const handleSearch = () => {
    onSearch(target, keyword);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-brand-100 p-4 sm:p-6">
      <div className="flex gap-2 sm:gap-3 items-center">
        <div className="w-[120px] sm:w-[150px]">
          <Dropdown>
            <Dropdown.Trigger>
              {targetOptions.find((option) => option.value === target)?.label}
            </Dropdown.Trigger>
            <Dropdown.Content>
              {targetOptions.map((option) => {
                return (
                  <Dropdown.Item
                    key={option.value}
                    option={option}
                    onSelect={(option: DropdownOption) =>
                      setTarget(option.value as string)
                    }
                  />
                );
              })}
            </Dropdown.Content>
          </Dropdown>
        </div>
        <input
          type="text"
          placeholder="검색어 입력"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyPress={handleKeyPress}
          className="flex-1 px-3 py-1.5 sm:px-4 sm:py-2 border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-transparent text-xs sm:text-sm"
        />

        <Button size="sm" onClick={handleSearch}>
          검색
        </Button>
      </div>
    </div>
  );
};

export default SearchBox;
