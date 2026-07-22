import supabase from '@/libs/supabaseClient';

export const liquidCategorySettingKey = ['product-search', 'liquid-categories'] as const;

export const getLiquidSearchCategoryIds = async (): Promise<string[]> => {
  const { data, error } = await supabase
    .from('product_search_category_settings')
    .select('category_id')
    .eq('search_group', 'liquid');

  if (error) throw error;
  return (data ?? []).map((setting) => String(setting.category_id));
};

export const saveLiquidSearchCategoryIds = async (categoryIds: string[]): Promise<void> => {
  const { data: currentSettings, error: readError } = await supabase
    .from('product_search_category_settings')
    .select('category_id')
    .eq('search_group', 'liquid');

  if (readError) throw readError;

  const selectedIds = new Set(categoryIds);
  const removedIds = (currentSettings ?? [])
    .map((setting) => String(setting.category_id))
    .filter((categoryId) => !selectedIds.has(categoryId));

  if (removedIds.length) {
    const { error } = await supabase
      .from('product_search_category_settings')
      .delete()
      .eq('search_group', 'liquid')
      .in('category_id', removedIds);
    if (error) throw error;
  }

  if (categoryIds.length) {
    const { error } = await supabase
      .from('product_search_category_settings')
      .upsert(
        categoryIds.map((categoryId) => ({ category_id: categoryId, search_group: 'liquid' })),
        { onConflict: 'search_group,category_id' },
      );
    if (error) throw error;
  }
};
