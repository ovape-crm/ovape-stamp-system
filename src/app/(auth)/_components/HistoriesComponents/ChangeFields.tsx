const fieldMap = {
  name: '이름',
  phone: '전화번호',
  gender: '성별',
  is_stamp_eligible: '적립 대상',
  address: '주소지',
  note: '특이사항',
  customer_id: '고객 ID',
  item_type: '기기 종류',
  item_name: '품명',
  quantity: '수량',
  symptom: '증상',
  shop_note: '매장 특이사항',
  customer_note: '고객 특이사항',
  is_loaner_device_issued: '재고처리 여부',
  customer_purchase_date: '고객 구매일',
  customer_received_date: '고객 접수일',
  supplier_name: '도매처',
  has_after_service_cost: 'A/S 비용 여부',
  after_service_payment_method: '결제방식',
  after_service_cost_amount: 'A/S 비용',
  after_service_cost_memo: '가격조정 메모',
  is_rental_issued: '대여 여부',
  rental_date: '대여일',
  rental_note: '대여 메모',
  is_exchange_issued: '교환 여부',
  exchange_date: '교환일',
  exchange_item_id: '교환 품목 ID',
  exchange_item_name: '교환 품목',
  exchange_item_category_name: '교환 품목 종류',
  exchange_quantity: '교환 수량',
  exchange_note: '교환 메모',
} as const;

const itemTypeMap: Record<string, string> = {
  device: '기기',
  disposable_device: '일회용 기기',
  liquid: '액상',
  consumable: '소모품',
};

const booleanFieldNames = new Set([
  'is_stamp_eligible',
  'is_loaner_device_issued',
  'has_after_service_cost',
  'is_rental_issued',
  'is_exchange_issued',
]);

const paymentMethodMap: Record<string, string> = {
  card: '카드',
  transfer: '이체',
  cash: '현금',
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

    if (fieldName === 'is_stamp_eligible') {
      return value === true || value === 1 || value === '1' ? '적립' : '미적립';
    }

    if (fieldName && booleanFieldNames.has(fieldName)) {
      return value === true || value === 1 || value === '1' ? 'O' : 'X';
    }

    if (fieldName === 'item_type') {
      return itemTypeMap[String(value)] || String(value);
    }

    if (fieldName === 'after_service_payment_method') {
      return paymentMethodMap[String(value)] || String(value);
    }

    if (fieldName === 'after_service_cost_amount') {
      const amount = Number(value);
      return Number.isFinite(amount)
        ? `${amount.toLocaleString('ko-KR')}원`
        : String(value);
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
