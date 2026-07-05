import supabase from '@/libs/supabaseClient';
import {
  ManualTopCategoryType,
  ManualSubCategoryType,
  ManualCategoryTree,
} from '../_types/manual.types';

// ============================================================================
// 상위 타입
// ============================================================================

export const getManualTopCategories = async (
  tab: string,
): Promise<ManualTopCategoryType[]> => {
  const { data, error } = await supabase
    .from('manual_top_categories')
    .select('*')
    .eq('tab', tab)
    .order('order_index', { ascending: true });

  if (error) throw error;
  return data ?? [];
};

export const createManualTopCategory = async ({
  tab,
  name,
  orderIndex,
}: {
  tab: string;
  name: string;
  orderIndex: number;
}): Promise<ManualTopCategoryType> => {
  const { data, error } = await supabase
    .from('manual_top_categories')
    .insert({ tab, name, order_index: orderIndex })
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const updateManualTopCategory = async ({
  id,
  name,
}: {
  id: string;
  name: string;
}): Promise<void> => {
  const { error } = await supabase
    .from('manual_top_categories')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
};

export const updateManualTopCategoryOrders = async (
  orders: { id: string; order_index: number }[],
): Promise<void> => {
  const updates = orders.map(({ id, order_index }) =>
    supabase
      .from('manual_top_categories')
      .update({ order_index })
      .eq('id', id),
  );

  const results = await Promise.all(updates);
  for (const { error } of results) {
    if (error) throw error;
  }
};

export const deleteManualTopCategory = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('manual_top_categories')
    .delete()
    .eq('id', id);

  if (error) throw error;
};

// ============================================================================
// 하위 타입
// ============================================================================

export const getManualSubCategories = async (
  topCategoryId: string,
): Promise<ManualSubCategoryType[]> => {
  const { data, error } = await supabase
    .from('manual_sub_categories')
    .select('*')
    .eq('top_category_id', topCategoryId)
    .order('order_index', { ascending: true });

  if (error) throw error;
  return data ?? [];
};

export const createManualSubCategory = async ({
  topCategoryId,
  name,
  orderIndex,
}: {
  topCategoryId: string;
  name: string;
  orderIndex: number;
}): Promise<ManualSubCategoryType> => {
  const { data, error } = await supabase
    .from('manual_sub_categories')
    .insert({ top_category_id: topCategoryId, name, order_index: orderIndex })
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const updateManualSubCategory = async ({
  id,
  name,
}: {
  id: string;
  name: string;
}): Promise<void> => {
  const { error } = await supabase
    .from('manual_sub_categories')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
};

export const updateManualSubCategoryOrders = async (
  orders: { id: string; order_index: number }[],
): Promise<void> => {
  const updates = orders.map(({ id, order_index }) =>
    supabase
      .from('manual_sub_categories')
      .update({ order_index })
      .eq('id', id),
  );

  const results = await Promise.all(updates);
  for (const { error } of results) {
    if (error) throw error;
  }
};

export const deleteManualSubCategory = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('manual_sub_categories')
    .delete()
    .eq('id', id);

  if (error) throw error;
};

// ============================================================================
// 카테고리 트리 (탭 기준)
// ============================================================================

export const getManualCategoryTree = async (
  tab: string,
): Promise<ManualCategoryTree> => {
  const topCategories = await getManualTopCategories(tab);
  if (topCategories.length === 0) {
    return { topCategories: [], subCategoriesByTop: {} };
  }

  const { data, error } = await supabase
    .from('manual_sub_categories')
    .select('*')
    .in(
      'top_category_id',
      topCategories.map((c) => c.id),
    )
    .order('order_index', { ascending: true });

  if (error) throw error;

  const subCategoriesByTop: Record<string, ManualSubCategoryType[]> = {};
  (data ?? []).forEach((sub) => {
    if (!subCategoriesByTop[sub.top_category_id]) {
      subCategoriesByTop[sub.top_category_id] = [];
    }
    subCategoriesByTop[sub.top_category_id].push(sub);
  });

  return { topCategories, subCategoriesByTop };
};

export const getManualCountBySubCategory = async (): Promise<
  Record<string, number>
> => {
  const { data, error } = await supabase.from('manuals').select('sub_category_id');
  if (error) throw error;

  const counts: Record<string, number> = {};
  (data ?? []).forEach((m) => {
    if (m.sub_category_id) {
      counts[m.sub_category_id] = (counts[m.sub_category_id] || 0) + 1;
    }
  });
  return counts;
};
