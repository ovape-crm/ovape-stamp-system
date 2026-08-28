export type WorkPaymentStatus = 'unpaid' | 'advance' | 'salary';
export type WorkType = 'solo' | 'shift';

export type WorkJournalType = {
  id: string;
  work_date: string;
  worker_name: string;
  start_time: string;
  end_time: string;
  expected_end_time?: string | null;
  work_hours: number;
  input_work_hours?: number | null;
  note: string | null;
  payment_status: WorkPaymentStatus;
  paid_at: string | null;
  paid_by: string | null;
  payroll_batch_id?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  work_type?: WorkType;
  status?: 'working' | 'handover_pending' | 'shift_completed' | 'closed';
};

export type WorkerDetailType = {
  id: string;
  name: string;
  is_active: boolean;
  is_payroll_eligible: boolean;
  phone_number: string;
  bank_account: string;
  first_work_date: string;
  note: string | null;
  has_pin: boolean;
  pin_code: string;
};
