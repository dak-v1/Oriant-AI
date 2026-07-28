/**
 * lib/runtime/persist/atomic.ts — the four filesystem primitives every durable
 * store in this directory is built from (ROLE_C_PLAN M0 storage decision).
 *
 * A file store is only worth having if it is honest about crashes, because the
 * thing it exists to protect is a run that PAUSED and is waiting on a human.
 * That run may sit on disk for hours. If a deploy, a laptop lid or an OOM kill
 * lands halfway through a write, the file that comes back must be either the old
 * record or the new one — never half of each. A run whose `cursor` was truncated
 * mid-write is not a lost run; it is a run that resumes from the wrong step and
 * sends the customer a second email. Those are very different failures and only
 * one of them is survivable.
 *
 * Hence four primitives, each closing one hole:
 *
 *   writeFileAtomic     write to a temp file, fsync it, rename over the target.
 *                       rename() is atomic on POSIX and, via MoveFileEx with
 *                       MOVEFILE_REPLACE_EXISTING, on NTFS. A reader sees one
 *                       version or the other, and fsync-before-rename is what
 *                       stops the rename landing before the bytes do.
 *
 *   createFileExclusive create a file ONLY if it does not exist, complete and
 *                       in one step. This is the primitive behind every
 *                       write-once guarantee in the stores above: an idempotency
 *                       claim, an approval decision, a lock. It links a fully
 *                       written temp file into place rather than opening the
 *                       target with "wx" and writing afterwards, because "wx"
 *                       creates an EMPTY file first — a crash in that window
 *                       leaves a claim that exists but says nothing, and a
 *                       decision that exists but cannot be read.
 *
 *   acquireLock         a mutual exclusion that outlives the process, built on
 *                       createFileExclusive. Needed for exactly one operation:
 *                       SchedulerStore.claimNextJob, whose select and write are
 *                       separated by real I/O.
 *
 *   withKeyLock         in-process serialisation for read-modify-write
 *                       sequences. Cheaper than a lock file and sufficient
 *                       whenever the only concurrency is Node's own.
 *
 * DETERMINISM (M3 exit criterion, must not regress). Nothing here reads a clock
 * or a random source. Temp files are named from `process.pid` and a module
 * counter, and those names never reach a stored record. `acquireLock` compares
 * against the instant its CALLER passed in, so the staleness rule can never
 * disagree with the clock the worker is using.
 *
 * WHAT THIS IS NOT. It is not a database. There are no transactions across two
 * files, so a sequence like "write the run, then create the approval" can be
 * interrupted between the two. The executor is already built for that — it
 * persists the run BEFORE creating the approval precisely so the surviving
 * half-state is the harmless one. See STORAGE.md for the full list.
 */

import { promises as fs } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import path from "node:path";

/** Raised for a path or filename this store refuses to touch. */
export class StoragePathError extends Error {
  readonly code = "storage_path";

  constructor(message: string) {
    super(message);
    this.name = "StoragePathError";
  }
}

/* ═══════════════════════════ errno ═══════════════════════════ */

function errnoOf(err: unknown): string | null {
  if (typeof err !== "object" || err === null || !("code" in err)) return null;
  const code = (err as { code: unknown }).code;
  return typeof code === "string" ? code : null;
}

export function isErrno(err: unknown, code: string): boolean {
  return errnoOf(err) === code;
}

/**
 * Filesystems that cannot hard-link. Every one of these means "this volume does
 * not support the primitive", never "the caller did something wrong", so they
 * are the only errors `createFileExclusive` degrades on. EEXIST is handled
 * separately and is the whole point of the call.
 */
const LINK_UNSUPPORTED = new Set(["EPERM", "ENOSYS", "EOPNOTSUPP", "EXDEV", "EMLINK", "ENOTSUP"]);

/* ═══════════════════════════ Record names ═══════════════════════════ */

/**
 * Ids come from `createIdFactory()` and are tame, but they also come from a
 * plan authored elsewhere, and one of them becomes a path segment. A `..` or a
 * separator would let a record id decide where on the disk it is written.
 *
 * Allowed: letters, digits, and `. _ - @`, starting with a letter or digit.
 * `@` is permitted because packages are addressed `agentId@version`.
 */
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._@-]*$/;

/**
 * Windows treats these as device names WHATEVER the extension, so `CON.json`
 * never becomes a file. Checked rather than assumed away: this project is
 * developed on Windows, and an agent id is plan data.
 */
const RESERVED_NAMES = new Set([
  "con", "prn", "aux", "nul",
  "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9",
  "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
]);

/** Longest id this store will turn into a filename; most filesystems cap at 255. */
const MAX_ID_LENGTH = 180;

