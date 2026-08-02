/**
 * scripts/db-check.mjs — can the runtime actually reach Supabase right now?
 *
 *   npm run db:check
 *
 * Postgres storage fails in a small number of specific ways, and none of them
 * produce an error that says what to do: a project URL pasted into
 * `DATABASE_URL`, an unreplaced `[YOUR-PASSWORD]`, the IPv6-only direct host on
 * a network without IPv6, or a pooled connection that dies the moment a
 * prepared statement is reused. This script walks them in order and prints the
 * sentence.
 *
 * It does a REAL round trip — migrate, insert, read back, delete — because
 * "the TCP connection opened" is not the same claim as "this database can store
 * a paused run", and the second is the one that matters.
 *
 * THE CONNECTION STRING IS NEVER PRINTED. Only its scheme, host class, port and
 * whether a password is present: enough to catch every mistake above, and
 * impossible to leak into a scrollback, a CI log or a screenshot.
 *
 * Exits non-zero when storage is unavailable, so CI can gate on it.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(import.meta.dirname, "..");

// `.env.local` first, then `.env`: loadEnvFile never overwrites an already-set
// variable, so the personal file must be read before the shared one.
for (const file of [".env.local", ".env"]) {
  const full = path.join(repoRoot, file);
  if (existsSync(full)) process.loadEnvFile(full);
}

const raw = (process.env.DATABASE_URL ?? "").trim();

function fail(headline, ...advice) {
  console.error(`\n  FAIL  ${headline}\n`);
  for (const line of advice) console.error(`        ${line}`);
  console.error("");
  process.exit(1);
}

/* ── 1. Is there anything to check? ── */
if (raw === "") {
  fail(
    "DATABASE_URL is not set.",
    "Postgres storage is opt-in. Either set DATABASE_URL, or leave",
    "ORIANT_RUNTIME_STORAGE unset to keep the default file store.",
  );
}

/* ── 2. Is it the right KIND of value? ── */
if (raw.startsWith("http://") || raw.startsWith("https://")) {
  fail(
    "DATABASE_URL is a Supabase project URL, not a database connection string.",
    "That value belongs in NEXT_PUBLIC_SUPABASE_URL.",
    "For DATABASE_URL: Supabase dashboard -> Connect -> Transaction pooler -> URI.",
    "It starts postgresql:// and ends /postgres.",
  );
}

if (!/^postgres(ql)?:\/\//.test(raw)) {
  fail(`DATABASE_URL does not start with postgresql:// (starts "${raw.slice(0, 10)}...").`);
}

if (raw.includes("[YOUR-PASSWORD]") || raw.includes("[YOUR_PASSWORD]")) {
  fail(
    "DATABASE_URL still contains the [YOUR-PASSWORD] placeholder.",
    "Replace it with the database password from Supabase -> Settings -> Database.",
  );
}

let url;
try {
  url = new URL(raw);
} catch {
  fail("DATABASE_URL is not a parseable URL.");
}

if (!url.password) {
  fail(
    "DATABASE_URL has no password component.",
    "Expected postgresql://postgres.<ref>:<password>@<host>:6543/postgres",
  );
}

const direct = /^db\..*\.supabase\.co$/.test(url.hostname);
const pooled = url.hostname.includes("pooler.supabase.com");

console.log("\n  Connection string");
console.log(`    scheme     : ${url.protocol.replace(":", "")}`);
console.log(`    host class : ${pooled ? "transaction pooler (recommended)" : direct ? "direct (IPv6-only)" : "other"}`);
console.log(`    port       : ${url.port || "(default)"}`);
console.log(`    database   : ${url.pathname.replace("/", "") || "(none)"}`);
console.log(`    password   : present (${url.password.length} chars)`);

if (direct) {
  console.log(
    "\n  NOTE  The direct host is IPv6-only and holds one backend per client.\n" +
      "        Fine for a local one-off; use the Transaction pooler for anything deployed.",
  );
}

/* ── 3. The real round trip. ── */
let postgres;
try {
  postgres = require("postgres");
} catch {
  fail("The `postgres` package is not installed. Run `npm install`.");
}

const sql = postgres(raw, {
  prepare: false, // mandatory on the transaction pooler
  max: 1,
  connect_timeout: 15,
  ssl: "require",
  onnotice: () => {},
});

