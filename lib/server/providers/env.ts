/**
 * Provider configuration. All keys live server-side only (never sent to the
 * browser). A provider with no key runs in "fixture" mode and is honestly
 * labeled as such in the provider trace and the UI.
 */

export interface ProviderEnv {
  aiand: { key?: string; baseUrl?: string; model: string };
  nosana: { key?: string; whisperUrl?: string };
  doubleword: { key?: string; baseUrl?: string; model: string };
  daytona: { key?: string; apiUrl: string };
  supabase: { url?: string; anonKey?: string; serviceRoleKey?: string };
}

export function providerEnv(): ProviderEnv {
  return {
    aiand: {
      key: process.env.AIAND_API_KEY || undefined,
      baseUrl: (process.env.AIAND_BASE_URL || "").replace(/\/$/, "") || undefined,
      model: process.env.AIAND_MODEL || "",
    },
    nosana: {
      key: process.env.NOSANA_API_KEY || undefined,
      whisperUrl: process.env.NOSANA_WHISPER_URL || undefined,
    },
    doubleword: {
      key: process.env.DOUBLEWORD_API_KEY || undefined,
      baseUrl: (process.env.DOUBLEWORD_BASE_URL || "").replace(/\/$/, "") || undefined,
      model: process.env.DOUBLEWORD_MODEL || "",
    },
    daytona: {
      key: process.env.DAYTONA_API_KEY || undefined,
      apiUrl: (process.env.DAYTONA_API_URL || "https://app.daytona.io/api").replace(/\/$/, ""),
    },
    supabase: {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL || undefined,
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || undefined,
    },
  };
}

export function aiandLive() { const e = providerEnv().aiand; return !!(e.key && e.baseUrl && e.model); }
export function nosanaLive() { const e = providerEnv().nosana; return !!e.whisperUrl; }
export function doublewordLive() { const e = providerEnv().doubleword; return !!(e.key && e.baseUrl && e.model); }
export function daytonaLive() { const e = providerEnv().daytona; return !!e.key; }
export function supabaseLive() { const e = providerEnv().supabase; return !!(e.url && (e.serviceRoleKey || e.anonKey)); }

/** Safe summary for the UI — booleans only, never key material. */
export function providerStatus() {
  return {
    aiand: aiandLive(), nosana: nosanaLive(),
    doubleword: doublewordLive(), daytona: daytonaLive(), supabase: supabaseLive(),
  };
}
