/**
 * lib/runtime/persist/codec.ts — how a paused run crosses JSON without being
 * quietly changed on the way (ROLE_C_PLAN M0 storage decision, the M4 blocker).
 *
 * Both in-memory stores clone with `structuredClone`, and both say why in the
 * same words: run context and trigger payloads legitimately hold Dates, Maps
 * and Sets, all of which JSON flattens or drops. A file-backed store has to
 * cross JSON to reach the disk, so it inherits that problem and cannot answer
 * it by looking away. `JSON.stringify(new Map([["a", 1]]))` is `{}`, and a run
 * resumed from `{}` is a run whose evidence disappeared while a human was
 * deciding what to do about it — which is the precise failure durable storage
 * was added to prevent.
 *
 * So this is a codec, not a serialiser, and it has exactly two rules:
 *
 *   1. WHAT IT KEEPS, IT KEEPS EXACTLY. Date, Map, Set, `undefined`, bigint and
 *      the numbers JSON cannot spell (NaN, ±Infinity, -0) are written as tagged
 *      objects and read back as themselves. A round trip through this module is
 *      value-identical to `structuredClone` for everything it accepts, so the
 *      file store and the in-memory store cannot disagree about what a stored
 *      run contains.
 *
 *   2. WHAT IT CANNOT KEEP, IT REFUSES. A class instance, a function, a symbol,
 *      a cycle — anything whose meaning would not survive the round trip throws
 *      at the WRITE, naming the exact path inside the record. The alternative is
 *      the one this codebase has already been bitten by: an unrecognised shape
 *      falling through into a path that treats it as harmless. Here that would
 *      mean a run persisted successfully, reloaded subtly wrong, and resumed
 *      against context nobody can reconstruct. A loud write failure is a bug
 *      report with a stack trace; a silent one is a support ticket six weeks
 *      later.
 *
 * The tag key is `$type`, and a plain object that happens to carry its own
 * `$type` key is wrapped rather than mistaken for a tagged value — see the
 * escape at the bottom of `encodeValue`. Without that, a tool result shaped
 * `{ $type: "invoice" }` would decode as an unrecognised tag and take the whole
 * run down on read.
 *
 * Every stored file is an envelope — `{ schema, entity, record }` — so a reader
 * can tell a v1 file from a v2 one and a run file from an approval file that
 * landed in the wrong directory. Both are checked on read; neither is guessed at.
 */

/** Bumped when the on-disk shape changes. Readers refuse versions they predate. */
export const SCHEMA_VERSION = 1;

/** The reserved key that marks a tagged value. */
const TAG = "$type";

/**
 * Raised for anything this codec cannot faithfully write or read. Separate from
 * a plain Error because the caller's response differs: a codec failure is a
 * defect in the record being stored, not a transient I/O problem to retry.
 */
export class StorageCodecError extends Error {
  readonly code = "storage_codec";

  constructor(message: string) {
    super(message);
    this.name = "StorageCodecError";
  }
}

/* ═══════════════════════════ Encoding ═══════════════════════════ */

function tagged(kind: string, value: unknown): Record<string, unknown> {
  return { [TAG]: kind, value };
}

/**
 * JSON has one number type and no way to write three of the values a JavaScript
 * number can hold. `JSON.stringify(NaN)` is `null`, and a `null` where a metric
 * used to be is exactly the kind of missing value policy.ts fails closed on —
 * except it would be failing closed on data corruption rather than on anything
 * the agent did.
 */
function encodeNumber(value: number): unknown {
  if (Object.is(value, -0)) return tagged("number", "-0");
  if (Number.isFinite(value)) return value;
  if (Number.isNaN(value)) return tagged("number", "NaN");
  return tagged("number", value > 0 ? "Infinity" : "-Infinity");
}

function describeConstructor(value: object): string {
  const name = Object.getPrototypeOf(value)?.constructor?.name;
  return typeof name === "string" && name.length > 0 ? name : "an object with a custom prototype";
}

