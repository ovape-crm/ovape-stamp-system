import supabase from "@/libs/supabaseClient";
import { ItemType } from "../_types/item.types";

export type ItemSearchOption = Pick<
  ItemType,
  "id" | "item_name" | "item_categories"
>;

export type ItemDeactivationImpact = {
  itemId: string;
  itemName: string;
  stockQuantity: number;
  pendingPurchaseLineCount: number;
  pendingReservationLineCount: number;
  liquidStandPlacementCount: number;
  activeMemoRuleCount: number;
};

export const hasItemDeactivationImpact = (impact: ItemDeactivationImpact) =>
  impact.stockQuantity !== 0 ||
  impact.pendingPurchaseLineCount > 0 ||
  impact.pendingReservationLineCount > 0 ||
  impact.liquidStandPlacementCount > 0 ||
  impact.activeMemoRuleCount > 0;

export const getItemDeactivationImpacts = async (
  itemIds: string[],
): Promise<ItemDeactivationImpact[]> => {
  if (!itemIds.length) return [];
  const { data: items, error: itemsError } = await supabase
    .from("items")
    .select("id, item_name")
    .in("id", itemIds);
  if (itemsError) throw itemsError;
  const resolvedItems = (items ?? []).map((item) => ({
    id: String(item.id),
    itemName: normalizeItemName(item.item_name),
  }));
  const itemNames = resolvedItems.map((item) => item.itemName);
  const [balances, purchaseLines, primaryCells, secondaryCells, memoRules] =
    await Promise.all([
      supabase.from("inventory_balances").select("item_name, quantity").in("item_name", itemNames),
      supabase.from("inventory_purchase_order_lines").select("item_name, pending_quantity, handling_type, reservation_log_id").in("item_name", itemNames).gt("pending_quantity", 0),
      supabase.from("liqud_stand_cells").select("item_name").in("item_name", itemNames),
      supabase.from("liqud_stand_cells").select("secondary_item_name").in("secondary_item_name", itemNames),
      supabase.from("outbound_memo_rules").select("item_id").in("item_id", itemIds).eq("is_active", true),
    ]);
  for (const result of [balances, purchaseLines, primaryCells, secondaryCells, memoRules]) {
    if (result.error) throw result.error;
  }
  const balanceByName = new Map((balances.data ?? []).map((row) => [normalizeItemName(row.item_name), Number(row.quantity)]));
  const linesByName = new Map<string, { pending: number; reservations: number }>();
  for (const line of purchaseLines.data ?? []) {
    const name = normalizeItemName(line.item_name);
    const current = linesByName.get(name) ?? { pending: 0, reservations: 0 };
    current.pending += 1;
    if (line.handling_type === "reservation" || line.reservation_log_id) current.reservations += 1;
    linesByName.set(name, current);
  }
  const placementsByName = new Map<string, number>();
  for (const cell of primaryCells.data ?? []) {
    const name = normalizeItemName(cell.item_name);
    placementsByName.set(name, (placementsByName.get(name) ?? 0) + 1);
  }
  for (const cell of secondaryCells.data ?? []) {
    const name = normalizeItemName(cell.secondary_item_name);
    placementsByName.set(name, (placementsByName.get(name) ?? 0) + 1);
  }
  const rulesById = new Map<string, number>();
  for (const rule of memoRules.data ?? []) {
    if (rule.item_id) rulesById.set(String(rule.item_id), (rulesById.get(String(rule.item_id)) ?? 0) + 1);
  }
  return resolvedItems.map((item) => {
    const name = item.itemName;
    const lines = linesByName.get(name) ?? { pending: 0, reservations: 0 };
    return { itemId: item.id, itemName: item.itemName, stockQuantity: balanceByName.get(name) ?? 0, pendingPurchaseLineCount: lines.pending, pendingReservationLineCount: lines.reservations, liquidStandPlacementCount: placementsByName.get(name) ?? 0, activeMemoRuleCount: rulesById.get(item.id) ?? 0 };
  });
};

const normalizeItemName = (value: string) => value.normalize("NFC").trim();

const ensureUniqueItemName = async (itemName: string, excludeId?: string) => {
  let query = supabase
    .from("items")
    .select("id, item_name")
    .ilike("item_name", itemName);
  if (excludeId) query = query.neq("id", excludeId);
  const { data, error } = await query;
  if (error) throw error;
  if (
    (data ?? []).some((item) => normalizeItemName(item.item_name) === itemName)
  ) {
    throw new Error(`이미 등록된 품목명입니다: ${itemName}`);
  }
};