export function recordFileName(id: string, entity: string): string {
  if (typeof id !== "string" || id.length === 0) {
    throw new StoragePathError(`${entity}: a record id must be a non-empty string.`);
  }
  if (id.length > MAX_ID_LENGTH) {
    throw new StoragePathError(
      `${entity}: record id "${id.slice(0, 40)}…" is ${id.length} characters; the limit is ` +
        `${MAX_ID_LENGTH} because the id becomes a filename.`,
    );
  }
  if (!SAFE_ID.test(id) || id.includes("..")) {
    throw new StoragePathError(
      `${entity}: record id "${id}" contains characters this store will not put in a ` +
        `filename. Allowed: letters, digits, and . _ - @, starting with a letter or ` +
        `digit, and never "..". An id that can name a directory can name any ` +
        `directory.`,
    );
  }
  if (RESERVED_NAMES.has(id.toLowerCase())) {
    throw new StoragePathError(
      `${entity}: record id "${id}" is a reserved device name on Windows and cannot ` +
        `become a file there. Rename it in the plan.`,
    );
  }
  return `${id}.json`;
}

/* ═══════════════════════════ Writing ═══════════════════════════ */

let tempSequence = 0;

/** Unique per process and per call; never stored, never compared, never sorted. */
function tempPath(file: string): string {
  tempSequence += 1;
  return `${file}.${process.pid}.${tempSequence}.tmp`;
}

async function writeAndSync(file: string, text: string): Promise<void> {
  let handle: FileHandle | undefined;
  try {
    handle = await fs.open(file, "w");
    await handle.writeFile(text, "utf8");
    // The bytes, not just the page cache. Without this the rename below can be
    // durable before the content is, and the crash window reopens.
    await handle.sync();
  } finally {
    await handle?.close();
  }
}

/**
 * fsync the directory so the rename itself is durable, not just the file's
 * contents. Best effort on purpose: Windows refuses to open a directory as a
 * file at all, and several filesystems refuse to fsync one. On NTFS the rename
 * is journalled with the metadata transaction, so nothing is lost by skipping
 * it there; on ext4 with the default options the same is effectively true.
 * Swallowing the error is therefore a portability concession, not a correctness
 * one — and it is named here so nobody has to rediscover that.
 */
async function syncDirectory(dir: string): Promise<void> {
  let handle: FileHandle | undefined;
  try {
    handle = await fs.open(dir, "r");
    await handle.sync();
  } catch {
    /* see above */
  } finally {
    try {
      await handle?.close();
    } catch {
      /* the handle is already unusable; there is nothing to salvage */
    }
  }
}

/** Replace `file` with `text`, or leave the previous version entirely intact. */
export async function writeFileAtomic(file: string, text: string): Promise<void> {
  const dir = path.dirname(file);
  await fs.mkdir(dir, { recursive: true });
  const tmp = tempPath(file);
  try {
    await writeAndSync(tmp, text);
    await fs.rename(tmp, file);
  } catch (err) {
    await fs.rm(tmp, { force: true });
    throw err;
  }
  await syncDirectory(dir);
}

/**
 * Create `file` with `text` if and only if it does not already exist. Returns
 * false when it did — that "false" is the claim being refused, and it is the
 * single mechanism behind write-once decisions, idempotency claims and the
 * queue lock.
 *
 * The link-from-temp dance is what makes the created file COMPLETE at the
 * instant it becomes visible. `open(file, "wx")` is atomic about the creation
 * and says nothing about the content: a crash between the create and the write
 * leaves an empty file that every later reader treats as "already claimed" and
 * nobody can read. The fallback path does exactly that, and is only reached on
 * a volume with no hard links at all.
 */
export async function createFileExclusive(file: string, text: string): Promise<boolean> {
  const dir = path.dirname(file);
  await fs.mkdir(dir, { recursive: true });
  const tmp = tempPath(file);

  try {
    await writeAndSync(tmp, text);
    try {
      await fs.link(tmp, file);
    } catch (err) {
      if (isErrno(err, "EEXIST")) return false;
      if (!LINK_UNSUPPORTED.has(errnoOf(err) ?? "")) throw err;
      return await createExclusiveWithoutLink(file, text);
    }
    await syncDirectory(dir);
    return true;
  } finally {
    await fs.rm(tmp, { force: true });
  }
}

async function createExclusiveWithoutLink(file: string, text: string): Promise<boolean> {
  let handle: FileHandle | undefined;
  try {
    handle = await fs.open(file, "wx");
  } catch (err) {
    if (isErrno(err, "EEXIST")) return false;
    throw err;
  }
  try {
    await handle.writeFile(text, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await syncDirectory(path.dirname(file));
  return true;
}

/* ═══════════════════════════ Reading ═══════════════════════════ */

/** The file's text, or null when it does not exist. Any other error propagates. */
export async function readFileText(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, "utf8");
  } catch (err) {
    if (isErrno(err, "ENOENT")) return null;
    throw err;
  }
}

