'use client';

import Button from '@/app/_components/Button';
import TaggedContent from '@/app/_components/TaggedContent';
import { ManualType } from '@/app/_domains/_manual/_types/manual.types';

interface ManualDetailModalProps {
  manual: ManualType;
  onClose: () => void;
}

const ManualDetailModal = ({ manual, onClose }: ManualDetailModalProps) => {
  const topName = manual.manual_sub_categories?.manual_top_categories?.name;
  const subName = manual.manual_sub_categories?.name;

  return (
    <div className="w-full flex flex-col min-h-0">
      {(topName || subName) && (
        <div className="mb-2 shrink-0">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-brand-50 text-brand-700 text-xs font-medium">
            {topName}
            {topName && subName && (
              <span className="text-brand-300 font-normal">›</span>
            )}
            {subName && <span className="font-normal">{subName}</span>}
          </span>
        </div>
      )}
      <h2 className="flex items-baseline gap-1.5 mb-4 shrink-0">
        <span className="text-xs font-normal text-gray-400">제목:</span>
        <span className="text-lg font-semibold text-gray-900">
          {manual.title}
        </span>
      </h2>

      <div className="overflow-y-auto min-h-0 flex-1 px-3 py-2.5 border border-gray-100 rounded-lg bg-gray-50">
        <TaggedContent
          content={manual.content}
          className="text-sm text-gray-800 leading-relaxed"
        />
      </div>

      <div className="flex justify-end pt-4 border-t border-gray-200 mt-6 shrink-0">
        <Button size="sm" variant="gray" onClick={onClose}>
          닫기
        </Button>
      </div>
    </div>
  );
};

export default ManualDetailModal;
