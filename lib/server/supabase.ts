import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface SupabaseEnv {
  url?: string;
  anonKey?: string;
  serviceRoleKey?: string;
}

export function supabaseEnv(): SupabaseEnv {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || undefined,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || undefined,
  };
}

export function supabaseLive(): boolean {
  const env = supabaseEnv();
  return Boolean(env.url && (env.serviceRoleKey || env.anonKey));
}

let cachedAdmin: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient | null {
  if (cachedAdmin) return cachedAdmin;
  const env = supabaseEnv();
  if (!env.url || !env.serviceRoleKey) return null;
  cachedAdmin = createClient(env.url, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetch.bind(globalThis) },
  });
  return cachedAdmin;
}
