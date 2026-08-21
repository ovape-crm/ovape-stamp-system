export type OssRole = "staff" | "admin" | "master";

export const MASTER_ACCOUNT_EMAIL = "master@ovape.com";

export const resolveOssRole = (
  email: string | null | undefined,
  storedRole: OssRole,
): OssRole =>
  storedRole === "master" || email?.trim().toLowerCase() === MASTER_ACCOUNT_EMAIL
    ? "master"
    : storedRole;

export const hasAdminAccess = (role: OssRole | null | undefined) =>
  role === "admin" || role === "master";
