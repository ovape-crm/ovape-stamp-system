const fieldMap = {
  name: '이름',
  phone: '전화번호',
  gender: '성별',
  note: '특이사항',
  customer_id: '고객 ID',
  item_type: '기기 종류',
  item_name: '품명',
  quantity: '수량',
  symptom: '증상',
  shop_note: '매장 특이사항',
  customer_note: '고객 특이사항',
} as const;

const itemTypeMap: Record<string, string> = {
  device: '기기',
  disposable_device: '일회용 기기',
  liquid: '액상',
  consumable: '소모품',
};

const ChangeFields = ({ jsonb }: { jsonb: Record<string, unknown> }) => {
  const validEntries = Object.entries(jsonb).filter(
    ([, value]) =>
      value &&
      typeof value === 'object' &&
      ('old' in (value as Record<string, unknown>) ||
        'new' in (value as Record<string, unknown>)),
  );

  if (validEntries.length === 0) return null;

  const formatValue = (value: unknown, fieldName?: string) => {
    if (value === null || value === undefined || value === '') return '-';

    if (fieldName === 'gender') {
      if (value === 'male') return '남자';
      if (value === 'female') return '여자';
    }

    if (fieldName === 'item_type') {
      return itemTypeMap[String(value)] || String(value);
    }

    return String(value);
  };

  return (
    <div className="mt-2 space-y-1">
      {validEntries.map(([fieldName, value]) => {
        const change = value as { old?: unknown; new?: unknown };
        return (
          <div
            key={fieldName}
            className="flex flex-wrap items-center gap-2 text-xs text-gray-500"
          >
            <span className="font-semibold text-gray-600">
              {fieldMap[fieldName as keyof typeof fieldMap] ?? fieldName}
            </span>
            {'old' in change && (
              <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-500">
                {formatValue(change.old, fieldName)}
              </span>
            )}
            {'old' in change && 'new' in change && (
              <span className="text-gray-400">→</span>
            )}
            {'new' in change && (
              <span className="px-2 py-0.5 rounded bg-brand-50 text-brand-700">
                {formatValue(change.new, fieldName)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ChangeFields;