export async function pathExists(file: string): Promise<boolean> {
  try {
    await fs.stat(file);
    return true;
  } catch (err) {
    if (isErrno(err, "ENOENT")) return false;
    throw err;
  }
}

/**
 * Record ids in a directory, lexicographically sorted so a listing is
 * reproducible. Temp files are skipped because they do not end in `.json`, and
 * dot-files because nothing this store writes as a record starts with one.
 * A missing directory is an empty table, not an error: on a clean clone none of
 * them exist until the first write.
 */
export async function listRecordIds(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (isErrno(err, "ENOENT")) return [];
    throw err;
  }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".json") && !e.name.startsWith("."))
    .map((e) => e.name.slice(0, -".json".length))
    .sort();
}

export async function removeTree(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

/* ═══════════════════════ In-process serialisation ═══════════════════════ */

/**
 * Serialise work by key within this process, in the same shape as the
 * executor's resume queue: every call for a given key runs to completion before
 * the next one takes its first read.
 *
 * It closes the read-modify-write window that "does this record already exist?"
 * followed by a write would otherwise open. It does NOT close it across
 * processes — that is what `acquireLock` is for, and it is used only where two
 * processes racing is a real hazard rather than a theoretical one.
 */
const keyLocks = new Map<string, Promise<void>>();

export function withKeyLock<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = keyLocks.get(key) ?? Promise.resolve();
  const result = previous.then(work);
  // The chain must survive a rejected link, or one failed write would reject
  // every write queued behind it.
  const link = result.then(
    () => undefined,
    () => undefined,
  );
  keyLocks.set(key, link);
  void link.then(() => {
    if (keyLocks.get(key) === link) keyLocks.delete(key);
  });
  return result;
}

/* ═══════════════════════════ Cross-process lock ═══════════════════════════ */

export interface LockHandle {
  release(): Promise<void>;
}

export interface LockOptions {
  /**
   * How old a held lock must be before it is treated as abandoned. A worker
   * that crashes mid-claim leaves its lock behind and nothing else will ever
   * remove it, so the queue would wedge permanently without this.
   */
  staleAfterMs?: number;
  attempts?: number;
  retryMs?: number;
}

interface LockHolder {
  pid: number;
  acquiredAt: string;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Take `lockFile` exclusively, or throw after exhausting the retry budget.
 *
 * `now` is supplied by the caller rather than read here, for the same reason the
 * whole runtime injects its clock: the staleness rule must be expressed in the
 * caller's time, and a lock that consulted the wall clock could disagree with
 * the worker holding it.
 *
 * The staleness break is the one genuinely racy step in this file, and it is
 * bounded rather than eliminated: two workers can both decide the same
 * abandoned lock is stale and both remove it, and the second `link` then wins
 * on EEXIST while the first proceeds. The window only opens after a crash, and
 * only for the `staleAfterMs` boundary instant. Making it airtight needs a
 * lease token compared on release, which is more machinery than a queue with
 * one worker per process warrants — see STORAGE.md.
 */
export async function acquireLock(
  lockFile: string,
  now: Date,
  options: LockOptions = {},
): Promise<LockHandle> {
  const staleAfterMs = options.staleAfterMs ?? 30_000;
  const attempts = options.attempts ?? 80;
  const retryMs = options.retryMs ?? 25;

  const holder: LockHolder = { pid: process.pid, acquiredAt: now.toISOString() };
  const contents = `${JSON.stringify(holder, null, 2)}\n`;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (await createFileExclusive(lockFile, contents)) {
      return {
        release: async () => {
          await fs.rm(lockFile, { force: true });
        },
      };
    }
    if (await breakIfStale(lockFile, now, staleAfterMs)) continue;
    await delay(retryMs);
  }

  throw new Error(
    `Could not acquire ${lockFile} after ${attempts} attempts (~${attempts * retryMs}ms). ` +
      `Another worker is holding it, or one crashed while holding it less than ` +
      `${staleAfterMs}ms ago. Deleting that file by hand is safe once no worker is running.`,
  );
}

async function breakIfStale(lockFile: string, now: Date, staleAfterMs: number): Promise<boolean> {
  const text = await readFileText(lockFile);
  // Released between the failed create and this read — retry immediately.
  if (text === null) return true;

  let acquiredMs = Number.NaN;
  try {
    const parsed = JSON.parse(text) as Partial<LockHolder>;
    acquiredMs = Date.parse(String(parsed.acquiredAt));
  } catch {
    acquiredMs = Number.NaN;
  }

  // An unreadable holder record is a crash artefact from a build that predates
  // this format, or a truncated write on a filesystem without hard links. Either
  // way there is no timestamp to age it by, so it is treated as abandoned.
  const abandoned = Number.isNaN(acquiredMs) || now.getTime() - acquiredMs > staleAfterMs;
  if (!abandoned) return false;

  await fs.rm(lockFile, { force: true });
  return true;
}
