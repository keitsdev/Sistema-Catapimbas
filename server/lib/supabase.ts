import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "../config/env.js";
import { HttpError } from "./http-error.js";

const authOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } } as const;
let admin: SupabaseClient | undefined;

export function getAdminSupabase(): SupabaseClient {
  const env = getEnv();
  if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new HttpError(500, "CONFIG_ERROR", "SUPABASE_SERVICE_ROLE_KEY não configurada");
  admin ??= createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, authOptions);
  return admin;
}

export function getPublicSupabase(): SupabaseClient {
  const env = getEnv();
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, authOptions);
}
