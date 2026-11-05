export type DeliveryStampAccrualStatus =
  | "valid_zero"
  | "requires_confirmation"
  | "invalid";

export const getDeliveryStampAccrualStatus = ({
  deliveryMethod,
  amount,
  maximum,
}: {
  deliveryMethod?: "store_visit" | "parcel" | "delivery";
  amount: number;
  maximum: number;
}): DeliveryStampAccrualStatus | null => {
  if (deliveryMethod !== "parcel" && deliveryMethod !== "delivery") {
    return null;
  }
  if (amount === 0) return "valid_zero";
  if (amount === maximum && amount > 0) return "requires_confirmation";
  return "invalid";
};
