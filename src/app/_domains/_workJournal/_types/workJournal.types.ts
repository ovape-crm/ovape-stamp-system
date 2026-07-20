export type WorkJournalType = {
  id: string;
  work_date: string;
  worker_name: string;
  start_time: string;
  end_time: string;
  work_hours: number;
  note: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type WorkerDetailType = {
  id: string;
  name: string;
  is_active: boolean;
  phone_number: string;
  bank_account: string;
  first_work_date: string;
  note: string | null;
};
