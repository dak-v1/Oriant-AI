/**
 * lib/runtime/persist/table.ts — one directory, one entity, one record per file.
 *
 * The three file-backed stores below this module have the same shape and would
 * otherwise repeat it three times: resolve a path, encode, write atomically,
 * read, decode, list. `Table` is that repetition, factored out once so a fix to
 * the read path is a fix everywhere rather than in two of three places.
 *
 * ONE RECORD PER FILE, rather than one JSON file per table. Two reasons, and
 * both are about the approval interrupt:
 *
 *   1. A write touches exactly the record it changes. A single `runs.json`
 *      rewritten on every step means every write re-serialises every run, and a
 *      lost write is every run rather than one.
 *   2. Write-once becomes a filesystem property instead of a convention. An
 *      approval decision and an idempotency claim are both "create this file if
 *      it does not exist", which `createFileExclusive` answers atomically. In a
 *      single-file table the same guarantee needs a lock held across a read and
 *      a write, and a lock is only as good as the code that remembers to take it.
 *
 * CLONING comes free and is worth naming, because `InMemoryRunStore` documents
 * it as load-bearing (lib/runtime/store.ts:9-21): a caller holding an alias of a
 * stored `RunState` could mutate the resume cursor after the fact. Here a write
 * encodes into a fresh JSON string and a read decodes into fresh objects, so no
 * caller can ever hold a reference to stored state. There is deliberately no
 * in-memory cache in front of these files — a cache would reintroduce exactly
 * the aliasing the in-memory store had to work to avoid, and it would make "the
 * file is the truth" false at the one moment it matters, which is the restart.
 *
 * NO ORDERING IS RECORDED. `listRecordIds` returns lexicographic order and the
 * stores above sort by an immutable timestamp field instead. That is a real
 * divergence from the in-memory stores' insertion order and it is written down
 * in STORAGE.md rather than papered over: what the runtime actually needs is a
 * TOTAL and STABLE order, and sorting on a field that never changes gives that,
 * where sorting on a mutable one (`runAfter`, `updatedAt`) would reshuffle a
 * list between two reads of a table nobody touched.
 */

import path from "node:path";
import {
  createFileExclusive,
  isErrno,
  listRecordIds,
  pathExists,
  readFileText,
  recordFileName,
  removeTree,
  withKeyLock,
  writeFileAtomic,
} from "./atomic";
import { deserialise, serialise } from "./codec";

export class Table<T> {
  /**
   * @param dir     absolute directory holding this entity's records
   * @param entity  the schema name written into every envelope, and the label
   *                that appears in this table's errors
   */
  constructor(
    readonly dir: string,
    readonly entity: string,
  ) {}

  /** Validated on every call: an id that can name a directory can name any. */
  private path(id: string): string {
    return path.join(this.dir, recordFileName(id, this.entity));
  }

  /** A key unique to this record across every table, for `withKeyLock`. */
  private lockKey(id: string): string {
    return `${this.entity}:${id}`;
  }

  async read(id: string): Promise<T | null> {
    const file = this.path(id);
    const text = await readFileText(file);
    return text === null ? null : deserialise<T>(this.entity, text, file);
  }

  async exists(id: string): Promise<boolean> {
    return pathExists(this.path(id));
  }

  /** Upsert. */
  async write(id: string, record: T): Promise<void> {
    await writeFileAtomic(this.path(id), serialise(this.entity, record));
  }

  /** Insert if absent; false means a record with this id already exists. */
  async create(id: string, record: T): Promise<boolean> {
    return createFileExclusive(this.path(id), serialise(this.entity, record));
  }

  /** Update an existing record, or throw. Serialised per record within this process. */
  async update(id: string, record: T, hint: string): Promise<void> {
    await withKeyLock(this.lockKey(id), async () => {
      if (!(await this.exists(id))) {
        throw new Error(hint);
      }
      await this.write(id, record);
    });
  }

  async ids(): Promise<string[]> {
    return listRecordIds(this.dir);
  }

  /**
   * Every record in the table.
   *
   * A file that vanishes between the listing and the read is skipped: the only
   * thing that removes records is `reset()`, and a listing racing a reset should
   * report the table as it is now, not throw. A file that FAILS TO DECODE is not
   * skipped — it throws, because a corrupt run silently missing from the
   * Workspace is worse than a loud error naming the file.
   */
  async all(): Promise<T[]> {
    const ids = await this.ids();
    const out: T[] = [];
    for (const id of ids) {
      const file = this.path(id);
      let text: string | null;
      try {
        text = await readFileText(file);
      } catch (err) {
        if (isErrno(err, "ENOENT")) continue;
        throw err;
      }
      if (text === null) continue;
      out.push(deserialise<T>(this.entity, text, file));
    }
    return out;
  }

  /** Drops the whole table. Development only — see the stores' `reset()`. */
  async clear(): Promise<void> {
    await removeTree(this.dir);
  }
}

/* ═══════════════════════════ Ordering ═══════════════════════════ */

/**
 * Order two ISO 8601 instants, oldest first.
 *
 * An unparseable instant sorts before every readable one rather than comparing
 * equal to everything, which is the same reasoning as `compareByDueAt` in
 * lib/runtime/store.ts: a partial order that collapses to "equal" makes the sort
 * unstable, and an unstable sort makes a listing flicker between two reads of a
 * table nobody touched.
 */
export function compareInstant(leftAt: string, rightAt: string): number {
  const left = Date.parse(leftAt);
  const right = Date.parse(rightAt);
  const leftMs = Number.isNaN(left) ? Number.NEGATIVE_INFINITY : left;
  const rightMs = Number.isNaN(right) ? Number.NEGATIVE_INFINITY : right;
  if (leftMs === rightMs) return 0;
  return leftMs < rightMs ? -1 : 1;
}

export function compareId(leftId: string, rightId: string): number {
  if (leftId === rightId) return 0;
  return leftId < rightId ? -1 : 1;
}

/**
 * The ordering every list method here uses: an immutable instant, ties resolved
 * by id so the result is TOTAL. Two records stamped by the same fixed clock must
 * not swap places between reads, and `Array.prototype.sort` being stable is no
 * help when the input order comes from a directory listing.
 */
export function compareByInstant(
  leftAt: string,
  leftId: string,
  rightAt: string,
  rightId: string,
): number {
  return compareInstant(leftAt, rightAt) || compareId(leftId, rightId);
}
