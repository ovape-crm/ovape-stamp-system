'use client';

import { useEffect, useRef, useState } from 'react';
import { useModal } from '@/app/_contexts/ModalContext';
import { getComparisonColumns } from '@/app/_services/comparisonColumnService';
import {
  ComparisonColumnType,
  ComparisonDeviceType,
} from '@/app/_types/comparison.types';
import { EmptySlot, FilledSlot } from './ComparisonSlot';
import DeviceSelectModal from '../DeviceSelectModal';
import ComparisonExpandView from './ComparisonExpandView';
import Button from '@/app/_components/Button';

type ValueMap = Record<string, string>;

type Slot =
  | { type: 'empty' }
  | { type: 'filled'; device: ComparisonDeviceType; valueMap: ValueMap };

const MAX_SLOTS = 4;
const INITIAL_SLOTS = 2;

export default function DeviceComparison() {
  const { open, close } = useModal();
  const [columns, setColumns] = useState<ComparisonColumnType[]>([]);
  const [slots, setSlots] = useState<Slot[]>(
    Array.from({ length: INITIAL_SLOTS }, () => ({ type: 'empty' })),
  );

  // 모달에서 선택된 슬롯 인덱스를 클로저 없이 참조하기 위해 ref 사용
  const targetSlotRef = useRef<number | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    getComparisonColumns()
      .then(setColumns)
      .catch(() => {});
  }, []);

  const filledSlots = slots.filter(
    (s): s is Extract<Slot, { type: 'filled' }> => s.type === 'filled',
  );
  const filledDeviceIds = filledSlots.map((s) => s.device.id);

  const handleAddSlot = (index: number) => {
    targetSlotRef.current = index;
    open({
      content: (
        <DeviceSelectModal
          excludeDeviceIds={filledDeviceIds}
          onSelect={(device, valueMap) => {
            const idx = targetSlotRef.current;
            if (idx === null) return;
            setSlots((prev) =>
              prev.map((slot, i) =>
                i === idx ? { type: 'filled', device, valueMap } : slot,
              ),
            );
            close();
          }}
          onCancel={close}
        />
      ),
      options: { dismissOnBackdrop: true, dismissOnEsc: true },
    });
  };

  const handleRemoveSlot = (index: number) => {
    setSlots((prev) =>
      prev.map((slot, i) => (i === index ? { type: 'empty' } : slot)),
    );
  };

  const handleAppendSlot = () => {
    if (slots.length >= MAX_SLOTS) return;
    setSlots((prev) => [...prev, { type: 'empty' }]);
  };

  const handleRemoveLastSlot = () => {
    if (slots.length <= INITIAL_SLOTS) return;
    setSlots((prev) => prev.slice(0, -1));
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* 슬롯 영역 */}
      <div className="flex flex-col sm:flex-row gap-4 flex-1 min-h-0">
        {slots.map((slot, index) =>
          slot.type === 'empty' ? (
            <EmptySlot key={index} onAdd={() => handleAddSlot(index)} />
          ) : (
            <FilledSlot
              key={slot.device.id}
              device={slot.device}
              columns={columns}
              valueMap={slot.valueMap}
              onRemove={() => handleRemoveSlot(index)}
            />
          ),
        )}
      </div>

      {/* 슬롯 추가/제거 + 확대 */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          {slots.length < MAX_SLOTS && (
            <Button size="sm" variant="secondary" onClick={handleAppendSlot}>
              슬롯 추가
            </Button>
          )}
          {slots.length > INITIAL_SLOTS && (
            <Button size="sm" variant="gray" onClick={handleRemoveLastSlot}>
              슬롯 제거
            </Button>
          )}
        </div>
        {filledSlots.length > 0 && (
          <button
            onClick={() => setIsExpanded(true)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors cursor-pointer"
            aria-label="확대 보기"
            title="확대 보기"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>
        )}
      </div>

      {isExpanded && (
        <ComparisonExpandView
          columns={columns}
          filledSlots={filledSlots}
          onClose={() => setIsExpanded(false)}
        />
      )}
    </div>
  );
}
