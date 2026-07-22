import supabase from "@/libs/supabaseClient";

export type ProductSearchItem = {
  id: string;
  category_id: string | null;
  item_code: string;
  item_name: string;
  selling_price: number | null;
  liquid_type: string | null;
  liquid_flavor: string | null;
  note: string | null;
  is_use: boolean;
  current_quantity: number | null;
  item_categories: { name: string } | null;
  locations: string[];
};

export const getProductSearchItems = async (): Promise<ProductSearchItem[]> => {
  const [itemsResult, locationsResult, balancesResult] = await Promise.all([
    supabase
      .from("items")
      .select(
        "id, category_id, item_code, item_name, selling_price, liquid_type, liquid_flavor, note, is_use, item_categories(name)",
      )
      .order("item_name"),
    supabase
      .from("liqud_stand_cells")
      .select(
        "item_name, secondary_item_name, column_index, liqud_stand_sections(name)",
      ),
    supabase.from("inventory_balances").select("item_name, quantity"),
  ]);
  if (itemsResult.error) throw itemsResult.error;
  const locationsByItemName = new Map<string, string[]>();
  const quantityByItemName = new Map(
    (balancesResult.error ? [] : (balancesResult.data ?? [])).map((row) => [
      row.item_name,
      Number(row.quantity),
    ]),
  );
  for (const cell of locationsResult.error
    ? []
    : (locationsResult.data ?? [])) {
    const section = Array.isArray(cell.liqud_stand_sections)
      ? cell.liqud_stand_sections[0]
      : cell.liqud_stand_sections;
    const location = `${section?.name ?? "시연대"} 1-${cell.column_index + 1}`;
    for (const itemName of [cell.item_name, cell.secondary_item_name]) {
      if (!itemName) continue;
      locationsByItemName.set(itemName, [
        ...(locationsByItemName.get(itemName) ?? []),
        location,
      ]);
    }
  }

  return (itemsResult.data ?? []).map((item) => ({
    ...item,
    item_categories: Array.isArray(item.item_categories)
      ? (item.item_categories[0] ?? null)
      : item.item_categories,
    locations: locationsByItemName.get(item.item_name) ?? [],
    current_quantity: quantityByItemName.get(item.item_name) ?? null,
  })) as ProductSearchItem[];
};
