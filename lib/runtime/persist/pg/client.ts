/**
 * lib/runtime/persist/pg/client.ts — the Postgres connection, and the two
 * Supabase-specific facts that decide how it must be opened.
 *
 * 1. THE POOLER, NOT THE DIRECT HOST. Supabase's direct connection
 *    (`db.<ref>.supabase.co:5432`) resolves to IPv6 only on current projects and
 *    holds one backend per client, which a serverless function multiplies until
 *    the project runs out. The transaction pooler
 *    (`...pooler.supabase.com:6543`) is IPv4 and multiplexes. This module warns
 *    when it sees the direct host rather than refusing it, because a direct
 *    connection is correct for a local one-off and wrong for a deployment, and
 *    only the operator knows which they are doing.
 *
 * 2. TRANSACTION POOLING FORBIDS PREPARED STATEMENTS. A pooled connection is
 *    handed to a different client between statements, so a statement prepared on
 *    one is not there for the next. postgres.js prepares by default, so
 *    `prepare: false` is mandatory here; without it the first query after a
 *    handover fails with "prepared statement does not exist", intermittently and
 *    only under load, which is the worst way to find out.
 *
 * NO MODULE-LEVEL CONNECTION. The client is created on demand and cached on
 * globalThis, the same shape `session.ts` uses, so Next's dev-server module
 * reloads do not leak a new pool on every edit.
 */

import postgres from "postgres";

export class PostgresConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PostgresConfigError";
  }
}

export type Sql = postgres.Sql<Record<string, never>>;

/**
 * Validates the shape a Supabase connection string must have, and produces an
 * error that says what to do rather than what went wrong. The commonest mistake
 * by a wide margin is pasting the project API URL (`https://<ref>.supabase.co`)
 * into `DATABASE_URL`, so that case is named explicitly.
 */
export function assertUsableConnectionString(raw: string): void {
  const value = raw.trim();

  if (value.length === 0) {
    throw new PostgresConfigError(
      "DATABASE_URL is empty, but ORIANT_RUNTIME_STORAGE is set to postgres. " +
        "Set DATABASE_URL to the Supabase connection string, or use " +
        'ORIANT_RUNTIME_STORAGE=file (the default) to run without a database.',
    );
  }

  if (value.startsWith("http://") || value.startsWith("https://")) {
    throw new PostgresConfigError(
      "DATABASE_URL looks like a Supabase project URL, not a database connection " +
        "string. The project URL belongs in NEXT_PUBLIC_SUPABASE_URL. For " +
        "DATABASE_URL, open the Supabase dashboard, click Connect, and copy the " +
        "Transaction pooler URI — it starts postgresql:// and ends /postgres.",
    );
  }

  if (!/^postgres(ql)?:\/\//.test(value)) {
    throw new PostgresConfigError(
      `DATABASE_URL must start with postgresql:// (got "${value.slice(0, 12)}...").`,
    );
  }

  if (value.includes("[YOUR-PASSWORD]") || value.includes("[YOUR_PASSWORD]")) {
    throw new PostgresConfigError(
      "DATABASE_URL still contains the [YOUR-PASSWORD] placeholder. Replace it " +
        "with the database password from Supabase → Settings → Database.",
    );
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PostgresConfigError("DATABASE_URL is not a parseable URL.");
  }

  if (!url.password) {
    throw new PostgresConfigError(
      "DATABASE_URL has no password. The Supabase URI is " +
        "postgresql://postgres.<ref>:<password>@<host>:6543/postgres.",
    );
  }
}

/** True for the direct (non-pooled) Supabase host, which is IPv6-only. */
export function isDirectSupabaseHost(connectionString: string): boolean {
  try {
    return /^db\..*\.supabase\.co$/.test(new URL(connectionString).hostname);
  } catch {
    return false;
  }
}

export interface PostgresClientOptions {
  connectionString: string;
  /** Kept low deliberately; serverless multiplies this by instance count. */
  max?: number;
  connectTimeoutSeconds?: number;
  /** Suppresses the direct-host advisory in tests. */
  quiet?: boolean;
}

export function createSql(options: PostgresClientOptions): Sql {
  const { connectionString } = options;
  assertUsableConnectionString(connectionString);

  if (!options.quiet && isDirectSupabaseHost(connectionString)) {
    console.warn(
      "[oriant] DATABASE_URL uses the direct Supabase host, which is IPv6-only " +
        "and one backend per client. Prefer the Transaction pooler URI " +
        "(...pooler.supabase.com:6543) for anything deployed.",
    );
  }

  return postgres(connectionString, {
    // Mandatory on the transaction pooler; harmless on a direct connection.
    prepare: false,
    max: options.max ?? 5,
    connect_timeout: options.connectTimeoutSeconds ?? 15,
    // Supabase terminates TLS but presents a certificate for the pooler domain
    // rather than the project host, so full verification fails on a correct
    // setup. Encrypted without chain verification is what the platform expects.
    ssl: "require",
    // The codec already produced plain JSON-safe values; postgres.js must not
    // reinterpret them on the way back.
    transform: { undefined: null },
    onnotice: () => {},
  }) as Sql;
}

/* ═══════════════════════ Process-wide handle ═══════════════════════ */

interface SqlGlobal {
  __oriantSql?: { key: string; sql: Sql };
}

/**
 * One pool per connection string per process. Keyed so that changing
 * DATABASE_URL in dev replaces the pool rather than silently reusing the old one.
 */
export function getSql(connectionString: string): Sql {
  const g = globalThis as unknown as SqlGlobal;
  if (g.__oriantSql && g.__oriantSql.key === connectionString) {
    return g.__oriantSql.sql;
  }
  const sql = createSql({ connectionString });
  g.__oriantSql = { key: connectionString, sql };
  return sql;
}

export async function closeSql(): Promise<void> {
  const g = globalThis as unknown as SqlGlobal;
  if (!g.__oriantSql) return;
  await g.__oriantSql.sql.end({ timeout: 5 });
  g.__oriantSql = undefined;
}
