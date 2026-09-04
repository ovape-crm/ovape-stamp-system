import { formatPhoneNumber } from "@/app/_utils/utils";

const CustomerInfo = ({
  name,
  phone,
  onClick,
  singleLineLabel,
  disabled = false,
}: {
  name: string | null | undefined;
  phone: string | null | undefined;
  onClick: () => void;
  singleLineLabel?: string;
  disabled?: boolean;
}) => {
  return (
    <div
      className={`rounded-lg border border-transparent p-3 transition-all duration-200 ${
        disabled
          ? "cursor-not-allowed text-gray-500"
          : "cursor-pointer hover:border-brand-200 hover:bg-brand-100 hover:shadow-md"
      }`}
      onClick={disabled ? undefined : onClick}
      aria-disabled={disabled}
    >
      <p className="text-base font-semibold text-gray-900">
        {singleLineLabel || name || "이름 없음"}
      </p>
      {!singleLineLabel && (
        <p className="text-sm text-gray-600">{formatPhoneNumber(phone)}</p>
      )}
    </div>
  );
};

export default CustomerInfo;