type ItemFiltersParam = {
  categoryId?: string;
  searchConditions?: { searchTarget: string; searchKeyword: string }[];
  searchKeyword?: string;
  isUse?: boolean;
};

const buildQuery = (filters?: ItemFiltersParam) => {
  let query = supabase
    .from("items")
    .select("*, item_categories(id, name, order_index, created_at)");

  if (filters?.categoryId) {
    query = query.eq("category_id", filters.categoryId);
  }

  if (filters?.searchConditions?.length) {
    for (const cond of filters.searchConditions) {
      query = query.ilike(cond.searchTarget, `%${cond.searchKeyword}%`);
    }
  }

  if (filters?.searchKeyword) {
    const keyword = filters.searchKeyword.replaceAll(",", "\\,").trim();
    query = query.or(
      `item_name.ilike.%${keyword}%,item_code.ilike.%${keyword}%`,
    );
  }

  if (filters?.isUse !== undefined) {
    query = query.eq("is_use", filters.isUse);
  }

  return query;
};

export const getItems = async (
  limit: number,
  offset: number,
  filters?: ItemFiltersParam,
): Promise<ItemType[]> => {
  const { data, error } = await buildQuery(filters)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  const items = (data ?? []) as ItemType[];
  if (items.length) {
    const itemNames = [...new Set(items.map((item) => item.item_name))];
    const [primaryLocationResult, secondaryLocationResult, balanceResult] =
      await Promise.all([
        supabase
          .from("liqud_stand_cells")
          .select(
            "item_name, secondary_item_name, row_index, column_index, liqud_stand_sections(name)",
          )
          .in("item_name", itemNames),
        supabase
          .from("liqud_stand_cells")
          .select(
            "item_name, secondary_item_name, row_index, column_index, liqud_stand_sections(name)",
          )
          .in("secondary_item_name", itemNames),
        supabase
          .from("inventory_balances")
          .select("item_name, quantity")
          .in("item_name", itemNames),
      ]);
    let locations = [
      ...(primaryLocationResult.data ?? []),
      ...(secondaryLocationResult.data ?? []),
    ];

    if (balanceResult.error) throw balanceResult.error;
    const quantityByItemName = new Map(
      (balanceResult.data ?? []).map((balance) => [
        normalizeItemName(balance.item_name),
        balance.quantity,
      ]),
    );

    // 시연대 SQL이 아직 최신 버전이 아니어도 품목 목록 자체는 정상 표시합니다.
    if (primaryLocationResult.error || secondaryLocationResult.error) {
      const legacyResult = await supabase
        .from("liqud_stand_cells")
        .select(
          "item_name, row_index, column_index, liqud_stand_sections(name)",
        )
        .in("item_name", itemNames);
      locations = legacyResult.error
        ? []
        : (legacyResult.data ?? []).map((cell) => ({
            ...cell,
            secondary_item_name: null,
          }));
    }
    for (const item of items) {
      item.current_quantity =
        quantityByItemName.get(normalizeItemName(item.item_name)) ?? 0;
      item.liqud_stand_cells = (locations ?? [])
        .filter(
          (cell) =>
            cell.item_name === item.item_name ||
            cell.secondary_item_name === item.item_name,
        )
        .map((cell) => ({
          row_index: cell.row_index,
          column_index: cell.column_index,
          liqud_stand_sections: Array.isArray(cell.liqud_stand_sections)
            ? (cell.liqud_stand_sections[0] ?? null)
            : cell.liqud_stand_sections,
        }));
    }
  }
  return items;
};

