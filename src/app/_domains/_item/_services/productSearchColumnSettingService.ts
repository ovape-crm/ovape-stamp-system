import supabase from '@/libs/supabaseClient';

export type ProductSearchMode = 'liquid' | 'other';

export const productSearchColumnSettingKey = [
  'product-search',
  'column-settings',
] as const;

export const getProductSearchColumnSettings = async (): Promise<
  Partial<Record<ProductSearchMode, Record<string, number>>>
> => {
  const { data, error } = await supabase
    .from('product_search_column_settings')
    .select('search_mode, column_widths');

  if (error) throw error;
  return Object.fromEntries(
    (data ?? []).map((row) => [row.search_mode, row.column_widths]),
  );
};

export const saveProductSearchColumnSettings = async (
  mode: ProductSearchMode,
  columnWidths: Record<string, number>,
): Promise<void> => {
  const { error } = await supabase
    .from('product_search_column_settings')
    .upsert(
      {
        search_mode: mode,
        column_widths: columnWidths,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'search_mode' },
    );

  if (error) throw error;
};
