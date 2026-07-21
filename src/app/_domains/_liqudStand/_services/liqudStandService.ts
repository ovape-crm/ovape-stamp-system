import supabase from '@/libs/supabaseClient';
import type { LiqudStandSection, LiqudStandSettings } from '../_types/liqudStand.types';

const withTimeout = async <T>(request: PromiseLike<T>, label: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(request),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} 조회가 10초 안에 응답하지 않았습니다.`)), 10_000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export const getLiqudStand = async () => {
  const [settingsResult, sectionsResult, cellsResult] = await Promise.all([
    withTimeout(supabase.from('liqud_stand_settings').select('*').eq('id', 1).maybeSingle(), '시연대 기준'),
    withTimeout(supabase.from('liqud_stand_sections').select('*').order('sort_order'), '시연대 구역'),
    withTimeout(supabase.from('liqud_stand_cells').select('*'), '시연대 칸'),
  ]);
  if (settingsResult.error) throw settingsResult.error;
  if (sectionsResult.error) throw sectionsResult.error;
  if (cellsResult.error) throw cellsResult.error;
  const cellsBySection = new Map<string, typeof cellsResult.data>();
  for (const cell of cellsResult.data ?? []) {
    const sectionCells = cellsBySection.get(cell.section_id) ?? [];
    sectionCells.push(cell);
    cellsBySection.set(cell.section_id, sectionCells);
  }
  const sections = (sectionsResult.data ?? []).map((section) => ({
    ...section,
    liqud_stand_cells: (cellsBySection.get(section.id) ?? [])
      .map((cell) => ({ ...cell, items: null, secondary_item: null })),
  })) as LiqudStandSection[];
  return {
    settings: (settingsResult.data ?? { id: 1, blue_days: 14, red_days: 28 }) as LiqudStandSettings,
    sections,
  };
};

export const updateLiqudSettings = async (blueDays: number, redDays: number) => {
  const { error } = await supabase.from('liqud_stand_settings').update({ blue_days: blueDays, red_days: redDays, updated_at: new Date().toISOString() }).eq('id', 1);
  if (error) throw error;
};

export const updateLiqudSection = async (id: string, values: Partial<Pick<LiqudStandSection, 'name' | 'row_count' | 'column_count'>>) => {
  const { error } = await supabase.from('liqud_stand_sections').update({ ...values, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
};

export const createLiqudSection = async (name: string, sortOrder: number) => {
  const { error } = await supabase.from('liqud_stand_sections').insert({
    name: name.trim(),
    row_count: 4,
    column_count: 8,
    sort_order: sortOrder,
  });
  if (error) throw error;
};

export const deleteLiqudSection = async (id: string) => {
  const { error } = await supabase.from('liqud_stand_sections').delete().eq('id', id);
  if (error) throw error;
};

export const resizeLiqudSection = async (section: LiqudStandSection, rowCount: number, columnCount: number) => {
  if (rowCount < section.row_count) {
    const { error } = await supabase.from('liqud_stand_cells').delete().eq('section_id', section.id).gte('row_index', rowCount);
    if (error) throw error;
  }
  if (columnCount < section.column_count) {
    const { error } = await supabase.from('liqud_stand_cells').delete().eq('section_id', section.id).gte('column_index', columnCount);
    if (error) throw error;
  }
  await updateLiqudSection(section.id, { row_count: rowCount, column_count: columnCount });
};

export const deleteLiqudStandLine = async (
  section: LiqudStandSection,
  direction: 'row' | 'column',
  index: number,
) => {
  const indexColumn = direction === 'row' ? 'row_index' : 'column_index';
  const { error: deleteError } = await supabase
    .from('liqud_stand_cells')
    .delete()
    .eq('section_id', section.id)
    .eq(indexColumn, index);
  if (deleteError) throw deleteError;

  const count = direction === 'row' ? section.row_count : section.column_count;
  // 삭제한 줄 뒤의 좌표를 앞에서부터 한 칸씩 당기면 unique 충돌 없이 정렬됩니다.
  for (let current = index + 1; current < count; current += 1) {
    const { error } = await supabase
      .from('liqud_stand_cells')
      .update({ [indexColumn]: current - 1 })
      .eq('section_id', section.id)
      .eq(indexColumn, current);
    if (error) throw error;
  }

  await updateLiqudSection(section.id, direction === 'row'
    ? { row_count: section.row_count - 1 }
    : { column_count: section.column_count - 1 });
};

export const saveLiqudCell = async (values: { sectionId: string; rowIndex: number; columnIndex: number; itemName: string; secondaryItemName: string; consumableType: string; installedOn: string; note: string }) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('세션을 찾을 수 없습니다.');
  const { error } = await supabase.from('liqud_stand_cells').upsert({
    section_id: values.sectionId, row_index: values.rowIndex, column_index: values.columnIndex,
    item_name: values.itemName, secondary_item_name: values.secondaryItemName || null,
    consumable_type: values.consumableType || null,
    installed_on: values.installedOn || null, note: values.note.trim() || null,
    updated_by: session.user.id, updated_at: new Date().toISOString(),
  }, { onConflict: 'section_id,row_index,column_index' });
  if (error) throw error;
};

export const clearLiqudCell = async (sectionId: string, rowIndex: number, columnIndex: number) => {
  const { error } = await supabase.from('liqud_stand_cells').delete().eq('section_id', sectionId).eq('row_index', rowIndex).eq('column_index', columnIndex);
  if (error) throw error;
};

export const moveLiqudStandCell = async (
  source: { sectionId: string; row: number; column: number; cellId: string },
  target: { sectionId: string; row: number; column: number; cellId?: string },
) => {
  const temporaryRow = 1_000_000_000;
  const temporaryColumn = Math.floor(Math.random() * 1_000_000_000);

  const sourceToTemporary = await supabase
    .from('liqud_stand_cells')
    .update({ row_index: temporaryRow, column_index: temporaryColumn })
    .eq('id', source.cellId);
  if (sourceToTemporary.error) throw sourceToTemporary.error;

  if (target.cellId) {
    const targetToSource = await supabase
      .from('liqud_stand_cells')
      .update({
        section_id: source.sectionId,
        row_index: source.row,
        column_index: source.column,
      })
      .eq('id', target.cellId);
    if (targetToSource.error) {
      await supabase.from('liqud_stand_cells').update({
        row_index: source.row,
        column_index: source.column,
      }).eq('id', source.cellId);
      throw targetToSource.error;
    }
  }

  const sourceToTarget = await supabase
    .from('liqud_stand_cells')
    .update({
      section_id: target.sectionId,
      row_index: target.row,
      column_index: target.column,
    })
    .eq('id', source.cellId);

  if (sourceToTarget.error) {
    if (target.cellId) {
      await supabase.from('liqud_stand_cells').update({
        section_id: target.sectionId,
        row_index: target.row,
        column_index: target.column,
      }).eq('id', target.cellId);
    }
    await supabase.from('liqud_stand_cells').update({
      section_id: source.sectionId,
      row_index: source.row,
      column_index: source.column,
    }).eq('id', source.cellId);
    throw sourceToTarget.error;
  }
};
