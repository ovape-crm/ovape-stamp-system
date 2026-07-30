import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_KEY ?? '';

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

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
  await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
};

export default supabase;
