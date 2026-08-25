import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_KEY ?? '';

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
const authStorageKey = `sb-${projectRef}-auth-token`;

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { storageKey: authStorageKey },
});

export const isInvalidRefreshTokenError = (error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String(error.message)
        : '';

  return (
    message.includes('Invalid Refresh Token') ||
    message.includes('Refresh Token Not Found')
  );
};

export const clearLocalSupabaseSession = async () => {
  // Remove the persisted token first. Calling signOut while an invalid refresh
  // token is still stored makes Supabase try that token again and emits the
  // AuthApiError that this recovery path is meant to handle.
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(authStorageKey);
  }

  await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
};

export default supabase;