function encodeValue(value: unknown, path: string, ancestors: Set<object>): unknown {
  if (value === null) return null;
  if (typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") return encodeNumber(value);
  if (typeof value === "bigint") return tagged("bigint", value.toString());
  if (typeof value === "undefined") return { [TAG]: "undefined" };

  if (typeof value === "function" || typeof value === "symbol") {
    throw new StorageCodecError(
      `Cannot persist a ${typeof value} at ${path}. Stored records must be data; ` +
        `behaviour belongs in the module that reads them. structuredClone refuses ` +
        `this too, so an in-memory run carrying it would already be broken.`,
    );
  }

  const object = value as object;

  // structuredClone preserves cycles; JSON cannot express them at all. Refusing
  // is the only honest option — a truncated cycle is a record that reads back as
  // a different shape than it was written from.
  if (ancestors.has(object)) {
    throw new StorageCodecError(
      `Cannot persist a circular reference at ${path}. JSON has no way to express ` +
        `one, so the record is refused at the write rather than silently truncated ` +
        `on the way to disk.`,
    );
  }
  ancestors.add(object);

  try {
    if (Array.isArray(object)) {
      return object.map((item, index) => encodeValue(item, `${path}[${index}]`, ancestors));
    }

    if (object instanceof Date) {
      if (!Number.isFinite(object.getTime())) {
        throw new StorageCodecError(
          `Cannot persist an Invalid Date at ${path}. It has no ISO 8601 form, and ` +
            `writing it as null would turn "the clock produced nonsense" into ` +
            `"the field was never set".`,
        );
      }
      return tagged("date", object.toISOString());
    }

    if (object instanceof Map) {
      const entries = [...object.entries()].map(([key, item], index) => [
        encodeValue(key, `${path}<map key ${index}>`, ancestors),
        encodeValue(item, `${path}<map value ${index}>`, ancestors),
      ]);
      return tagged("map", entries);
    }

    if (object instanceof Set) {
      const members = [...object.values()].map((item, index) =>
        encodeValue(item, `${path}<set member ${index}>`, ancestors),
      );
      return tagged("set", members);
    }

    const prototype = Object.getPrototypeOf(object) as object | null;
    if (prototype !== Object.prototype && prototype !== null) {
      throw new StorageCodecError(
        `Cannot persist ${describeConstructor(object)} at ${path}. Only plain objects, ` +
          `arrays, Dates, Maps and Sets round-trip through this store; a class instance ` +
          `would come back as a bare object with its prototype gone, and the first ` +
          `method call on it after a restart would fail somewhere far away from here.`,
      );
    }

    const record = object as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record)) {
      out[key] = encodeValue(record[key], `${path}.${key}`, ancestors);
    }

    // The escape. A plain object carrying its own `$type` key is indistinguishable
    // from a tagged value once written, so it is wrapped in one.
    return TAG in out ? tagged("object", out) : out;
  } finally {
    ancestors.delete(object);
  }
}

/* ═══════════════════════════ Decoding ═══════════════════════════ */

function expectString(value: unknown, kind: string, path: string, file: string): string {
  if (typeof value !== "string") {
    throw new StorageCodecError(
      `${file}: the "${kind}" value at ${path} should be a string but is ${typeof value}. ` +
        `The file was not written by this codec, or was edited by hand.`,
    );
  }
  return value;
}

function expectArray(value: unknown, kind: string, path: string, file: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new StorageCodecError(
      `${file}: the "${kind}" value at ${path} should be an array but is ${typeof value}. ` +
        `The file was not written by this codec, or was edited by hand.`,
    );
  }
  return value;
}

function decodeNumber(raw: string, path: string, file: string): number {
  switch (raw) {
    case "NaN":
      return Number.NaN;
    case "Infinity":
      return Number.POSITIVE_INFINITY;
    case "-Infinity":
      return Number.NEGATIVE_INFINITY;
    case "-0":
      return -0;
    default:
      throw new StorageCodecError(
        `${file}: "${raw}" at ${path} is not one of the four numbers this codec tags ` +
          `(NaN, Infinity, -Infinity, -0). Ordinary numbers are written unwrapped.`,
      );
  }
}

