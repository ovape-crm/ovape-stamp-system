import {
  PaymentTypeEnum,
  PaymentTypeEnumType,
  StoreTypeEnum,
  StoreTypeEnumType,
} from "@/app/_enums/enums";
import { LogBaseType } from "../_types/log.types";
import { formatPhoneNumber } from "@/app/_utils/utils";
import toast from "react-hot-toast";
import { formatHistoryNote } from "../_utils/formatHistoryNote";

const paymentTypeNameByValue = Object.values(PaymentTypeEnum).reduce(
  (acc, type) => {
    acc[type.value as PaymentTypeEnumType["value"]] = type.name;
    return acc;
  },
  {} as Record<PaymentTypeEnumType["value"], string>,
);

const storeNameByValue = Object.values(StoreTypeEnum).reduce(
  (acc, type) => {
    acc[type.value as StoreTypeEnumType["value"]] = type.name;
    return acc;
  },
  {} as Record<StoreTypeEnumType["value"], string>,
);

const buildAmountFormula = (
  jsonb: Record<string, unknown> | null | undefined,
): string => {
  if (!jsonb) return "";

  const items = Array.isArray(jsonb.items)
    ? (jsonb.items as Array<{
        unitPrice?: unknown;
        adjustedUnitPrice?: unknown;
        quantity?: unknown;
        amount?: unknown;
      }>)
    : [];
  const discount = jsonb.discount as { amount?: unknown } | undefined;
  const discountAmount =
    typeof discount?.amount === "number" ? discount.amount : 0;
  const totalAmount =
    typeof jsonb.totalAmount === "number" ? jsonb.totalAmount : undefined;

  const parts: string[] = [];

  if (discountAmount > 0) {
    parts.push(`-${discountAmount}`);
  }

  for (const item of items) {
    const amount = typeof item.amount === "number" ? item.amount : 0;
    const effectiveUnitPrice =
      typeof item.adjustedUnitPrice === "number"
        ? item.adjustedUnitPrice
        : typeof item.unitPrice === "number"
          ? item.unitPrice
          : 0;
    if (amount === 0 || effectiveUnitPrice === 0) continue;
    const quantity =
      typeof item.quantity === "number" && item.quantity > 0
        ? item.quantity
        : 1;
    const sign = effectiveUnitPrice < 0 ? "-" : "+";
    const absoluteUnitPrice = Math.abs(effectiveUnitPrice);
    parts.push(
      `${sign}${absoluteUnitPrice}${quantity > 1 ? `*${quantity}` : ""}`,
    );
  }

  if (parts.length === 0) {
    return typeof totalAmount === "number" ? String(totalAmount) : "";
  }

  const formula = parts.join("").replace(/^\+/, "");
  return `=${formula}`;
};

