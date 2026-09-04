import type { Session } from "@supabase/supabase-js";

type AuthErrorLike = { message?: unknown } | Error | null | undefined;

type SessionAuth = {
  getSession: () => Promise<{
    data: { session: Session | null };
    error: AuthErrorLike;
  }>;
  refreshSession: (session: { refresh_token: string }) => Promise<{
    data: { session: Session | null };
    error: AuthErrorLike;
  }>;
};

type SessionStorage = Pick<Storage, "removeItem">;

export type RecoveredSession = {
  session: Session | null;
  recovered: boolean;
};

const REFRESH_MARGIN_MS = 60_000;

export const getAuthErrorMessage = (error: AuthErrorLike) =>
  error instanceof Error
    ? error.message
    : typeof error === "object" && error !== null && "message" in error
      ? String(error.message)
      : "";

export const isInvalidRefreshTokenError = (error: AuthErrorLike) => {
  const message = getAuthErrorMessage(error).toLowerCase();
  return (
    message.includes("invalid refresh token") ||
    message.includes("refresh token not found")
  );
};

export const removePersistedSession = (
  storage: SessionStorage | null,
  storageKey: string,
) => {
  if (!storage) return;
  storage.removeItem(storageKey);
  storage.removeItem(`${storageKey}-user`);
};

export const recoverSession = async ({
  auth,
  storage,
  storageKey,
  onInvalidSession,
  now = Date.now(),
}: {
  auth: SessionAuth;
  storage: SessionStorage | null;
  storageKey: string;
  onInvalidSession?: () => void;
  now?: number;
}): Promise<RecoveredSession> => {
  const current = await auth.getSession();
  if (current.error) {
    if (!isInvalidRefreshTokenError(current.error)) throw current.error;
    removePersistedSession(storage, storageKey);
    onInvalidSession?.();
    return { session: null, recovered: true };
  }

  const session = current.data.session;
  if (!session) return { session: null, recovered: false };

  const expiresAt = session.expires_at
    ? session.expires_at * 1000
    : Number.POSITIVE_INFINITY;
  if (expiresAt - now > REFRESH_MARGIN_MS) {
    return { session, recovered: false };
  }

  const refreshed = await auth.refreshSession({
    refresh_token: session.refresh_token,
  });
  if (refreshed.error) {
    if (!isInvalidRefreshTokenError(refreshed.error)) throw refreshed.error;
    removePersistedSession(storage, storageKey);
    onInvalidSession?.();
    return { session: null, recovered: true };
  }

  return { session: refreshed.data.session, recovered: false };
};
