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
  return { text: action, color: 'text-gray-700 bg-gray-100' };
};
