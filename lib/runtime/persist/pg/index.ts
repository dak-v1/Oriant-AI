/**
 * lib/runtime/persist/pg/index.ts — the Postgres stores, assembled.
 *
 * The counterpart to `createFileStores`, and deliberately the same shape: three
 * stores over one connection, one place that knows they belong together, and no
 * environment read anywhere below `session.ts`.
 *
 * THE ORDERING PROBLEM THIS SOLVES. The schema has to exist before the first
 * query, but `createStores()` in session.ts is synchronous and every caller of
 * `getRuntimeSession()` expects it to stay that way. Making it async would push
 * an `await` into a dozen route handlers for a guarantee that belongs down here.
 *
 * So `migrate()` starts at construction and every store method awaits the same
 * memoised promise before it runs. `schemaGuarded` below is what applies that
 * uniformly: it wraps a store so each call is "await the schema, then delegate".
 * A cold start therefore cannot issue a query against a database whose tables
 * are still being created, and a warm one pays nothing after the first await of
 * an already-settled promise.
 *
 * A failed migration is remembered as a REJECTED promise, so the second request
 * fails with the original error rather than silently retrying into a half-built
 * schema and reporting something more confusing.
 */

import type { BuildStore } from "../../build/types";
import type { SchedulerStore } from "../../schedule/types";
import type { RunStore } from "../../types";
import { closeSql, getPool, type PoolGate, type Sql } from "./client";
import { PostgresBuildStore } from "./build-store";
import { PostgresRunStore } from "./run-store";
import { PostgresSchedulerStore } from "./scheduler-store";
import { dropAll, migrate, truncateAll } from "./schema";

export { PostgresRunStore } from "./run-store";
export { PostgresBuildStore } from "./build-store";
export { PostgresSchedulerStore } from "./scheduler-store";
export {
  PostgresConfigError,
  createSql,
  getSql,
  getPool,
  closeSql,
  createPoolGate,
  DEFAULT_POOL_MAX,
  type PoolGate,
} from "./client";
export { PG_SCHEMA_VERSION, migrate, dropAll, truncateAll } from "./schema";

export interface PostgresStores {
  runStore: RunStore;
  buildStore: BuildStore;
  schedulerStore: SchedulerStore;
  /** Resolves once the schema exists. Awaited implicitly by every method. */
  ready: Promise<void>;
  /** Deletes every row, keeping the schema. Development only. */
  reset(): Promise<void>;
  /** Drops every table. Development only. */
  dropSchema(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Returns a proxy over `store` whose every method awaits `ready` first.
 *
 * Generic rather than hand-written per store because the three interfaces have
 * thirty methods between them, and a hand-written wrapper is thirty chances to
 * forget one — where forgetting one means exactly the race this exists to close,
 * on whichever method happens to be called first on a cold start.
 */
function schemaGuarded<T extends object>(store: T, ready: Promise<void>, gate: PoolGate): T {
  return new Proxy(store, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) =>
        // The gate is INSIDE the ready.then, so waiting for the schema does not
        // hold a connection slot. Applied with `target` rather than `receiver`,
        // which also means a store method calling another method on `this`
        // bypasses the proxy — so nothing here can deadlock against itself by
        // asking for a second slot while holding the first.
        ready.then(() =>
          gate.run(async () => (value as (...a: unknown[]) => unknown).apply(target, args)),
        );
    },
  });
}

interface MigrationGlobal {
  __oriantMigration?: { key: string; ready: Promise<void> };
}

/**
 * The migration, once per connection per process.
 *
 * MEMOISED, and the reason is a real outage rather than tidiness. `migrate()`
 * issues about thirty `CREATE TABLE / CREATE INDEX IF NOT EXISTS` statements,
 * and in Postgres those take an ACCESS EXCLUSIVE lock even when the object
 * already exists and the statement does nothing. Run one while any transaction
 * holds a lock on the same table and the DDL queues behind it — and every
 * ordinary query then queues behind the DDL, because a waiting exclusive lock
 * blocks the readers behind it too.
 *
 * Calling `createPostgresStores` a second time therefore did not merely repeat
 * some cheap no-ops: it could wedge the entire connection while `ready` never
 * settled, and since every store method awaits `ready`, every route hung
 * indefinitely rather than failing. That is exactly what happened after an
 * activation — `/api/runtime/agents` stopped answering at all.
 *
 * Keyed on the connection string and cached on globalThis for the same reason
 * the pool is: Next's dev server re-evaluates modules on edit, and a fresh
 * migration per reload is precisely the repeat this exists to prevent.
 */
function migrationFor(connectionString: string, sql: Sql): Promise<void> {
  const g = globalThis as unknown as MigrationGlobal;
  if (g.__oriantMigration && g.__oriantMigration.key === connectionString) {
    return g.__oriantMigration.ready;
  }
  // A rejection is retained rather than retried: a second attempt against a
  // half-created schema reports a confusing secondary error instead of the one
  // that actually needs fixing.
  const ready = migrate(sql);
  // Awaited by every guarded call, but if the first request arrives after the
  // migration settles Node would already have reported an unhandled rejection.
  // This no-op handler keeps that quiet without swallowing it.
  void ready.catch(() => {});
  g.__oriantMigration = { key: connectionString, ready };
  return ready;
}

export function createPostgresStores(connectionString: string): PostgresStores {
  // One pool and ONE gate for all three stores: they share the connections, so
  // a gate per store would permit three times the limit it advertises.
  const { sql, gate } = getPool(connectionString);
  const ready = migrationFor(connectionString, sql);

  return {
    runStore: schemaGuarded(new PostgresRunStore(sql), ready, gate),
    buildStore: schemaGuarded(new PostgresBuildStore(sql), ready, gate),
    schedulerStore: schemaGuarded(new PostgresSchedulerStore(sql), ready, gate),
    ready,
    async reset() {
      await ready;
      await truncateAll(sql);
    },
    async dropSchema() {
      await ready;
      await dropAll(sql);
    },
    close: closeSql,
  };
}
