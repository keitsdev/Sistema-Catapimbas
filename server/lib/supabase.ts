import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "../config/env.js";
import { HttpError } from "./http-error.js";

const authOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } } as const;
let admin: SupabaseClient | undefined;

export function getAdminSupabase(): SupabaseClient {
  const env = getEnv();
  const secretKey = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secretKey) throw new HttpError(500, "CONFIG_ERROR", "SUPABASE_SECRET_KEY não configurada");
  admin ??= createClient(env.SUPABASE_URL, secretKey, authOptions);
  return admin;
}

export function getPublicSupabase(): SupabaseClient {
  const env = getEnv();
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_ANON_KEY;
  if (!publishableKey) throw new HttpError(500, "CONFIG_ERROR", "SUPABASE_PUBLISHABLE_KEY não configurada");
  return createClient(env.SUPABASE_URL, publishableKey, authOptions);
}
