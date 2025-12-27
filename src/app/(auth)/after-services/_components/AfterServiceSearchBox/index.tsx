'use client';

import Button from '@/app/_components/Button';
import { Dropdown, DropdownOption } from '@/app/_components/Dropdown';
import { useState } from 'react';
import { AfterServiceStatusEnum } from '@/app/_enums/enums';

interface SearchBoxProps {
  onSearch?: (target: string, keyword: string) => void;
}

const targetOptions = [
  { label: '전체', value: 'all' },
  { label: '고객 이름', value: 'name' },
  { label: '고객 전화번호', value: 'phone' },
  { label: '기기/제품 이름', value: 'item_name' },
];

const symptomOptions = [
  { label: '전체', value: 'all' },
  ...Object.values(AfterServiceStatusEnum).map((option) => ({
    label: option.name,
    value: option.value,
  })),
];

const AfterServiceSearchBox = ({ onSearch }: SearchBoxProps) => {
  const [target, setTarget] = useState('all');
  const [symptom, setSymptom] = useState('all');
  const [keyword, setKeyword] = useState('');

  const handleSearch = () => {
    onSearch?.(target, keyword);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-brand-100 p-6">
      <div className="flex flex-col gap-4">
        {/* 필터 영역 */}
        <div className="flex items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-600">상태</label>
            <div className="w-[160px]">
              <Dropdown>
                <Dropdown.Trigger>
                  {
                    symptomOptions.find((option) => option.value === symptom)
                      ?.label
                  }
                </Dropdown.Trigger>
                <Dropdown.Content>
                  {symptomOptions.map((option) => {
                    return (
                      <Dropdown.Item
                        key={option.value}
                        option={option}
                        onSelect={(option: DropdownOption) =>
                          setSymptom(option.value as string)
                        }
                      />
                    );
                  })}
                </Dropdown.Content>
              </Dropdown>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-600">
              검색 조건
            </label>
            <div className="w-[180px]">
              <Dropdown>
                <Dropdown.Trigger>
                  {
                    targetOptions.find((option) => option.value === target)
                      ?.label
                  }
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
          </div>
        </div>

        {/* 검색 영역 */}
        <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
          <div className="flex-1">
            <input
              type="text"
              placeholder="검색어를 입력하세요"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyPress={handleKeyPress}
              className="w-full px-4 py-2.5 border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-transparent text-sm"
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

export default AfterServiceSearchBox;
