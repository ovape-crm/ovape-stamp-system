export type DailyClosingChecklist = Record<string, boolean>;

export type DailyClosingChecklistPhase = 'opening' | 'closing';

export type DailyClosingChecklistItem = {
  id: string;
  phase: DailyClosingChecklistPhase;
  label: string;
  sort_order: number;
  is_required: boolean;
  is_opening_gate: boolean;
};

export type DailyClosingReportSnapshot = {
  version: 1;
  businessDate: string;
  workers: Array<{
    name: string;
    startTime: string;
    expectedEndTime: string;
    actualEndTime: string;
    actualWorkHours: number;
    inputWorkHours: number;
  }>;
  payments: Array<{
    paymentType: string;
    label: string;
    amount: number;
  }>;
  itemSummary: Array<{
    categoryName: string;
    quantity: number;
  }>;
  outboundTypeSummary?: Array<{
    type: string;
    label: string;
    quantity: number;
  }>;
  deliverySummary?: Array<{
    method: 'store_visit' | 'parcel' | 'delivery';
    label: string;
    orderCount: number;
    quantity: number;
    fee: number;
  }>;
  totalSales: number;
  expectedCash: number;
  actualCash: number;
  cashDifference: number;
  openingChecklist: Array<{
    id: string;
    label: string;
    isRequired: boolean;
    checked: boolean;
  }>;
  closingChecklist: Array<{
    id: string;
    label: string;
    isRequired: boolean;
    checked: boolean;
  }>;
  cleaningNote: string;
  specialNote: string;
  capturedAt: string;
};

export type DailyClosingReportType = {
  id: string;
  business_date: string;
  closer_worker_name: string;
  opening_checklist: DailyClosingChecklist;
  closing_checklist: DailyClosingChecklist;
  cleaning_note: string | null;
  special_note: string | null;
  total_sales: number;
  expected_cash: number;
  actual_cash: number;
  cash_difference: number;
  input_work_hours: number;
  report_snapshot: DailyClosingReportSnapshot | null;
  closed_work_journal: boolean;
  closed_at: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type DailyClosingReportRevision = {
  id: string;
  report_id: string;
  revision_number: number;
  report_snapshot: DailyClosingReportSnapshot;
  revision_reason: string;
  revised_by: string;
  revised_by_name: string;
  revised_at: string;
};
