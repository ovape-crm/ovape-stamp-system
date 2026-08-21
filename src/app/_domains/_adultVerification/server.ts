import { createHash, randomBytes } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "@/libs/supabaseAdmin";

export const hashVerificationToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

// 144 bits of entropy keeps one-time links unguessable while making them easier to share.
export const createVerificationToken = () => randomBytes(18).toString("base64url");

export const getAuthenticatedStaff = async (authorization: string | null) => {
  const accessToken = authorization?.replace(/^Bearer\s+/i, "").trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_KEY;
  if (!accessToken || !url || !anonKey) return null;

  const authClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await authClient.auth.getUser(accessToken);
  if (error || !data.user) return null;

  const admin = createSupabaseAdmin();
  const { data: staff } = await admin
    .from("users")
    .select("id, name, oss_role")
    .eq("id", data.user.id)
    .in("oss_role", ["staff", "admin", "master"])
    .maybeSingle();

  return staff ?? null;
};

export const getRequestByToken = async (token: string) => {
  const admin = createSupabaseAdmin();
  const tokenHash = hashVerificationToken(token);
  const { data, error } = await admin
    .from("adult_verification_requests")
    .select("id, customer_id, status, expires_at, completed_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) throw error;
  return { request: data, tokenHash, admin };
};

export const isRequestExpired = (expiresAt: string) =>
  new Date(expiresAt).getTime() <= Date.now();
