type HistoryNoteJsonb = Record<string, unknown> | null | undefined;

type HistoryItem = {
  lineText?: unknown;
  isLiquidCategory?: unknown;
  liquidSaleKind?: unknown;
  outboundRuleType?: unknown;
};

const withQuantitySeparator = (value: string, unit: "개" | "병" | "건") =>
  value.replace(
    new RegExp(`^(.*)\\s+(\\d+${unit})(.*)$`),
    "$1 - $2$3",
  );

const formatItemLineText = (item: HistoryItem) => {
  if (typeof item.lineText !== "string") return "";
  const isLiquid =
    item.isLiquidCategory === true || typeof item.liquidSaleKind === "string";
  const lineText = isLiquid
    ? item.lineText.replace(/(\d+)개(?=\s*\(|$)/, "$1병")
    : item.lineText;
  return withQuantitySeparator(lineText, isLiquid ? "병" : "개");
};

const buildOrderedOutboundItemNote = (jsonb?: HistoryNoteJsonb) => {
  const items = Array.isArray(jsonb?.items)
    ? jsonb.items.filter(
        (item): item is HistoryItem => typeof item === "object" && item !== null,
      )
    : [];
  const getBreath = (item: HistoryItem | undefined) => {
    if (item?.outboundRuleType && item.outboundRuleType !== "standard") return null;
    return typeof item?.liquidSaleKind === "string" && item.liquidSaleKind.startsWith("mtl_")
      ? "mtl"
      : typeof item?.liquidSaleKind === "string" && item.liquidSaleKind.startsWith("dtl_")
        ? "dtl"
        : null;
  };
  const liquidSortOrder: Record<string, number> = {
    mtl_event: 0,
    mtl_basic: 1,
    dtl_event: 2,
    dtl_basic: 3,
  };
  const displayItems = items
    .map((item, sourceIndex) => ({ item, sourceIndex }))
    .sort((left, right) => {
      const leftOrder = getBreath(left.item)
        ? liquidSortOrder[String(left.item.liquidSaleKind)] ?? 4
        : 4;
      const rightOrder = getBreath(right.item)
        ? liquidSortOrder[String(right.item.liquidSaleKind)] ?? 4
        : 4;
      return leftOrder - rightOrder || left.sourceIndex - right.sourceIndex;
    });
  const liquidSale =
    typeof jsonb?.liquidSale === "object" && jsonb.liquidSale !== null
      ? (jsonb.liquidSale as Record<string, unknown>)
      : undefined;
  const getLiquidRows = (breathType: "mtl" | "dtl") => [
    ...(Array.isArray(liquidSale?.appliedRules) ? liquidSale.appliedRules : [])
      .flatMap((rule) => {
        if (typeof rule !== "object" || rule === null) return [];
        const value = rule as Record<string, unknown>;
        return value.breathType === breathType && typeof value.label === "string"
          ? [withQuantitySeparator(`${value.label} ${typeof value.count === "number" ? value.count : 1}건`, "건")]
          : [];
      }),
    ...(Array.isArray(liquidSale?.additionalBottles)
      ? liquidSale.additionalBottles
          .filter(
            (bottle): bottle is Record<string, unknown> =>
              typeof bottle === "object" &&
              bottle !== null &&
              (bottle as Record<string, unknown>).breathType === breathType,
          )
          .map((bottle) =>
            typeof bottle.label === "string"
              ? withQuantitySeparator(`${bottle.label} ${typeof bottle.quantity === "number" ? bottle.quantity : 1}건`, "건")
              : "",
          )
          .filter(Boolean)
      : []),
  ];
  return displayItems
    .flatMap(({ item }, index) => {
      const breath = getBreath(item);
      const nextBreath = getBreath(displayItems[index + 1]?.item);
      return [
        formatItemLineText(item),
        ...(breath && breath !== nextBreath ? getLiquidRows(breath) : []),
      ];
    })
    .filter(Boolean)
    .join(", ");
};

const normalizeLegacyServiceNote = (note: string) =>
  note
    .replace(/\(서비스\((.*?)\)\)/g, "(서비스,$1)")
    .replace(/서비스\(\((.*?)\)\)/g, "서비스($1)")
    .replace(/할인할인/g, "할인");

const getLegacyLiquidSaleTags = (jsonb?: HistoryNoteJsonb) => {
  const liquidSale =
    typeof jsonb?.liquidSale === "object" && jsonb.liquidSale !== null
      ? (jsonb.liquidSale as Record<string, unknown>)
      : undefined;
  return new Set(
    (Array.isArray(liquidSale?.appliedRules) ? liquidSale.appliedRules : [])
      .map((rule) =>
        typeof rule === "object" && rule !== null
          ? (rule as Record<string, unknown>).label
          : "",
      )
      .filter((label): label is string => typeof label === "string"),
  );
};

export const formatHistoryNote = (note: string, jsonb?: HistoryNoteJsonb) => {
  const normalized = normalizeLegacyServiceNote(note);
  const itemNote = buildOrderedOutboundItemNote(jsonb);

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
  const liquidSaleTags = getLegacyLiquidSaleTags(jsonb);
  const transactionContent = transactionNote
    .replace(/^\(/, "")
    .replace(/\)$/, "")
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => !liquidSaleTags.has(tag));
  if (transactionContent.length === 0) return itemNote;
  const normalizedTransactionNote = `(${transactionContent.join(",")})`;
  return `${normalizedTransactionNote} ${itemNote}`;
};
