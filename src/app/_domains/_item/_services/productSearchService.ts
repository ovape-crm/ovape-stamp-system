import supabase from '@/libs/supabaseClient';

export type ProductSearchItem = {
  id: string;
  item_code: string;
  item_name: string;
  selling_price: number | null;
  liquid_type: string | null;
  liquid_flavor: string | null;
  note: string | null;
  item_categories: { name: string } | null;
  locations: string[];
};

export const getProductSearchItems = async (): Promise<ProductSearchItem[]> => {
  const [itemsResult, locationsResult] = await Promise.all([
    supabase.from('items').select('id, item_code, item_name, selling_price, liquid_type, liquid_flavor, note, item_categories(name)').eq('is_use', true).order('item_name'),
    supabase.from('liqud_stand_cells').select('item_name, secondary_item_name, column_index, liqud_stand_sections(name)'),
  ]);
  if (itemsResult.error) throw itemsResult.error;
  const locationsByItemName = new Map<string, string[]>();
  for (const cell of locationsResult.error ? [] : (locationsResult.data ?? [])) {
    const section = Array.isArray(cell.liqud_stand_sections)
      ? cell.liqud_stand_sections[0]
      : cell.liqud_stand_sections;
    const location = `${section?.name ?? '시연대'} 1-${cell.column_index + 1}`;
    for (const itemName of [cell.item_name, cell.secondary_item_name]) {
      if (!itemName) continue;
      locationsByItemName.set(itemName, [...(locationsByItemName.get(itemName) ?? []), location]);
    }
  }

  return (itemsResult.data ?? []).map((item) => ({
    ...item,
    item_categories: Array.isArray(item.item_categories) ? (item.item_categories[0] ?? null) : item.item_categories,
    locations: locationsByItemName.get(item.item_name) ?? [],
  })) as ProductSearchItem[];
};
