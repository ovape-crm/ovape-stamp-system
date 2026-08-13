import supabase from "@/libs/supabaseClient";
import { ItemType } from "../_types/item.types";

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
  excludePurchasePrice?: boolean;
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
    const [locationResult, balanceResult] = await Promise.all([
      supabase
        .from("liqud_stand_cells")
        .select(
          "item_name, secondary_item_name, row_index, column_index, liqud_stand_sections(name)",
        ),
      supabase
        .from("inventory_balances")
        .select("item_name, quantity")
        .in(
          "item_name",
          items.map((item) => item.item_name),
        ),
    ]);
    let locations = locationResult.data;

    if (balanceResult.error) throw balanceResult.error;
    const quantityByItemName = new Map(
      (balanceResult.data ?? []).map((balance) => [
        normalizeItemName(balance.item_name),
        balance.quantity,
      ]),
    );

    // 시연대 SQL이 아직 최신 버전이 아니어도 품목 목록 자체는 정상 표시합니다.
    if (locationResult.error) {
      const legacyResult = await supabase
        .from("liqud_stand_cells")
        .select(
          "item_name, row_index, column_index, liqud_stand_sections(name)",
        );
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
  if (filters?.excludePurchasePrice) {
    return items.map((item) => ({ ...item, purchase_price: null }));
  }
  return items;
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
  purchasePrice: number | null;
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
    purchase_price: values.purchasePrice,
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
    purchasePrice: number | null;
    sellingPrice: number | null;
    liquidType: string;
    liquidFlavor: string;
    note: string;
    isUse: boolean;
  },
): Promise<void> => {
  const itemName = normalizeItemName(values.itemName);
  await ensureUniqueItemName(itemName, id);
  const { error } = await supabase
    .from("items")
    .update({
      category_id: values.categoryId,
      item_code: values.itemCode,
      item_name: itemName,
      purchase_price: values.purchasePrice,
      selling_price: values.sellingPrice,
      liquid_type: values.liquidType || null,
      liquid_flavor: values.liquidFlavor || null,
      note: values.note || null,
      is_use: values.isUse,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw error;
};

export const deleteItem = async (id: string): Promise<void> => {
  const { error } = await supabase.from("items").delete().eq("id", id);
  if (error) throw error;
};