const useCopy = () => {
  const buildLogClipboardText = (
    log: LogBaseType,
    targetUser: {
      name: string;
      phone: string;
      gender?: "male" | "female" | null;
    },
    paymentTypeLabelOverride?: string,
  ) => {
    const paymentTypeValue = log.jsonb?.paymentType as
      PaymentTypeEnumType["value"] | undefined;

    const basePaymentTypeName =
      paymentTypeLabelOverride ??
      (paymentTypeValue ? paymentTypeNameByValue[paymentTypeValue] : undefined);
    const splitPayments = Array.isArray(log.jsonb?.payments)
      ? log.jsonb.payments.filter(
          (
            payment,
          ): payment is {
            paymentType: PaymentTypeEnumType["value"];
            amount: number;
          } =>
            typeof payment === "object" &&
            payment !== null &&
            typeof payment.paymentType === "string" &&
            typeof payment.amount === "number",
        )
      : [];
    const hasTransactionTag = Boolean(
      log.jsonb?.couponUse ||
      log.jsonb?.discount ||
      (typeof log.jsonb?.deliveryFee === "number" &&
        log.jsonb.deliveryFee > 0) ||
      log.jsonb?.deliveryType === "self" ||
      log.jsonb?.deliveryType === "customer_quick" ||
      (typeof log.jsonb?.reservationDate === "string" &&
        log.jsonb.reservationDate.trim()),
    );

    const isEguPayment =
      typeof paymentTypeValue === "string" &&
      paymentTypeValue.startsWith("egu_");
    const paymentTypeName =
      basePaymentTypeName && !paymentTypeLabelOverride && isEguPayment
        ? `${StoreTypeEnum.EGU_VAPE.name}${basePaymentTypeName}`
        : basePaymentTypeName;

    const storeValue = log.jsonb?.storeName as
      StoreTypeEnumType["value"] | undefined;
    const storeName = storeValue
      ? storeNameByValue[storeValue]
      : StoreTypeEnum.OVAPE.name;

    const amountFormula = buildAmountFormula(log.jsonb);

    const isXCustomer =
      targetUser.name.trim() === "X" && targetUser.phone.trim() === "X";
    const savedXCustomerName =
      typeof log.jsonb?.xCustomerName === "string"
        ? log.jsonb.xCustomerName.trim()
        : "";
    const savedXPhoneLastDigits =
      typeof log.jsonb?.xPhoneLastDigits === "string"
        ? log.jsonb.xPhoneLastDigits.trim()
        : "";
    const name =
      (isXCustomer && savedXCustomerName) || targetUser.name || "이름 없음";
    const phone =
      isXCustomer && savedXPhoneLastDigits
        ? savedXPhoneLastDigits
        : formatPhoneNumber(targetUser.phone);
    const specialCustomerName =
      targetUser.name.trim() === "시연용"
        ? "시연용"
        : targetUser.name.trim() === "재고조정"
          ? "재고조정"
          : "";
    const genderText =
      specialCustomerName ||
      (targetUser.gender === "male"
        ? "남자"
        : targetUser.gender === "female"
          ? "여자"
          : "");
    const baseGender = specialCustomerName
      ? specialCustomerName
      : genderText
        ? `(숫자),${genderText}`
        : "";
    const extraNoteValue = log.jsonb?.extraNote;
    const extraNote =
      typeof extraNoteValue === "string" ? extraNoteValue.trim() : "";
    const gender = specialCustomerName
      ? specialCustomerName
      : extraNote
        ? `${baseGender}${baseGender ? "," : ""}${extraNote}`
        : baseGender;

    const createdAt = new Date(log.created_at);
    const formattedDate = `${createdAt.getFullYear()}. ${String(
      createdAt.getMonth() + 1,
    ).padStart(2, "0")}. ${createdAt.getDate()}`;
    const deliveryAddress =
      typeof log.jsonb?.deliveryAddress === "string"
        ? log.jsonb.deliveryAddress.trim()
        : "";
    const address = deliveryAddress.replace(/\s+/g, " ");

    const buildClipboardRow = (
      note: string,
      copiedAmount: string,
      copiedPaymentType: string,
    ) =>
      `${storeName}\t${formattedDate}\t${note}\t\t${copiedAmount}\t${copiedPaymentType}\t${name}\t${phone}\t${gender}\t${address}`;

    const textToCopy =
      splitPayments.length >= 2
        ? splitPayments
            .map((payment) =>
              buildClipboardRow(
                `${hasTransactionTag ? "분할결제," : "분할결제) "}${formatHistoryNote(log.note, log.jsonb)}`,
                String(payment.amount),
                paymentTypeNameByValue[payment.paymentType] ?? "",
              ),
            )
            .join("\n")
        : buildClipboardRow(
            formatHistoryNote(log.note, log.jsonb),
            amountFormula,
            paymentTypeName ?? "",
          );

    return textToCopy;
  };

  const writeClipboardText = async (text: string) => {
    if (document.hasFocus() && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {
        // 브라우저가 포커스/권한 문제로 거부하면 레거시 복사 방식으로 재시도합니다.
      }
    }

    window.focus();
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("Clipboard copy was rejected");
  };

  const copyLogToClipboard = async (
    log: LogBaseType,
    targetUser: {
      name: string;
      phone: string;
      gender?: "male" | "female" | null;
    },
    paymentTypeLabelOverride?: string,
  ) => {
    try {
      await writeClipboardText(
        buildLogClipboardText(log, targetUser, paymentTypeLabelOverride),
      );
      toast.success("클립보드에 복사되었습니다!");
    } catch (err) {
      toast.error("복사에 실패했습니다.");
      console.warn("Failed to copy:", err);
    }
  };

  const copyLogsToClipboard = async (
    logs: Array<
      LogBaseType & {
        customers?: {
          name?: string | null;
          phone?: string | null;
          gender?: "male" | "female" | null;
        } | null;
      }
    >,
  ) => {
    const textToCopy = logs
      .map((log) =>
        buildLogClipboardText(log, {
          name: log.customers?.name ?? "",
          phone: log.customers?.phone ?? "",
          gender: log.customers?.gender,
        }),
      )
      .join("\n");

    try {
      await writeClipboardText(textToCopy);
      toast.success(`${logs.length}건을 클립보드에 복사했습니다.`);
    } catch (err) {
      toast.error("복사에 실패했습니다.");
      console.warn("Failed to copy logs:", err);
    }
  };

  return { copyLogToClipboard, copyLogsToClipboard };
};

export default useCopy;
