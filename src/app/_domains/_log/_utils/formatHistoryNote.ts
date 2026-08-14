type HistoryNoteJsonb = Record<string, unknown> | null | undefined;

const normalizeLegacyServiceNote = (note: string) =>
  note.replace(/\(서비스\((.*?)\)\)/g, "(서비스,$1)");

export const formatHistoryNote = (note: string, jsonb?: HistoryNoteJsonb) => {
  const normalized = normalizeLegacyServiceNote(note);
  const itemNote = Array.isArray(jsonb?.items)
    ? jsonb.items
        .map((item) =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as { lineText?: unknown }).lineText === "string"
            ? (item as { lineText: string }).lineText
            : "",
        )
        .filter(Boolean)
        .join(", ")
    : "";

  if (!itemNote) return normalized;

  const hasTransactionTag = Boolean(
    jsonb?.couponUse ||
    jsonb?.discount ||
    (typeof jsonb?.deliveryFee === "number" && jsonb.deliveryFee > 0) ||
    jsonb?.deliveryType === "self" ||
    jsonb?.deliveryType === "customer_quick" ||
    (typeof jsonb?.reservationDate === "string" &&
      jsonb.reservationDate.trim()),
  );
  if (!hasTransactionTag) return itemNote;

  const transactionCloseIndex = normalized.indexOf(")");
  if (transactionCloseIndex < 0) return itemNote;

  const transactionNote = normalized.slice(0, transactionCloseIndex + 1);
  const normalizedTransactionNote = transactionNote.startsWith("(")
    ? transactionNote
    : `(${transactionNote}`;
  return `${normalizedTransactionNote} ${itemNote}`;
};
