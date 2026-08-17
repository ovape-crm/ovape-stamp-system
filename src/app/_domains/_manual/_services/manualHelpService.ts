import supabase from '@/libs/supabaseClient';
import { ManualType } from '../_types/manual.types';

const SELECT_QUERY = '*, manual_sub_categories(*, manual_top_categories(*))';

export type ManualHelpBinding = {
  locationKey: string;
  manualId: string;
  manual: ManualType;
};

export type ManualHelpDisplayMode = 'help_button' | 'direct_with_help';
export type ManualHelpPosition =
  | 'inside_right'
  | 'outside_right'
  | 'outside_left'
  | 'top_right';

export type PageManualHelpBinding = ManualHelpBinding & {
  pagePath: string;
  targetSelector: string;
  targetLabel: string;
  displayMode: ManualHelpDisplayMode;
  position: ManualHelpPosition;
};

export const getCurrentUserIsAdmin = async (): Promise<boolean> => {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError || !session) return false;

  const { data, error } = await supabase
    .from('users')
    .select('oss_role')
    .eq('id', session.user.id)
    .maybeSingle();
  if (error) throw error;
  return data?.oss_role === 'admin';
};

export const getManualHelpBinding = async (
  locationKey: string,
): Promise<ManualHelpBinding | null> => {
  const { data: binding, error: bindingError } = await supabase
    .from('manual_help_bindings')
    .select('location_key, manual_id')
    .eq('location_key', locationKey)
    .maybeSingle();
  if (bindingError) throw bindingError;
  if (!binding) return null;

  const { data: manual, error: manualError } = await supabase
    .from('manuals')
    .select(SELECT_QUERY)
    .eq('id', binding.manual_id)
    .eq('is_use', true)
    .maybeSingle();
  if (manualError) throw manualError;
  if (!manual) return null;

  return {
    locationKey: binding.location_key,
    manualId: binding.manual_id,
    manual: manual as unknown as ManualType,
  };
};

export const getPageManualHelpBindings = async (
  pagePath: string,
): Promise<PageManualHelpBinding[]> => {
  const { data: bindings, error: bindingError } = await supabase
    .from('manual_help_bindings')
    .select('location_key, manual_id, page_path, target_selector, target_label, display_mode, position')
    .eq('page_path', pagePath);
  if (bindingError) throw bindingError;
  if (!bindings?.length) return [];

  const manualIds = [...new Set(bindings.map((binding) => binding.manual_id))];
  const { data: manuals, error: manualError } = await supabase
    .from('manuals')
    .select(SELECT_QUERY)
    .in('id', manualIds)
    .eq('is_use', true);
  if (manualError) throw manualError;

  const manualsById = new Map(
    ((manuals ?? []) as unknown as ManualType[]).map((manual) => [manual.id, manual]),
  );

  return bindings.flatMap((binding) => {
    const manual = manualsById.get(binding.manual_id);
    if (!manual || !binding.page_path || !binding.target_selector) return [];
    return [{
      locationKey: binding.location_key,
      manualId: binding.manual_id,
      manual,
      pagePath: binding.page_path,
      targetSelector: binding.target_selector,
      targetLabel: binding.target_label ?? '선택한 요소',
      displayMode: binding.display_mode as ManualHelpDisplayMode,
      position: (binding.position ?? 'inside_right') as ManualHelpPosition,
    }];
  });
};

export const searchManualHelpOptions = async (
  keyword: string,
): Promise<ManualType[]> => {
  let query = supabase
    .from('manuals')
    .select(SELECT_QUERY)
    .eq('is_use', true)
    .order('created_at', { ascending: false })
    .limit(50);
  if (keyword.trim()) query = query.ilike('title', `%${keyword.trim()}%`);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as ManualType[];
};

export const saveManualHelpBinding = async (
  locationKey: string,
  manualId: string,
): Promise<void> => {
  const { error } = await supabase.from('manual_help_bindings').upsert(
    {
      location_key: locationKey,
      manual_id: manualId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'location_key' },
  );
  if (error) throw error;
};

export const savePlacedManualHelpBinding = async ({
  locationKey,
  manualId,
  pagePath,
  targetSelector,
  targetLabel,
  displayMode,
  position,
}: Omit<PageManualHelpBinding, 'manual'>): Promise<void> => {
  const { error } = await supabase.from('manual_help_bindings').upsert(
    {
      location_key: locationKey,
      manual_id: manualId,
      page_path: pagePath,
      target_selector: targetSelector,
      target_label: targetLabel,
      display_mode: displayMode,
      position,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'location_key' },
  );
  if (error) throw error;
};

export const deleteManualHelpBinding = async (
  locationKey: string,
): Promise<void> => {
  const { error } = await supabase
    .from('manual_help_bindings')
    .delete()
    .eq('location_key', locationKey);
  if (error) throw error;
};
