import { InventoryItemType } from '@/app/_domains/_inventory/_types/inventory.types';
import { useUser } from '@/app/_contexts/UserContext';

interface ItemInfoProps {
  item: InventoryItemType;
}

const formatPrice = (value: number | null) =>
  value != null ? `${value.toLocaleString()}원` : '—';

const ItemInfo = ({ item }: ItemInfoProps) => {
  const { isAdmin } = useUser();

  return (
    <section className="flex-1 h-full bg-white rounded-lg shadow-sm border border-brand-100 p-6">
      <div className="flex items-center justify-between mb-6 pb-3 border-b border-brand-100">
        <h2 className="text-xl font-semibold text-brand-700">품목 정보</h2>
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

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-500 mb-1">
            품목 종류
          </label>
          <p className="text-base font-semibold text-gray-900">
            {item.item_categories?.name ?? '—'}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-500 mb-1">
            품목 코드
          </label>
          <p className="text-base font-mono text-gray-900">{item.item_code}</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-500 mb-1">
            품목 명
          </label>
          <p className="text-lg font-semibold text-gray-900">
            {item.item_name}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {isAdmin && (
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">
                매입단가
              </label>
              <p className="text-base font-semibold text-gray-900">
                {formatPrice(item.purchase_price)}
              </p>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">
              매출단가
            </label>
            <p className="text-base font-semibold text-gray-900">
              {formatPrice(item.selling_price)}
            </p>
          </div>
        </div>

        {(item.liquid_type || item.liquid_flavor) && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">
                액상 종류
              </label>
              <p className="text-base text-gray-900">
                {item.liquid_type || '—'}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">
                액상 맛
              </label>
              <p className="text-base text-gray-900">
                {item.liquid_flavor || '—'}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 pt-4 border-t border-brand-100">
        <label className="block text-sm font-medium text-gray-500 mb-1">
          비고
        </label>
        <p className="text-sm text-gray-800 whitespace-pre-wrap">
          {item.note && item.note.trim().length > 0 ? item.note : '—'}
        </p>
      </div>
    </section>
  );
};

export default ItemInfo;
