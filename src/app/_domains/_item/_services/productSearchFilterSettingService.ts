import supabase from '@/libs/supabaseClient';

export type ProductSearchUsageFilter = 'all' | 'used' | 'unused';

export type ProductSearchFilterSettings = {
  usageFilter: ProductSearchUsageFilter;
  showSoldOut: boolean;
};

export const productSearchFilterSettingKey = [
  'product-search',
  'filter-settings',
] as const;

export const getProductSearchFilterSettings = async (): Promise<ProductSearchFilterSettings> => {
  const { data, error } = await supabase
    .from('product_search_filter_settings')
    .select('usage_filter, show_sold_out')
    .eq('id', 1)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('상품 검색 기본값이 없습니다.');
  return {
    usageFilter: data.usage_filter as ProductSearchUsageFilter,
    showSoldOut: data.show_sold_out,
  };
};

export const saveProductSearchFilterSettings = async (
  settings: Partial<ProductSearchFilterSettings>,
): Promise<void> => {
  const { error } = await supabase
    .from('product_search_filter_settings')
    .update({
      ...(settings.usageFilter !== undefined ? { usage_filter: settings.usageFilter } : {}),
      ...(settings.showSoldOut !== undefined ? { show_sold_out: settings.showSoldOut } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1)
    .select('id')
    .single();

  if (error) throw error;
};
