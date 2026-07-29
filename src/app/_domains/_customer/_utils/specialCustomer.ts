export type CustomerMode = "normal" | "demo" | "adjustment" | "x";

export const getCustomerMode = (
  name: string,
  phone?: string | null,
): CustomerMode => {
  const normalizedName = name.trim();
  const normalizedPhone = phone?.trim();

  if (normalizedName === "시연용") return "demo";
  if (normalizedName === "재고조정") return "adjustment";
  if (normalizedName === "X" && normalizedPhone === "X") return "x";
  return "normal";
};

export const isSpecialCustomer = (
  name: string,
  phone?: string | null,
) => getCustomerMode(name, phone) !== "normal";
