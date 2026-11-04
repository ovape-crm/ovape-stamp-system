import supabase from '@/libs/supabaseClient';
import { ItemCategoryType } from '../_types/item.types';

export const getItemCategories = async (): Promise<ItemCategoryType[]> => {
  const { data, error } = await supabase
    .from('item_categories')
    .select('*')
    .order('order_index', { ascending: true });

  if (error) throw error;
  return data ?? [];
};

export const getItemCountByCategory = async (): Promise<
  Record<string, number>
> => {
  const { data, error } = await supabase
    .from('items')
    .select('category_id');

  if (error) throw error;

  const counts: Record<string, number> = {};
  (data ?? []).forEach((item) => {
    if (item.category_id) {
      counts[item.category_id] = (counts[item.category_id] || 0) + 1;
    }
  });
  return counts;
};

export const createItemCategory = async ({
  name,
  orderIndex,
  isLiquidCategory,
  liquidSaleKind,
}: {
  name: string;
  orderIndex: number;
  isLiquidCategory: boolean;
  liquidSaleKind: string | null;
}): Promise<ItemCategoryType> => {
  const { data, error } = await supabase
    .from('item_categories')
    .insert({ name, order_index: orderIndex, is_liquid_category: isLiquidCategory, liquid_sale_kind: liquidSaleKind })
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const updateItemCategory = async ({
  id,
  name,
  orderIndex,
  isLiquidCategory,
  liquidSaleKind,
}: {
  id: string;
  name: string;
  orderIndex: number;
  isLiquidCategory: boolean;
  liquidSaleKind: string | null;
}): Promise<void> => {
  const { error } = await supabase
    .from('item_categories')
    .update({ name, order_index: orderIndex, is_liquid_category: isLiquidCategory, liquid_sale_kind: liquidSaleKind })
    .eq('id', id);

  if (error) throw error;
};

export const deleteItemCategory = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('item_categories')
    .delete()
    .eq('id', id);

  if (error) throw error;
};
