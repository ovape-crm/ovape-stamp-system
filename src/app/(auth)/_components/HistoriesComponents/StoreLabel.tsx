import { StoreTypeEnum, StoreTypeEnumType } from '@/app/_enums/enums';

const storeNameByValue = Object.values(StoreTypeEnum).reduce(
  (acc, type) => {
    acc[type.value as StoreTypeEnumType['value']] = type.name;
    return acc;
  },
  {} as Record<StoreTypeEnumType['value'], string>
);

const storeStyleByValue: Record<StoreTypeEnumType['value'], string> = {
  [StoreTypeEnum.OVAPE.value]: 'bg-brand-100 text-brand-700',
  [StoreTypeEnum.EGU_VAPE.value]: 'bg-amber-100 text-amber-700',
};

const StoreLabel = ({ jsonb }: { jsonb: Record<string, unknown> }) => {
  const storeValue = jsonb?.storeName as StoreTypeEnumType['value'] | undefined;

  if (!storeValue) return null;

  const storeName = storeNameByValue[storeValue];
  const style = storeStyleByValue[storeValue] ?? 'bg-gray-100 text-gray-500';

  return (
    <span
      className={`flex h-7 w-full items-center justify-center whitespace-nowrap rounded-full px-2 text-xs font-medium ${style}`}
    >
      {storeName}
    </span>
  );
};

export default StoreLabel;
