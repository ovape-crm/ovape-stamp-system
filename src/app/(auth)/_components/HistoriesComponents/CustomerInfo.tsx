import { formatPhoneNumber } from '@/app/_utils/utils';

const CustomerInfo = ({
  name,
  phone,
  onClick,
}: {
  name: string | null | undefined;
  phone: string | null | undefined;
  onClick: () => void;
}) => {
  return (
    <div
      className="cursor-pointer hover:bg-brand-100 hover:shadow-md p-3 rounded-lg transition-all duration-200 border border-transparent hover:border-brand-200"
      onClick={onClick}
    >
      <p className="text-base font-semibold text-gray-900">
        {name || '이름 없음'}
      </p>
      <p className="text-sm text-gray-600">{formatPhoneNumber(phone)}</p>
    </div>
  );
};

export default CustomerInfo;
