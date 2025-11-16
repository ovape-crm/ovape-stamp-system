import { PaymentTypeEnum, PaymentTypeEnumType } from '../_enums/enums';
import { LogBaseType } from '../_types/log.types';
import { formatPhoneNumber } from '../_utils/utils';
import toast from 'react-hot-toast';

const paymentTypeNameByValue = Object.values(PaymentTypeEnum).reduce(
  (acc, type) => {
    acc[type.value as PaymentTypeEnumType['value']] = type.name;
    return acc;
  },
  {} as Record<PaymentTypeEnumType['value'], string>
);

const useCopy = () => {
  const copyLogToClipboard = async (
    log: LogBaseType,
    targetUser: { name: string; phone: string }
  ) => {
    const paymentTypeValue = log.jsonb?.paymentType as
      | PaymentTypeEnumType['value']
      | undefined;

    const paymentTypeName = paymentTypeValue
      ? paymentTypeNameByValue[paymentTypeValue]
      : undefined;

    const name = targetUser.name || '이름 없음';
    const phone = formatPhoneNumber(targetUser.phone);

    const createdAt = new Date(log.created_at);
    const formattedDate = `${createdAt.getFullYear()}. ${String(
      createdAt.getMonth() + 1
    ).padStart(2, '0')}. ${createdAt.getDate()}`;

    const textToCopy = `오베이프\t${formattedDate}\t${log.note}\t\t\t${
      paymentTypeName ?? ''
    }\t${name}\t${phone}`;

    try {
      await navigator.clipboard.writeText(textToCopy);
      toast.success('클립보드에 복사되었습니다!');
    } catch (err) {
      toast.error('복사에 실패했습니다.');
      console.error('Failed to copy:', err);
    }
  };

  return { copyLogToClipboard };
};

export default useCopy;
