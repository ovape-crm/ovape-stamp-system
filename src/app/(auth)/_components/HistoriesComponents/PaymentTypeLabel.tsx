import { PaymentTypeEnum, PaymentTypeEnumType } from '@/app/_enums/enums';

const paymentTypeNameByValue = Object.values(PaymentTypeEnum).reduce(
  (acc, type) => {
    acc[type.value as PaymentTypeEnumType['value']] = type.name;
    return acc;
  },
  {} as Record<PaymentTypeEnumType['value'], string>
);

const PaymentTypeLabel = ({ jsonb }: { jsonb: Record<string, unknown> }) => {
  const paymentTypeValue = jsonb?.paymentType as
    | PaymentTypeEnumType['value']
    | undefined;

  const paymentTypeName = paymentTypeValue
    ? paymentTypeNameByValue[paymentTypeValue]
    : undefined;

  return (
    <span className="ml-2 inline-flex items-center rounded-full bg-gray-100 text-gray-500 text-xs font-medium px-2 py-1">
      {paymentTypeName}
    </span>
  );
};

export default PaymentTypeLabel;
