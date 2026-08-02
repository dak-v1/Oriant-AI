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

/** The pool size every gate below is sized against. See `POOL_GATE` doc. */
export const DEFAULT_POOL_MAX = 5;

/* ═══════════════════════ The concurrency gate ═══════════════════════ */

/**
 * NEVER LET postgres.js QUEUE. This is not a tuning knob; it is a correctness
 * requirement, and it was found the hard way.
 *
 * Issuing more concurrent queries than the pool has connections WEDGES THE POOL
 * PERMANENTLY against the Supabase transaction pooler. Measured, with everything
 * else held constant:
 *
 *   max=5,  6 concurrent  → first batch answers, the SECOND never returns
 *   max=5,  6 concurrent, no transaction anywhere → same
 *   max=5, 12 concurrent  → the FIRST batch never returns
 *   max=6,  6 concurrent  → fine, indefinitely
 *   max=10, 6 concurrent  → fine, indefinitely
 *
 * The symptom is the worst kind: the query that overflows does not fail, and
 * neither does the batch that overflows it. Everything answers once, and then
 * the next caller hangs forever with no error, no timeout and nothing in the
 * log. `GET /api/runtime/agents` — six concurrent store reads on a pool of five
 * — answered on a cold server and hung on every request after it.
 *
 * The transaction is NOT the cause; the table above holds with plain SELECTs.
 * The cause is postgres.js's own queue: a query that has to wait for a
 * connection is attached to one in a state it does not recover from. So this
 * gate keeps the number of in-flight queries at or below `max`, which means
 * postgres.js is never asked to queue and never reaches that path.
 *
 * WHY HERE AND NOT "just raise max". Raising it moves the cliff rather than
 * removing it: the next route that fans out one call wider falls off the same
 * edge, with the same silent symptom, and nothing in the type system or the
 * test suite would say so. A gate makes any fan-out safe at any pool size —
 * 40 concurrent through a gate of 8 was measured clean over six rounds.
 *
 * Queueing HERE is safe in a way queueing inside postgres.js is not, because
 * this queue hands work to a driver that is idle by construction.
 */
export interface PoolGate {
  /** Runs `fn` once a connection slot is free. */
  run<T>(fn: () => Promise<T>): Promise<T>;
  /** In-flight count. Diagnostics only. */
  active(): number;
}

export function createPoolGate(limit: number): PoolGate {
  let active = 0;
  const waiting: Array<() => void> = [];

  const release = () => {
    active -= 1;
    const next = waiting.shift();
    if (next) next();
  };

  return {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      if (active >= limit) {
        await new Promise<void>((resolve) => waiting.push(resolve));
      }
      active += 1;
      try {
        return await fn();
      } finally {
        // `finally`, so a throwing query returns its slot. A leaked slot here
        // would reproduce by hand exactly the deadlock this gate prevents.
        release();
      }
    },
    active: () => active,
  };
}

/* ═══════════════════════ Process-wide handle ═══════════════════════ */

interface SqlGlobal {
  __oriantSql?: { key: string; sql: Sql; gate: PoolGate };
}

/**
 * One pool per connection string per process. Keyed so that changing
 * DATABASE_URL in dev replaces the pool rather than silently reusing the old one.
 */
export function getSql(connectionString: string): Sql {
  return getPool(connectionString).sql;
}

/**
 * The pool AND the gate that belongs to it. They are memoised together because
 * a gate sized against a different pool than the one it guards is no gate at
 * all — and because all three stores share one pool, so they must share one
 * gate or the limit is three times what it says.
 */
export function getPool(connectionString: string): { sql: Sql; gate: PoolGate } {
  const g = globalThis as unknown as SqlGlobal;
  if (g.__oriantSql && g.__oriantSql.key === connectionString) {
    return { sql: g.__oriantSql.sql, gate: g.__oriantSql.gate };
  }
  const sql = createSql({ connectionString });
  const gate = createPoolGate(DEFAULT_POOL_MAX);
  g.__oriantSql = { key: connectionString, sql, gate };
  return { sql, gate };
}

export async function closeSql(): Promise<void> {
  const g = globalThis as unknown as SqlGlobal;
  if (!g.__oriantSql) return;
  await g.__oriantSql.sql.end({ timeout: 5 });
  g.__oriantSql = undefined;
}
