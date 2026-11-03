'use client';

import Button from '@/app/_components/Button';
import { ItemType } from '@/app/_domains/_item/_types/item.types';

interface ItemDetailModalProps {
  item: ItemType;
  onClose: () => void;
}

const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex flex-col gap-1">
    <label className="text-sm font-medium text-gray-700">{label}</label>
    <div className="px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg text-gray-700 min-h-[38px] flex items-center">
      {value || <span className="text-gray-400">-</span>}
    </div>
  </div>
);

const ItemDetailModal = ({ item, onClose }: ItemDetailModalProps) => {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold text-gray-900">품목 상세</h2>

      <div className="flex flex-col gap-3 overflow-y-auto max-h-[65vh] pr-1">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">사용</label>
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              item.is_use
                ? 'bg-brand-100 text-brand-700'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            {item.is_use ? '사용' : '미사용'}
          </span>
        </div>

        <Field
          label="품목 종류"
          value={item.item_categories?.name}
        />

        <Field label="품목 코드" value={item.item_code} />
        <Field label="품목 명" value={item.item_name} />

        <div className="flex gap-3">
          <div className="flex-1">
            <Field
              label="매출단가"
              value={
                item.selling_price != null
                  ? item.selling_price.toLocaleString() + '원'
                  : null
              }
            />
          </div>
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <Field label="액상 종류" value={item.liquid_type} />
          </div>
          <div className="flex-1">
            <Field label="액상 맛" value={item.liquid_flavor} />
          </div>
        </div>

        <Field label="비고" value={item.note} />
      </div>

      <div className="flex justify-end pt-2 border-t border-gray-100">
        <Button type="button" variant="gray" size="sm" onClick={onClose}>
          닫기
        </Button>
      </div>
    </div>
  );
};

export default ItemDetailModal;
