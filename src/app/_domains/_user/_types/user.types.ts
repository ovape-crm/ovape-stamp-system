import type { OssRole } from "../_utils/userRole";

export type UserType = {
  id: string;
  name: string;
  email: string;
  oss_role: OssRole;
};
