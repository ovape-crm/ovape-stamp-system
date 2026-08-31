import { LogCategoryEnumType } from "@/app/_enums/enums";

export type LogActorUserInfo = {
  name: string;
  email: string;
  oss_role?: "staff" | "admin" | "master";
};

export type LogBaseType = {
  id: string;
  admin_id: string;
  customer_id: string;
  action: string;
  note: string;
  created_at: string;
  updated_at: string;
  category: LogCategoryEnumType["value"];
  users?: LogActorUserInfo;
  jsonb: Record<string, unknown>;
};

export type LogWorkerSnapshot = {
  createdWorkerName?: string;
  reservationCreatedWorkerName?: string;
  reservationCreatedAt?: string;
  confirmedWorkerName?: string;
  confirmedAt?: string;
  modifiedWorkerName?: string;
  modifiedAt?: string;
  modificationHistory?: Array<{
    workerName: string;
    modifiedAt: string;
  }>;
};

export type AfterServiceLogType = LogBaseType & {
  after_service_id: number;
};

export type LogCustomerInfo = {
  name: string;
  phone: string;
  address?: string | null;
  note?: string | null;
  gender?: "male" | "female" | "special" | null;
  is_stamp_eligible?: boolean;
};

// 고객 상세 페이지의 로그
export type CustomersLogsResType = LogBaseType[];

// AS 상세 페이지의 로그
export type AfterServiceLogsResType = AfterServiceLogType[];

// 이력 페이지의 로그
export type LogsResType = LogBaseType & {
  customers: LogCustomerInfo;
};
