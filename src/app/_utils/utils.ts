import {
  AfterServiceStatusEnum,
  AfterServiceStatusGroupEnum,
  AfterServiceStatusGroupEnumType,
} from '@/app/_enums/enums';

// AS 상태 그룹 정의 (enum 기반)
export const getAfterServiceStatusGroups = () => {
  const received: string[] = [];
  const inProgress: string[] = [];
  const completed: string[] = [];

  Object.values(AfterServiceStatusEnum).forEach((status) => {
    if (status.group === AfterServiceStatusGroupEnum.RECEIVED.value) {
      received.push(status.value);
    } else if (status.group === AfterServiceStatusGroupEnum.IN_PROGRESS.value) {
      inProgress.push(status.value);
    } else if (status.group === AfterServiceStatusGroupEnum.COMPLETED.value) {
      completed.push(status.value);
    }
  });

  return { received, inProgress, completed };
};

// 상태가 속한 그룹 반환 (enum 기반)
export const getAfterServiceStatusGroup = (
  status: string
): AfterServiceStatusGroupEnumType['value'] => {
  const statusOption = Object.values(AfterServiceStatusEnum).find(
    (opt) => opt.value === status
  );
  return statusOption?.group || AfterServiceStatusGroupEnum.RECEIVED.value; // 기본값
};

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

  if (action === 'update-after-service-info') {
    return { text: `AS 정보 수정`, color: 'text-gray-700 bg-gray-100' };
  }

  // AS 상태 액션 처리
  if (action.startsWith('after-service-')) {
    const statusValue = action.replace('after-service-', '');

    // enum에서 상태 정보 가져오기
    const statusOption = Object.values(AfterServiceStatusEnum).find(
      (opt) => opt.value === statusValue
    );
    const statusName = statusOption?.name || statusValue;

    // 상태 그룹별 색상 분류 (enum 기반)
    const statusGroup =
      statusOption?.group || AfterServiceStatusGroupEnum.RECEIVED.value;
    let color = 'text-gray-700 bg-gray-100'; // 기본값
    if (statusGroup === AfterServiceStatusGroupEnum.RECEIVED.value) {
      color = 'text-gray-700 bg-gray-100'; // 접수: 회색
    } else if (statusGroup === AfterServiceStatusGroupEnum.IN_PROGRESS.value) {
      color = 'text-blue-700 bg-blue-100'; // 진행: 파란색
    } else if (statusGroup === AfterServiceStatusGroupEnum.COMPLETED.value) {
      color = 'text-green-700 bg-green-100'; // 완료: 녹색
    }

    return {
      text: statusName,
      color,
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

/**
 * 로그 배열을 날짜별로 그룹핑하고 최신순으로 정렬된 날짜 키를 반환
 */
export const groupLogsByDate = <T extends { created_at: string }>(
  items: T[]
): { itemsByDate: Record<string, T[]>; sortedDates: string[] } => {
  const itemsByDate = items.reduce<Record<string, T[]>>((acc, log) => {
    const dateKey = new Date(log.created_at).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(log);
    return acc;
  }, {});

  const sortedDates = Object.keys(itemsByDate).sort(
    (a, b) => new Date(b).getTime() - new Date(a).getTime()
  );

  return { itemsByDate, sortedDates };
};

/**
 * 날짜 키(예: "25. 12. 02.")를 보기 좋은 형식(예: "25년 12월 02일")으로 변환
 */
export const formatDateKey = (dateKey: string): string => {
  const [yyyy, mm, dd] = dateKey.split('.').map((s) => s.trim());
  return `${yyyy}년 ${mm}월 ${dd}일`;
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

