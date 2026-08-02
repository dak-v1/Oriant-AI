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
import { closeSql, getSql, type Sql } from "./client";
import { PostgresBuildStore } from "./build-store";
import { PostgresRunStore } from "./run-store";
import { PostgresSchedulerStore } from "./scheduler-store";
import { dropAll, migrate, truncateAll } from "./schema";

export { PostgresRunStore } from "./run-store";
export { PostgresBuildStore } from "./build-store";
export { PostgresSchedulerStore } from "./scheduler-store";
export { PostgresConfigError, createSql, getSql, closeSql } from "./client";
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
function schemaGuarded<T extends object>(store: T, ready: Promise<void>): T {
  return new Proxy(store, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) =>
        ready.then(() => (value as (...a: unknown[]) => unknown).apply(target, args));
    },
  });
}

export function createPostgresStores(connectionString: string): PostgresStores {
  const sql: Sql = getSql(connectionString);

  // Started here, awaited everywhere. A rejection is retained rather than
  // retried: a second attempt against a half-created schema reports a confusing
  // secondary error instead of the one that actually needs fixing.
  const ready = migrate(sql);
  // The promise is awaited by every guarded call, but if the very first request
  // arrives later than the migration settles, Node would have already reported
  // it as unhandled. This no-op handler keeps that quiet without swallowing it.
  void ready.catch(() => {});

  return {
    runStore: schemaGuarded(new PostgresRunStore(sql), ready),
    buildStore: schemaGuarded(new PostgresBuildStore(sql), ready),
    schedulerStore: schemaGuarded(new PostgresSchedulerStore(sql), ready),
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