function decodeValue(value: unknown, path: string, file: string): unknown {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string" ||
    typeof value === "number"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => decodeValue(item, `${path}[${index}]`, file));
  }

  if (typeof value !== "object") {
    // Unreachable from JSON.parse output, which only produces the types above.
    throw new StorageCodecError(
      `${file}: found ${typeof value} at ${path}, which JSON.parse cannot produce.`,
    );
  }

  const record = value as Record<string, unknown>;
  const kind = record[TAG];

  if (kind === undefined) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record)) {
      out[key] = decodeValue(record[key], `${path}.${key}`, file);
    }
    return out;
  }

  if (typeof kind !== "string") {
    throw new StorageCodecError(
      `${file}: the tag at ${path} is ${typeof kind}, not a string. ` +
        `A record written by this codec always tags with a string.`,
    );
  }

  switch (kind) {
    case "undefined":
      return undefined;

    case "number":
      return decodeNumber(expectString(record.value, kind, path, file), path, file);

    case "bigint": {
      const raw = expectString(record.value, kind, path, file);
      try {
        return BigInt(raw);
      } catch {
        throw new StorageCodecError(`${file}: "${raw}" at ${path} is not a valid bigint.`);
      }
    }

    case "date": {
      const raw = expectString(record.value, kind, path, file);
      const parsed = Date.parse(raw);
      if (Number.isNaN(parsed)) {
        throw new StorageCodecError(
          `${file}: "${raw}" at ${path} is not a parseable ISO 8601 instant.`,
        );
      }
      return new Date(parsed);
    }

    case "map": {
      const entries = expectArray(record.value, kind, path, file);
      const out = new Map<unknown, unknown>();
      entries.forEach((entry, index) => {
        if (!Array.isArray(entry) || entry.length !== 2) {
          throw new StorageCodecError(
            `${file}: map entry ${index} at ${path} is not a [key, value] pair.`,
          );
        }
        out.set(
          decodeValue(entry[0], `${path}<map key ${index}>`, file),
          decodeValue(entry[1], `${path}<map value ${index}>`, file),
        );
      });
      return out;
    }

    case "set": {
      const members = expectArray(record.value, kind, path, file);
      return new Set(
        members.map((member, index) =>
          decodeValue(member, `${path}<set member ${index}>`, file),
        ),
      );
    }

    case "object": {
      const inner = record.value;
      if (typeof inner !== "object" || inner === null || Array.isArray(inner)) {
        throw new StorageCodecError(
          `${file}: the escaped object at ${path} is not an object.`,
        );
      }
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(inner as Record<string, unknown>)) {
        out[key] = decodeValue((inner as Record<string, unknown>)[key], `${path}.${key}`, file);
      }
      return out;
    }

    default:
      // Fail closed. An unrecognised tag is a NEWER writer's format, not a value
      // to guess at, and guessing would hand the executor a record that looks
      // right and is not.
      throw new StorageCodecError(
        `${file}: unrecognised tag "${kind}" at ${path}. This build of the runtime ` +
          `writes schema ${SCHEMA_VERSION} and does not know how to read it. ` +
          `A newer build wrote this file, or it was edited by hand.`,
      );
  }
}

/* ═══════════════════════════ Envelope ═══════════════════════════ */

interface Envelope {
  schema: number;
  entity: string;
  record: unknown;
}

/**
 * Two spaces, not minified. These files exist partly so a developer can open
 * `data/runtime/runs/run_....json` mid-demo and read why an agent paused; that
 * is worth more than the bytes. Run files carry their whole event stream, so
 * the largest of them are tens of kilobytes — see STORAGE.md for where that
 * stops being acceptable.
 */
export function serialise(entity: string, record: unknown): string {
  const envelope: Envelope = {
    schema: SCHEMA_VERSION,
    entity,
    record: encodeValue(record, "<record>", new Set<object>()),
  };
  return `${JSON.stringify(envelope, null, 2)}\n`;
}

export function deserialise<T>(entity: string, text: string, file: string): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (err) {
    throw new StorageCodecError(
      `${file}: not valid JSON (${err instanceof Error ? err.message : String(err)}). ` +
        `Writes are atomic, so a half-written file should be impossible; suspect a ` +
        `hand edit or a disk that lied about fsync.`,
    );
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new StorageCodecError(`${file}: expected a record envelope, found ${typeof parsed}.`);
  }

  const envelope = parsed as Partial<Envelope>;

  if (envelope.schema !== SCHEMA_VERSION) {
    throw new StorageCodecError(
      `${file}: written at schema version ${String(envelope.schema)}, but this build ` +
        `reads version ${SCHEMA_VERSION}. Migrate the directory or point ` +
        `ORIANT_RUNTIME_DATA_DIR somewhere else; reading it anyway would resume runs ` +
        `from fields this build does not understand.`,
    );
  }

  if (envelope.entity !== entity) {
    throw new StorageCodecError(
      `${file}: holds a "${String(envelope.entity)}" record but was read as "${entity}". ` +
        `A file is in the wrong directory, or two entities collided on one id.`,
    );
  }

  return decodeValue(envelope.record, "<record>", file) as T;
}
