import { createClient } from '@supabase/supabase-js';
import {
  isInvalidRefreshTokenError,
  recoverSession,
  removePersistedSession,
} from './authSessionRecovery';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_KEY ?? '';

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
const authStorageKey = `sb-${projectRef}-auth-token`;
export const AUTH_SESSION_EXPIRED_EVENT = 'ovape:auth-session-expired';

const supabase = createClient(supabaseUrl, supabaseKey, {
  // Supabase's automatic recovery logs a rejected refresh token before the
  // application can handle it. Refresh explicitly through getValidSession so
  // expected expiry/revocation is a quiet, deterministic recovery path.
  auth: { storageKey: authStorageKey, autoRefreshToken: false },
});

export { isInvalidRefreshTokenError };

export const clearLocalSupabaseSession = () => {
  removePersistedSession(
    typeof window === 'undefined' ? null : window.localStorage,
    authStorageKey,
  );
};

let sessionCheck: Promise<Awaited<ReturnType<typeof recoverSession>>> | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

const notifyInvalidSession = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTH_SESSION_EXPIRED_EVENT));
  }
};

const scheduleSessionRefresh = (expiresAt?: number) => {
  if (typeof window === 'undefined' || !expiresAt) return;
  if (refreshTimer) clearTimeout(refreshTimer);
  const delay = Math.max(expiresAt * 1000 - Date.now() - 60_000, 0);
  refreshTimer = setTimeout(() => {
    void getValidSession().catch((error) => {
      console.error('Session refresh failed:', error);
    });
  }, Math.min(delay, 2_147_483_647));
};

export const getValidSession = () => {
  if (!sessionCheck) {
    sessionCheck = recoverSession({
      auth: supabase.auth,
      storage: typeof window === 'undefined' ? null : window.localStorage,
      storageKey: authStorageKey,
      onInvalidSession: notifyInvalidSession,
    })
      .then((result) => {
        if (result.session) scheduleSessionRefresh(result.session.expires_at);
        return result;
      })
      .finally(() => {
        sessionCheck = null;
      });
  }
  return sessionCheck;
};

export default supabase;
