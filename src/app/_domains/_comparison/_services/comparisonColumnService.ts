import supabase from '@/libs/supabaseClient';
import { ComparisonColumnType } from '@/app/_domains/_comparison/_types/comparison.types';

/**
 * 활성 컬럼 목록 조회 (sort_order 오름차순)
 */
export const getComparisonColumns = async (): Promise<
  ComparisonColumnType[]
> => {
  const { data, error } = await supabase
    .from('comparison_columns')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) throw error;

  return data;
};

/**
 * 컬럼 생성
 */
export const createComparisonColumn = async (column: {
  name: string;
  key: string;
  sort_order: number;
}): Promise<ComparisonColumnType> => {
  const { data: existing, error: existingError } = await supabase
    .from('comparison_columns')
    .select('id')
    .eq('key', column.key)
    .eq('is_active', true)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) throw new Error('DUPLICATE_COLUMN_KEY');

  const { data, error } = await supabase
    .from('comparison_columns')
    .insert({ ...column, is_active: true })
    .select()
    .single();

  if (error) throw error;

  return data;
};

/**
 * 컬럼 수정
 */
export const updateComparisonColumn = async (
  id: string,
  updates: { name?: string; key?: string },
): Promise<ComparisonColumnType> => {
  if (updates.key) {
    const { data: existing, error: existingError } = await supabase
      .from('comparison_columns')
      .select('id')
      .eq('key', updates.key)
      .eq('is_active', true)
      .neq('id', id)
      .maybeSingle();

    if (existingError) throw existingError;
    if (existing) throw new Error('DUPLICATE_COLUMN_KEY');
  }

  const { data, error } = await supabase
    .from('comparison_columns')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;

  return data;
};

/**
 * 컬럼 순서 일괄 업데이트
 */
export const updateComparisonColumnOrders = async (
  orders: { id: string; sort_order: number }[],
): Promise<void> => {
  const updates = orders.map(({ id, sort_order }) =>
    supabase.from('comparison_columns').update({ sort_order }).eq('id', id),
  );

  const results = await Promise.all(updates);

  for (const { error } of results) {
    if (error) throw error;
  }
};

/**
 * 컬럼 삭제 (soft delete)
 */
export const deleteComparisonColumn = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('comparison_columns')
    .update({ is_active: false })
    .eq('id', id);

  if (error) throw error;
};