const PROBE = "oriant_db_check_probe";

try {
  console.log("\n  Round trip");

  const [version] = await sql`SELECT version() AS v`;
  const server = String(version?.v ?? "").split(" ").slice(0, 2).join(" ");
  console.log(`    connected  : ${server}`);

  await sql.unsafe(
    `CREATE TABLE IF NOT EXISTS ${PROBE} (id text PRIMARY KEY, at timestamptz NOT NULL, payload jsonb NOT NULL)`,
  );
  console.log("    create     : ok");

  const id = `probe-${process.pid}`;
  const payload = { note: "oriant db:check", nested: { ok: true } };
  await sql`
    INSERT INTO ${sql(PROBE)} (id, at, payload)
    VALUES (${id}, ${new Date()}, ${sql.json(payload)})
    ON CONFLICT (id) DO UPDATE SET at = EXCLUDED.at, payload = EXCLUDED.payload`;
  console.log("    write      : ok");

  const [row] = await sql`SELECT id, payload FROM ${sql(PROBE)} WHERE id = ${id}`;
  const readBack = row?.payload?.nested?.ok === true;
  console.log(`    read back  : ${readBack ? "ok (jsonb round-tripped)" : "MISMATCH"}`);
  if (!readBack) throw new Error("jsonb did not survive the round trip");

  // The constraint the whole design leans on: a second insert of the same key
  // must be refused, not silently applied. This is the idempotency guarantee.
  const conflict = await sql`
    INSERT INTO ${sql(PROBE)} (id, at, payload)
    VALUES (${id}, ${new Date()}, ${sql.json(payload)})
    ON CONFLICT DO NOTHING
    RETURNING id`;
  console.log(
    `    conflict   : ${conflict.length === 0 ? "ok (duplicate refused)" : "NOT REFUSED"}`,
  );
  if (conflict.length !== 0) throw new Error("ON CONFLICT DO NOTHING inserted a duplicate");

  await sql.unsafe(`DROP TABLE IF EXISTS ${PROBE}`);
  console.log("    cleanup    : ok");

  console.log("\n  PASS  Supabase is reachable and behaves correctly.");
  console.log("        Run with: ORIANT_RUNTIME_STORAGE=postgres npm run dev\n");
  await sql.end({ timeout: 5 });
  process.exit(0);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  try {
    await sql.unsafe(`DROP TABLE IF EXISTS ${PROBE}`);
  } catch {}
  await sql.end({ timeout: 5 }).catch(() => {});

  const advice = [];
  // Checked BEFORE the ENOTFOUND branch below, and deliberately so. Supabase's
  // pooler reports an unknown tenant with an ENOTFOUND-shaped error even though
  // the host resolved and the TCP connection succeeded, so matching on the code
  // alone sends you to look at DNS for a problem that is not there.
  if (/tenant|Tenant or user not found/i.test(message)) {
    advice.push(
      "The host resolved and answered — it is the POOLER rejecting this project,",
      "not a DNS failure. Almost always the wrong pooler hostname:",
      "",
      "  - the aws-N prefix. Projects sit on aws-0 OR aws-1 and the two are not",
      "    interchangeable; copying an example from the docs gets this wrong.",
      "  - the region. It must match the project's own region exactly.",
      "",
      "Copy the URI from Supabase → Connect → Transaction pooler rather than",
      "editing an existing one, since that page always names the right host.",
    );
  } else if (/ENOTFOUND|EAI_AGAIN/.test(message)) {
    advice.push("The host did not resolve. Check the project reference in the URI.");
  } else if (/ENETUNREACH|EHOSTUNREACH/.test(message)) {
    advice.push(
      "The host is unreachable. The direct Supabase host is IPv6-only;",
      "switch to the Transaction pooler URI (...pooler.supabase.com:6543).",
    );
  } else if (/password authentication failed|SASL/i.test(message)) {
    advice.push(
      "Authentication failed. Reset the database password under",
      "Supabase -> Settings -> Database, then paste the whole URI again.",
    );
  } else if (/prepared statement/i.test(message)) {
    advice.push(
      "A prepared statement was reused across a pooled connection.",
      "The driver must be created with prepare: false.",
    );
  } else if (/timeout/i.test(message)) {
    advice.push("Timed out. Check the project is not paused in the Supabase dashboard.");
  }

  fail(message, ...advice);
}
