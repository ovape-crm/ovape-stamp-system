import supabase from '@/libs/supabaseClient';
import { ManualType } from '../_types/manual.types';
import { ManualSearchCondition } from '../_queryKeys/manualKeys';

type ManualFiltersParam = {
  subCategoryId?: string;
  subCategoryIds?: string[];
  searchConditions?: ManualSearchCondition[];
};

const SELECT_QUERY = '*, manual_sub_categories(*, manual_top_categories(*))';

// 존재할 수 없는 uuid: top 카테고리는 선택했지만 하위 카테고리가 하나도 없는 경우
// .in('sub_category_id', []) 는 PostgREST 에러를 유발하므로 대신 이 값으로 필터링해 0건을 반환한다.
const NONE_UUID = '00000000-0000-0000-0000-000000000000';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const applyManualFilters = (query: any, filters?: ManualFiltersParam): any => {
  let next = query;

  if (filters?.subCategoryId) {
    next = next.eq('sub_category_id', filters.subCategoryId);
  } else if (filters?.subCategoryIds !== undefined) {
    next =
      filters.subCategoryIds.length > 0
        ? next.in('sub_category_id', filters.subCategoryIds)
        : next.eq('sub_category_id', NONE_UUID);
  }

  if (filters?.searchConditions?.length) {
    for (const cond of filters.searchConditions) {
      next = next.ilike(cond.searchTarget, `%${cond.searchKeyword}%`);
    }
  }

  return next;
};

const buildQuery = (filters?: ManualFiltersParam) =>
  applyManualFilters(supabase.from('manuals').select(SELECT_QUERY), filters);

export const getManuals = async (
  limit: number,
  offset: number,
  filters?: ManualFiltersParam,
): Promise<ManualType[]> => {
  const { data, error } = await buildQuery(filters)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return (data ?? []) as unknown as ManualType[];
};

export const getManualsCount = async (
  filters?: ManualFiltersParam,
): Promise<number> => {
  const query = applyManualFilters(
    supabase.from('manuals').select('*', { count: 'exact', head: true }),
    filters,
  );

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
};

export const createManual = async (values: {
  subCategoryId: string;
  title: string;
  content: string;
}): Promise<void> => {
  const { error } = await supabase.from('manuals').insert({
    sub_category_id: values.subCategoryId,
    title: values.title,
    content: values.content,
    is_use: true,
  });

  if (error) throw error;
};

export const updateManual = async (
  id: string,
  values: {
    subCategoryId: string;
    title: string;
    content: string;
  },
): Promise<void> => {
  const { error } = await supabase
    .from('manuals')
    .update({
      sub_category_id: values.subCategoryId,
      title: values.title,
      content: values.content,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) throw error;
};

export const deleteManual = async (id: string): Promise<void> => {
  const { error } = await supabase.from('manuals').delete().eq('id', id);
  if (error) throw error;
};