export const searchItemOptions = async (
  keyword: string,
  limit = 20,
): Promise<ItemSearchOption[]> => {
  const normalizedKeyword = keyword.trim();
  if (!normalizedKeyword) return [];

  const { data, error } = await supabase
    .from("items")
    .select("id, item_name, item_categories(id, name, order_index, created_at)")
    .eq("is_use", true)
    .ilike("item_name", `%${normalizedKeyword}%`)
    .order("item_name", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map((item) => ({
    id: item.id,
    item_name: item.item_name,
    item_categories: Array.isArray(item.item_categories)
      ? (item.item_categories[0] ?? null)
      : item.item_categories,
  }));
};

/** 출고 검색 결과의 품목만 묶어서 실재고를 조회한다. 시연대 위치는 조회하지 않는다. */
export const searchOutboundItems = async (
  keyword: string,
  limit = 20,
): Promise<ItemType[]> => {
  const normalizedKeyword = keyword.trim();
  if (!normalizedKeyword) return [];

  const { data, error } = await supabase
    .from("items")
    .select("*, item_categories(id, name, order_index, created_at)")
    .eq("is_use", true)
    .ilike("item_name", `%${normalizedKeyword}%`)
    .order("item_name", { ascending: true })
    .limit(limit);
  if (error) throw error;
  const items = (data ?? []) as ItemType[];
  if (!items.length) return [];
  const itemNames = [
    ...new Set(items.map((item) => normalizeItemName(item.item_name))),
  ];
  const { data: balances, error: balanceError } = await supabase
    .from("inventory_balances")
    .select("item_name, quantity")
    .in("item_name", itemNames);
  if (balanceError)
    throw new Error("재고 잔량을 불러오지 못했습니다. 다시 검색해 주세요.");
  const quantityByName = new Map(
    (balances ?? []).map((row) => [
      normalizeItemName(row.item_name),
      Number(row.quantity),
    ]),
  );
  return items.map((item) => ({
    ...item,
    current_quantity:
      quantityByName.get(normalizeItemName(item.item_name)) ?? 0,
  }));
};

export const getItemsCount = async (
  filters?: ItemFiltersParam,
): Promise<number> => {
  let query = supabase
    .from("items")
    .select("*", { count: "exact", head: true });

  if (filters?.categoryId) {
    query = query.eq("category_id", filters.categoryId);
  }

  if (filters?.searchConditions?.length) {
    for (const cond of filters.searchConditions) {
      query = query.ilike(cond.searchTarget, `%${cond.searchKeyword}%`);
    }
  }

  if (filters?.searchKeyword) {
    const keyword = filters.searchKeyword.replaceAll(",", "\\,").trim();
    query = query.or(
      `item_name.ilike.%${keyword}%,item_code.ilike.%${keyword}%`,
    );
  }

  if (filters?.isUse !== undefined) {
    query = query.eq("is_use", filters.isUse);
  }

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
};

export const createItem = async (values: {
  categoryId: string | null;
  itemCode: string;
  itemName: string;
  sellingPrice: number | null;
  liquidType: string;
  liquidFlavor: string;
  note: string;
}): Promise<void> => {
  const itemName = normalizeItemName(values.itemName);
  await ensureUniqueItemName(itemName);
  const { error } = await supabase.from("items").insert({
    category_id: values.categoryId,
    item_code: values.itemCode,
    item_name: itemName,
    selling_price: values.sellingPrice,
    liquid_type: values.liquidType || null,
    liquid_flavor: values.liquidFlavor || null,
    note: values.note || null,
    is_use: true,
  });

  if (error) throw error;
};

export const updateItem = async (
  id: string,
  values: {
    categoryId: string | null;
    itemCode: string;
    itemName: string;
    sellingPrice: number | null;
    liquidType: string;
    liquidFlavor: string;
    note: string;
    isUse: boolean;
  },
): Promise<void> => {
  const itemName = normalizeItemName(values.itemName);
  await ensureUniqueItemName(itemName, id);
  const { data, error } = await supabase.rpc("save_items_bulk", {
    p_items: [
      {
        id,
        category_id: values.categoryId,
        item_code: values.itemCode.trim(),
        item_name: itemName,
        selling_price: values.sellingPrice,
        liquid_type: values.liquidType.trim() || null,
        liquid_flavor: values.liquidFlavor.trim() || null,
        note: values.note.trim() || null,
        is_use: values.isUse,
      },
    ],
  });

  if (error) throw error;
  if (data !== 1) throw new Error("품목이 수정되지 않았습니다. 권한과 품목 정보를 확인해 주세요.");
};

export type BulkItemUpdate = {
  id: string;
  categoryId: string | null;
  itemCode: string;
  itemName: string;
  sellingPrice: number | null;
  liquidType: string;
  liquidFlavor: string;
  note: string;
  isUse: boolean;
};

export const updateItemsInBulk = async (items: BulkItemUpdate[]) => {
  if (!items.length) return 0;
  const { data, error } = await supabase.rpc("save_items_bulk", {
    p_items: items.map((item) => ({
      id: item.id,
      category_id: item.categoryId,
      item_code: item.itemCode.trim(),
      item_name: normalizeItemName(item.itemName),
      selling_price: item.sellingPrice,
      liquid_type: item.liquidType.trim() || null,
      liquid_flavor: item.liquidFlavor.trim() || null,
      note: item.note.trim() || null,
      is_use: item.isUse,
    })),
  });
  if (error) throw error;
  if (data !== items.length) {
    throw new Error("일부 품목이 수정되지 않아 전체 저장을 취소했습니다.");
  }
  return data as number;
};

export const deleteItem = async (id: string): Promise<void> => {
  const { error } = await supabase.from("items").delete().eq("id", id);
  if (error) throw error;
};
