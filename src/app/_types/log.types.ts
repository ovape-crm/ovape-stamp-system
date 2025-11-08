export type CustomersLogsResType = {
  id: string;
  admin_id: string;
  customer_id: string;
  action: string;
  note: string;
  created_at: string;
  // 작업자 정보
  users: {
    name: string;
    email: string;
  };
}[];

export type LogsResType = {
  id: string;
  admin_id: string;
  customer_id: string;
  action: string;
  note: string;
  created_at: string;
  // 작업자 정보
  users: {
    name: string;
    email: string;
  };
  // 고객 정보
  customers: {
    name: string;
    phone: string;
  };
  jsonb: Record<string, unknown>;
};
