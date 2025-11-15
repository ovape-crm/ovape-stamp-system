import { LogCategoryEnumType } from '../_enums/enums';

export type LogActorUserInfo = {
  name: string;
  email: string;
};

export type LogBaseType = {
  id: string;
  admin_id: string;
  customer_id: string;
  action: string;
  note: string;
  created_at: string;
  category: LogCategoryEnumType['value'];
  users?: LogActorUserInfo;
  jsonb: Record<string, unknown>;
};

export type LogCustomerInfo = {
  name: string;
  phone: string;
};

// 고객 상세 페이지의 로그
export type CustomersLogsResType = LogBaseType[];

// 이력 페이지의 로그
export type LogsResType = LogBaseType & {
  customers: LogCustomerInfo;
};
