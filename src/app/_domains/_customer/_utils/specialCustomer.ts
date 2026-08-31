export type CustomerMode = "normal" | "demo" | "adjustment" | "x";

export const isXCustomer = (name: string, phone?: string | null) => {
  const normalizedName = name.trim();
  const normalizedPhone = phone?.trim();
  return (
    (normalizedName === "X" || normalizedName === "X 고객") &&
    normalizedPhone === "X"
  );
};

export const isUnifiedXCustomer = (
  name: string,
  phone?: string | null,
  gender?: string | null,
) => name.trim() === "X" && phone?.trim() === "X" && gender === "special";

export const getCustomerMode = (
  name: string,
  phone?: string | null,
  isStampEligible = true,
): CustomerMode => {
  void isStampEligible;
  const normalizedName = name.trim();
  const normalizedPhone = phone?.trim();

  if (normalizedName === "시연용") return "demo";
  if (normalizedName === "재고조정") return "adjustment";
  if (isXCustomer(normalizedName, normalizedPhone)) return "x";
  return "normal";
};

export const isSpecialCustomer = (
  name: string,
  phone?: string | null,
  isStampEligible = true,
) => getCustomerMode(name, phone, isStampEligible) !== "normal";
