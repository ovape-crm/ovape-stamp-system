import supabase from '@/libs/supabaseClient';
import { ItemType } from '../_types/item.types';

export type BulkItemRow = {
  itemName: string;
  itemCode: string;
  categoryName: string;
  purchasePrice: number | null;
  sellingPrice: number | null;
  liquidType: string;
  liquidFlavor: string;
  note: string;
};

export const normalizeBulkItemName = (value: string) => value.normalize('NFC').trim();

export const getAllItemsForBulk = async (): Promise<ItemType[]> => {
  const result: ItemType[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('items')
      .select('*, item_categories(id, name, order_index, created_at)')
      .order('id')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    result.push(...((data ?? []) as ItemType[]));
    if ((data ?? []).length < pageSize) break;
  }
  return result;
};

export const replaceItemsInBulk = async (rows: BulkItemRow[]): Promise<{ inserted: number; updated: number; deactivated: number }> => {
  const { data, error } = await supabase.rpc('replace_items_by_name_v2', {
    p_items: rows.map((row) => ({
      item_name: normalizeBulkItemName(row.itemName),
      item_code: row.itemCode.trim(),
      category_name: row.categoryName.trim(),
      purchase_price: row.purchasePrice,
      selling_price: row.sellingPrice,
      liquid_type: row.liquidType.trim() || null,
      liquid_flavor: row.liquidFlavor.trim() || null,
      note: row.note.trim() || null,
    })),
  });
  if (error) throw error;
  return data as { inserted: number; updated: number; deactivated: number };
};
