export const getActionText = (action: string) => {
  if (action.startsWith('add-')) {
    const amount = action.replace('add-', '');
    return {
      text: `${amount}개 적립`,
      color: 'text-emerald-700 bg-emerald-100',
    };
  }
  if (action.startsWith('remove-')) {
    const amount = action.replace('remove-', '');
    return { text: `${amount}개 차감`, color: 'text-rose-700 bg-rose-100' };
  }
  if (action === 'coupon-10') {
    return { text: `쿠폰 사용`, color: 'text-blue-700 bg-blue-100' };
  }

  if (action === 'update-customer-info') {
    return { text: `고객 정보 수정`, color: 'text-gray-700 bg-gray-100' };
  }

  if (action === 'create-customer') {
    return { text: `고객 추가`, color: 'text-green-700 bg-green-100' };
  }

  // AS 상태 액션 처리
  if (action.startsWith('after-service-')) {
    const statusValue = action.replace('after-service-', '');
    const statusMap: Record<string, string> = {
      received: '접수',
      exchange: '교환',
      rental: '대여',
      sent_for_repair: '수리 접수',
      repair_returned: '수리 수령',
      repair_rejected: 'AS 불가',
      customer_received: '고객 수령',
      returned: '반품 처리',
      other: '기타',
    };
    const statusName = statusMap[statusValue] || statusValue;
    return {
      text: statusName,
      color: 'text-blue-700 bg-blue-100',
    };
  }

  return { text: action, color: 'text-gray-700 bg-gray-100' };
};

export const formatPhoneNumber = (phone: string | null | undefined): string => {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11) {
    // 010-1234-5678 format
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  } else if (digits.length === 10) {
    // 010-123-4567 or 02-1234-5678 format
    if (digits.startsWith('02')) {
      return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
    } else {
      return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
  }
  return phone;
};

type CustomerValue = {
  name: string;
  phone: string;
  gender: 'male' | 'female';
  note?: string | null;
};

export const getUpdateLogNote = (
  prevValue: CustomerValue,
  newValue: CustomerValue
) => {
  const changeArray = [];
  const changeObj: Record<string, { old: string | null; new: string | null }> =
    {};

  const fieldNameMap = ['name', 'phone', 'gender', 'note'];

  const prevValueArray = Object.values(prevValue);
  const newValueArray = Object.values(newValue);

  for (let i = 0; i < prevValueArray.length; i++) {
    if (prevValueArray[i] !== newValueArray[i]) {
      changeArray.push(i);
    }
  }

  changeArray.forEach((index) => {
    changeObj[fieldNameMap[index]] = {
      old: prevValueArray[index],
      new: newValueArray[index],
    };
  });

  return changeObj;
};
