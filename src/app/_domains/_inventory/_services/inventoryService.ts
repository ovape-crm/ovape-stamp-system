import supabase from '@/libs/supabaseClient';
import { ItemType } from '../../_item/_types/item.types';
import { InventoryItemType } from '../_types/inventory.types';

type InventoryFiltersParam = {
  categoryId?: string;
  searchConditions?: { searchTarget: string; searchKeyword: string }[];
  isUse?: boolean;
};

type ItemRowWithInventory = ItemType & {
  items_inventory: { quantity: number }[] | { quantity: number } | null;
};

const buildQuery = (filters?: InventoryFiltersParam) => {
  let query = supabase
    .from('items')
    .select(
      '*, item_categories(id, name, order_index, created_at), items_inventory!items_id(quantity)',
    );

  if (filters?.categoryId) {
    query = query.eq('category_id', filters.categoryId);
  }

  if (filters?.searchConditions?.length) {
    for (const cond of filters.searchConditions) {
      query = query.ilike(cond.searchTarget, `%${cond.searchKeyword}%`);
    }
  }

  if (filters?.isUse !== undefined) {
    query = query.eq('is_use', filters.isUse);
  }

  return query;
};

const extractQuantity = (
  inventory: ItemRowWithInventory['items_inventory'],
): number => {
  if (!inventory) return 0;
  if (Array.isArray(inventory)) return inventory[0]?.quantity ?? 0;
  return inventory.quantity ?? 0;
};

export const getInventories = async (
  limit: number,
  offset: number,
  filters?: InventoryFiltersParam,
): Promise<InventoryItemType[]> => {
  const { data, error } = await buildQuery(filters)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  const rows = (data ?? []) as ItemRowWithInventory[];
  return rows.map((row) => {
    const { items_inventory, ...rest } = row;
    return {
      ...(rest as ItemType),
      inventory_quantity: extractQuantity(items_inventory),
    };
  });
};

export const getInventoryById = async (
  id: string,
): Promise<InventoryItemType | null> => {
  const { data, error } = await supabase
    .from('items')
    .select(
      '*, item_categories(id, name, order_index, created_at), items_inventory!items_id(quantity)',
    )
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as ItemRowWithInventory;
  const { items_inventory, ...rest } = row;
  return {
    ...(rest as ItemType),
    inventory_quantity: extractQuantity(items_inventory),
  };
};

export const getInventoriesCount = async (
  filters?: InventoryFiltersParam,
): Promise<number> => {
  let query = supabase
    .from('items')
    .select('*', { count: 'exact', head: true });

  if (filters?.categoryId) {
    query = query.eq('category_id', filters.categoryId);
  }

  if (filters?.searchConditions?.length) {
    for (const cond of filters.searchConditions) {
      query = query.ilike(cond.searchTarget, `%${cond.searchKeyword}%`);
    }
  }

  if (filters?.isUse !== undefined) {
    query = query.eq('is_use', filters.isUse);
  }

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
};
