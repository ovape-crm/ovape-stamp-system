export const CASH_DENOMINATIONS = [50000, 10000, 5000, 1000, 500, 100, 50, 10] as const;

export type CashCounts = Record<string, number>;

export type WorkShift = {
  id: string;
  startTime: string;
  endTime: string;
  workerName: string;
};

export type CashClosingType = {
  id: string;
  business_date: string;
  opening_cash: number;
  cash_in: number;
  cash_out: number;
  ovape_cash_sales: number;
  egu_cash_sales: number;
  expected_cash: number;
  actual_cash: number;
  cash_counts: CashCounts;
  work_shifts: WorkShift[];
  worker_name: string;
  note: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type DailyCashSales = {
  ovape: number;
  eguVape: number;
  total: number;
};
