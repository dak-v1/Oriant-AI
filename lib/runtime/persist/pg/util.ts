/**
 * lib/runtime/persist/pg/util.ts — the bridge between the storage codec and
 * `jsonb`, plus the ordering helpers every store shares.
 *
 * WHY THE CODEC STILL APPLIES. `jsonb` is JSON: it has no Date, no Map, no Set,
 * no `undefined` and cannot spell NaN or ±Infinity. Exactly the problem
 * persist/codec.ts was written for, so the same tagged encoding travels into
 * Postgres rather than being replaced by it. A run written by the file store and
 * a run written by this one decode to the same object, which is what makes
 * `ORIANT_RUNTIME_STORAGE` a real switch rather than a fork.
 *
 * The two functions below are the ONLY place the encoding is applied on this
 * path. Three stores hand-rolling it would be three chances to disagree about
 * whether a column holds tagged or raw JSON, and the disagreement would surface
 * as a run that reloads subtly wrong.
 */

import { deserialise, serialise } from "../codec";

/**
 * Record → a plain JSON-safe object ready for a `jsonb` column.
 *
 * Round-tripping through the codec's string is deliberate: `serialise` is what
 * refuses the shapes that cannot survive (class instances, functions, cycles),
 * and it refuses them at the WRITE, naming the path. Encoding straight to an
 * object would skip that check and let an unstorable value reach the database.
 */
export function toJsonb(entity: string, record: unknown): unknown {
  return JSON.parse(serialise(entity, record));
}

/**
 * A `jsonb` column → the record it encodes.
 *
 * postgres.js already parsed the column into a JS value, so this re-stringifies
 * to hand `deserialise` the text form it validates. `where` travels only into
 * the error message, so a decode failure names the row rather than the module.
 */
export function fromJsonb<T>(entity: string, value: unknown, where: string): T {
  return deserialise<T>(entity, JSON.stringify(value), where);
}

/* ═══════════════════════════ Dates ═══════════════════════════ */

/**
 * `timestamptz` columns come back as Date; the runtime's types are ISO strings.
 * A null column stays null so an unfinished run keeps `endedAt: null` rather
 * than acquiring an epoch timestamp.
 */
export function isoFrom(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

/** Same, for the columns the runtime types as non-nullable. */
export function isoRequired(value: Date | string, where: string): string {
  const iso = isoFrom(value);
  if (iso === null) {
    throw new Error(`Expected a timestamp at ${where}, found null.`);
  }
  return iso;
}

/* ═══════════════════════════ Ordering ═══════════════════════════ */

/**
 * Listing order is DERIVED, never recorded — the same rule the file store
 * follows (STORAGE.md §6.4). Sort on an immutable field with the id as
 * tie-break, so two records stamped by the same fixed clock still resolve
 * identically on every read and in both implementations.
 *
 * SQL does the sorting via the indexes in schema.ts; this exists for the few
 * places a list is assembled in memory.
 */
export function byThenId<T>(
  items: T[],
  key: (item: T) => string,
  id: (item: T) => string,
): T[] {
  return [...items].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka !== kb) return ka < kb ? -1 : 1;
    const ia = id(a);
    const ib = id(b);
    return ia < ib ? -1 : ia > ib ? 1 : 0;
  });
}
