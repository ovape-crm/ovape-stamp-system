import { PaymentTypeEnum, PaymentTypeEnumType } from '@/app/_enums/enums';

const paymentTypeNameByValue = Object.values(PaymentTypeEnum).reduce(
  (acc, type) => {
    acc[type.value as PaymentTypeEnumType['value']] = type.name;
    return acc;
  },
  {} as Record<PaymentTypeEnumType['value'], string>
);

const PaymentTypeLabel = ({ jsonb }: { jsonb: Record<string, unknown> }) => {
  const splitPayments = Array.isArray(jsonb.payments)
    ? jsonb.payments.filter(
        (
          payment,
        ): payment is {
          paymentType: PaymentTypeEnumType['value'];
          amount: number;
        } =>
          typeof payment === 'object' &&
          payment !== null &&
          typeof payment.paymentType === 'string' &&
          typeof payment.amount === 'number',
      )
    : [];

  if (splitPayments.length >= 2) {
    return (
      <div className="flex flex-col items-start gap-1">
        {splitPayments.map((payment, index) => (
          <span
            key={`${payment.paymentType}-${index}`}
            className="inline-flex items-center rounded-full bg-gray-100 px-1.5 py-1 text-xs font-medium text-gray-500"
          >
            {paymentTypeNameByValue[payment.paymentType]?.replace(
              '이구베이프',
              '',
            )}{' '}
            {payment.amount.toLocaleString('ko-KR')}원
          </span>
        ))}
      </div>
    );
  }

  const paymentTypeValue = jsonb?.paymentType as
    | PaymentTypeEnumType['value']
    | undefined;

  const paymentTypeName = paymentTypeValue
    ? paymentTypeNameByValue[paymentTypeValue]?.replace('이구베이프', '')
    : undefined;

  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-500 text-xs font-medium px-1.5 py-1">
      {paymentTypeName}
    </span>
  );
};

export default PaymentTypeLabel;
