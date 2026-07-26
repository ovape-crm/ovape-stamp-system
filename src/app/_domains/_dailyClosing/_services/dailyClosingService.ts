import supabase from '@/libs/supabaseClient';
import {
  DailyClosingChecklist,
  DailyClosingChecklistItem,
  DailyClosingChecklistPhase,
  DailyClosingReportSnapshot,
  DailyClosingReportRevision,
  DailyClosingReportType,
} from '../_types/dailyClosing.types';

export const getDailyClosingReport = async (
  businessDate: string,
): Promise<DailyClosingReportType | null> => {
  const { data, error } = await supabase
    .from('daily_closing_reports')
    .select('*')
    .eq('business_date', businessDate)
    .maybeSingle();

  if (error) throw error;
  return data as DailyClosingReportType | null;
};

export const getDailyClosingReportsByRange = async (
  startDate: string,
  endDate: string,
): Promise<DailyClosingReportType[]> => {
  const { data, error } = await supabase
    .from('daily_closing_reports')
    .select('*')
    .gte('business_date', startDate)
    .lte('business_date', endDate)
    .order('business_date', { ascending: false });

  if (error) throw error;
  return (data ?? []) as DailyClosingReportType[];
};

export const getDailyClosingReportRevisions = async (
  reportId: string,
): Promise<DailyClosingReportRevision[]> => {
  const { data, error } = await supabase
    .from('daily_closing_report_revisions')
    .select('*')
    .eq('report_id', reportId)
    .order('revision_number', { ascending: true });

  if (error) throw error;
  return (data ?? []) as DailyClosingReportRevision[];
};

export const reviseDailyClosingReport = async (values: {
  reportId: string;
  reportSnapshot: DailyClosingReportSnapshot;
  revisionReason: string;
}): Promise<void> => {
  const { error } = await supabase.rpc('revise_daily_closing_report', {
    p_report_id: values.reportId,
    p_report_snapshot: values.reportSnapshot,
    p_revision_reason: values.revisionReason.trim(),
  });
  if (error) throw error;
};

export const completeDailyClosingReport = async (values: {
  businessDate: string;
  openingChecklist: DailyClosingChecklist;
  closingChecklist: DailyClosingChecklist;
  cleaningNote: string;
  specialNote: string;
  totalSales: number;
  expectedCash: number;
  actualCash: number;
  reportSnapshot: DailyClosingReportSnapshot;
}): Promise<void> => {
  const { error } = await supabase.rpc('complete_daily_closing_report', {
    p_business_date: values.businessDate,
    p_opening_checklist: values.openingChecklist,
    p_closing_checklist: values.closingChecklist,
    p_cleaning_note: values.cleaningNote.trim(),
    p_special_note: values.specialNote.trim(),
    p_total_sales: values.totalSales,
    p_expected_cash: values.expectedCash,
    p_actual_cash: values.actualCash,
    p_report_snapshot: values.reportSnapshot,
  });

  if (error) throw error;
};

export const cancelDailyClosingReport = async (
  businessDate: string,
): Promise<void> => {
  const { error } = await supabase.rpc('cancel_daily_closing_report', {
    p_business_date: businessDate,
  });

  if (error) throw error;
};

export const getDailyClosingChecklistItems = async (): Promise<
  DailyClosingChecklistItem[]
> => {
  const { data, error } = await supabase
    .from('daily_closing_checklist_items')
    .select('id, phase, label, sort_order, is_required')
    .order('phase', { ascending: true })
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data ?? []) as DailyClosingChecklistItem[];
};

export const saveDailyClosingChecklistItems = async (
  items: {
    id?: string;
    phase: DailyClosingChecklistPhase;
    label: string;
    sortOrder: number;
    isRequired: boolean;
  }[],
): Promise<void> => {
  const { error: deleteError } = await supabase
    .from('daily_closing_checklist_items')
    .delete()
    .in('phase', ['opening', 'closing']);

  if (deleteError) throw deleteError;

  const normalized = items
    .filter((item) => item.label.trim())
    .map((item) => ({
      phase: item.phase,
      label: item.label.trim(),
      sort_order: item.sortOrder,
      is_required: item.isRequired,
    }));

  if (!normalized.length) return;
  const { error } = await supabase
    .from('daily_closing_checklist_items')
    .insert(normalized);

  if (error) throw error;
};
