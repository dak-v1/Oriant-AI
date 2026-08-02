/**
 * lib/runtime/tools/schema.ts — the tool's OWN argument vocabulary.
 *
 * THE FAILURE THIS EXISTS TO REMOVE. The runtime speaks `gmail.messages.send`
 * and a reason step produces `{ to, subject, body }`, because that is what the
 * word "email" means in English. Composio's GMAIL_SEND_EMAIL wants
 * `recipient_email`. Until this file existed, `ComposioIntegrationProvider`
 * forwarded whatever the model produced verbatim, so the FIRST REAL SEND this
 * system ever attempted failed on shape — and the near miss was worse than the
 * miss: a name the tool does not know is not an error at Composio, it is a field
 * that quietly does not arrive. A `cc` nobody receives, a `body` that sends an
 * empty email.
 *
 * WHAT WAS REJECTED, AND WHY IT KEEPS BEING REJECTED. The obvious fix is a
 * hand-written table — `gmail.messages.send: { to -> recipient_email }`. That is
 * a second guess laid over the first: it encodes, in this repository, a shape
 * that lives on Composio's side and moves with toolkit versions. It is wrong
 * SILENTLY when it drifts (a dropped field, a renamed one), it has to be written
 * again for every capability, and a new Composio tool arrives with no entry and
 * no way to know one is missing. lib/runtime/tools/capabilities.ts already
 * carries the argument in full and had already named the honest seam: the tool's
 * own JSON schema, fed to the model, so the arguments are produced in the tool's
 * vocabulary IN THE FIRST PLACE rather than translated after the fact. That is
 * what this file is. It generalises: a Composio tool this runtime has never
 * heard of works with no code change, because the schema comes from the catalog
 * and not from us.
 *
 * TWO USES, ONE SOURCE. The same parsed schema does both halves, which is what
 * makes them agree:
 *
 *   PRODUCE — `renderSchemaForPrompt` turns it into the block the executor
 *             appends to a `reason` step's workflow prompt. The model is told
 *             the names before it invents any.
 *   ENFORCE — `checkArgumentsAgainstSchema` is run by the provider immediately
 *             before `tools.execute`. The prompt is guidance and a model may
 *             ignore guidance; this is the gate, and it fails closed.
 *
 * The gate is not redundant with the prompt. A model that was told the names and
 * used its own would otherwise reach Composio, and half the wrong shapes reach
 * Composio SUCCESSFULLY — with the unknown fields dropped.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT DO: BE A JSON SCHEMA VALIDATOR. It reads
 * the four facts that decide whether a call is even the right shape — which
 * names exist, which are required, what primitive type each holds, and whether
 * unlisted names are allowed — and it says so. It does not resolve `$ref`,
 * `$defs`, `allOf` or nested object schemas, and it does not check formats,
 * lengths or patterns. It reads `anyOf`/`oneOf` for ONE thing only — the type
 * names the branches agree on, when the property declares no `type` of its own,
 * which is how Composio really publishes "an object or a list of them"
 * (`readUnionTypes`). Everything else it cannot judge it PASSES, and Composio
 * judges it instead, which is the correct division: Composio's rejection is
 * authoritative and arrives with the tool's own words. What this file catches is
 * the class of mistake Composio does NOT reject — a plausible argument list in the
 * wrong vocabulary.
 *
 * PROVED AGAINST THE REAL CATALOG, NOT AGAINST ITS AUTHOR. Every schema this
 * parser was ever shown in a check used to be a literal somebody wrote to match
 * what they believed Composio returns, which proves only that the parser and the
 * author agree. lib/runtime/tools/catalog-recording.ts is the actual HTTP
 * response for every mapped slug, and lib/runtime/verify/tools.ts serves that
 * through the fake SDK. It found four disagreements the day it was taken — the
 * endpoint, an absent `required` on GMAIL_SEND_EMAIL, SLACK_SEND_MESSAGE having no
 * `text`, and two mapped slugs that 404 — and its header lists them.
 *
 * NO NETWORK AND NO SDK HERE. Fetching is the provider's job (composio.ts) and
 * caching is schema-cache.ts's; this module is pure so that both the prompt text
 * and the refusal text are testable without credentials, which is what keeps
 * lib/runtime/verify/tools.ts in the default sweep.
 */

/* ═══════════════════════════ The schema ═══════════════════════════ */

/** One argument the tool accepts. `types` empty means the schema constrained
    nothing, which this file treats as "anything goes" rather than guessing. */
export interface ToolInputProperty {
  readonly name: string;
  /** JSON Schema type names, lower-cased. Usually one; a union is kept whole. */
  readonly types: readonly string[];
  readonly description: string | null;
  /** Present only for a closed set of primitives; null when unconstrained. */
  readonly enumValues: readonly (string | number | boolean)[] | null;
  readonly required: boolean;
}

/**
 * A Composio tool's `inputParameters`, narrowed to what a decision here can rest
 * on. Held as a Map rather than a record because `noUncheckedIndexedAccess` is
 * off in this repo's tsconfig — `record[missing]` is typed `string` while being
 * `undefined` at run time, which is precisely the bug class this file is about.
 */
export interface ToolInputSchema {
  readonly properties: ReadonlyMap<string, ToolInputProperty>;
  readonly required: readonly string[];
  /**
   * Whether a name the schema does not list may still be sent.
   *
   * DEFAULTS TO FALSE, i.e. to refusing. JSON Schema's own default is the
   * opposite — an absent `additionalProperties` means "permitted" — and that
   * default is exactly wrong here. Composio does not pass an unlisted field on
   * to Gmail; it drops it. So "permitted" would mean "silently discarded", and
   * the whole point of this file is that a discarded argument must be a refusal
   * an owner can read rather than an email that went out without its body.
   */
  readonly additionalPropertiesAllowed: boolean;
}

/* ═══════════════════════════ Parsing ═══════════════════════════ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `Object.hasOwn` first, so a schema carrying a `constructor` or `toString`
    property cannot resolve to something off Object.prototype. */
function own(record: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

/**
 * The type names a union branch list agrees on, or NULL when it does not.
 *
 * ADDED AGAINST THE RECORDING, and it rejected a real argument list. GMAIL_SEND_
 * EMAIL and GMAIL_CREATE_EMAIL_DRAFT publish `attachment` with NO `type` at all —
 * only `anyOf: [{ type: "object", … }, { type: "array", … }]`
 * (./catalog-recording.ts). `readTypes` used to answer `[]` for that, `[]` means
 * "the schema constrained nothing", and so the gate accepted
 * `attachment: "invoice-2041.pdf"` — a string, and the single most likely thing a
 * model asked to attach a file will produce — and sent it. That is the permissive
 * direction on a live send.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It reads the branches' `type` keyword and
 * NOTHING else: no nested properties, no `$ref`, no `allOf`. `allOf` is an
 * INTERSECTION — a member's type is not the whole constraint — so reading it the
 * same way would be refusing values the tool accepts, which is worse than
 * passing ones it does not. And one branch with no readable type makes the whole
 * union unconstrained, so the answer is null and the caller passes: this may only
 * narrow "anything goes" into a fact the schema actually stated.
 */
function readUnionTypes(property: Record<string, unknown>): string[] | null {
  for (const keyword of ["anyOf", "oneOf"]) {
    const branches = own(property, keyword);
    if (!Array.isArray(branches) || branches.length === 0) continue;

    const collected: string[] = [];
    for (const branch of branches) {
      if (!isRecord(branch)) return null;
      const raw = own(branch, "type");
      if (typeof raw === "string") {
        collected.push(raw.toLowerCase());
        continue;
      }
      if (Array.isArray(raw)) {
        const names = raw.filter((entry): entry is string => typeof entry === "string");
        // A branch whose `type` array held something that was not a name is a
        // branch this build did not understand. Give up on the whole union.
        if (names.length !== raw.length || names.length === 0) return null;
        for (const name of names) collected.push(name.toLowerCase());
        continue;
      }
      return null;
    }
    return [...new Set(collected)];
  }
  return null;
}

function readTypes(property: Record<string, unknown>): string[] {
  const raw = own(property, "type");
  if (typeof raw === "string") return [raw.toLowerCase()];
  if (Array.isArray(raw)) {
    return raw.filter((entry): entry is string => typeof entry === "string").map((t) =>
      t.toLowerCase(),
    );
  }
  // `type` is absent. Composio's real catalog expresses "an object or a list of
  // them" as a bare `anyOf`, so ask the branches before giving up.
  return readUnionTypes(property) ?? [];
}

function readEnum(property: Record<string, unknown>): (string | number | boolean)[] | null {
  const raw = own(property, "enum");
  if (!Array.isArray(raw)) return null;
  const values = raw.filter(
    (entry): entry is string | number | boolean =>
      typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean",
  );
  // A partial enum would be worse than none: it would refuse a value the tool
  // accepts. Take the list only when every member is a primitive we can compare.
  return values.length === raw.length && values.length > 0 ? values : null;
}

function readDescription(property: Record<string, unknown>): string | null {
  const raw = own(property, "description");
  if (typeof raw !== "string") return null;
  const trimmed = raw.replace(/\s+/g, " ").trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Composio's `inputParameters` as this runtime is willing to read it, or NULL.
 *
 * Null is a refusal, not an empty schema, and the difference is the whole
 * fail-closed story. A tool that genuinely takes no arguments publishes
 * `{ type: "object", properties: {} }`; a tool whose `inputParameters` is
 * absent, malformed, or not an object schema published NOTHING WE UNDERSTAND,
 * and the caller must refuse rather than send an unchecked argument list and
 * call that a validated one.
 */
export function parseToolInputSchema(raw: unknown): ToolInputSchema | null {
  if (!isRecord(raw)) return null;

  const declaredType = own(raw, "type");
  // A non-object schema at the top level is not something an argument record can
  // satisfy at all. Composio publishes `"object"` for every tool; anything else
  // means this code is reading a shape it was not written against.
  if (typeof declaredType === "string" && declaredType.toLowerCase() !== "object") return null;

  const rawProperties = own(raw, "properties");
  if (!isRecord(rawProperties)) return null;

  const rawRequired = own(raw, "required");
  const required = Array.isArray(rawRequired)
    ? rawRequired.filter((entry): entry is string => typeof entry === "string")
    : [];
  const requiredSet = new Set(required);

  const properties = new Map<string, ToolInputProperty>();
  for (const [name, value] of Object.entries(rawProperties)) {
    const property = isRecord(value) ? value : {};
    properties.set(name, {
      name,
      types: readTypes(property),
      description: readDescription(property),
      enumValues: readEnum(property),
      required: requiredSet.has(name),
    });
  }

  // Only an explicit `true` opens the door. See `additionalPropertiesAllowed`.
  const additional = own(raw, "additionalProperties");

  return {
    properties,
    // Sorted so a prompt and a refusal built from the same schema read the same
    // way on every run — the sandbox's determinism requirement reaches here too.
    required: [...required].sort(),
    additionalPropertiesAllowed: additional === true,
  };
}

/**
 * A parsed catalog entry: the schema plus the tool's own one-liner.
 *
 * THE DESCRIPTION TRAVELS WITH THE SCHEMA rather than being read separately, and
 * that is not tidiness. Both come from one catalog response, and the response is
 * fetched once per process (./schema-cache.ts). Holding the description outside
 * the cache meant the FIRST prompt in a process carried it and every later one
 * did not — a prompt that changes depending on what else the process has already
 * done, which is precisely the kind of non-determinism the sandbox exists to rule
 * out.
 */
export interface ToolCatalogEntry {
  readonly schema: ToolInputSchema;
  /** Composio's own sentence about the tool, when it publishes one. */
  readonly description: string | null;
}

/* ═══════════════════════════ The prompt block ═══════════════════════════ */

/** Long enough to disambiguate two similar arguments, short enough that forty of
    them do not crowd out the run context in the same message. */
const DESCRIPTION_CHARS = 140;
/**
 * How many arguments are listed. Composio's larger tools publish dozens, and the
 * reasoner's context budget (24k characters in lib/runtime/llm.ts) is shared with
 * the run's own data. Required arguments are listed FIRST and are never dropped,
 * so truncation can only ever cost the model an optional field it did not have to
 * fill — and the omission is stated rather than hidden.
 */
const MAX_PROPERTIES = 40;

function describeTypes(property: ToolInputProperty): string {
  if (property.enumValues !== null) {
    return `one of ${property.enumValues.map((value) => JSON.stringify(value)).join(", ")}`;
  }
  return property.types.length === 0 ? "any" : property.types.join(" or ");
}

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`;
}

/**
 * The block the executor appends to a `reason` step's workflow prompt.
 *
 * WRITTEN AS AN INSTRUCTION, NOT AS DATA. An earlier draft handed the raw JSON
 * schema over in the run context, which is where the model already reads FACTS —
 * invoices, threads, what a fetch step returned. A schema left there reads as one
 * more thing to reason ABOUT rather than a rule to obey, and the run context is
 * exactly where a model is entitled to ignore something. It goes in the prompt,
 * in prose, naming the consequence of ignoring it.
 *
 * It names the capability AND the Composio slug because the two vocabularies are
 * both true and a person debugging a refusal needs the pair.
 */
export function renderSchemaForPrompt(input: {
  capability: string;
  toolSlug: string;
  schema: ToolInputSchema;
  /** Composio's own one-liner for the tool, when the catalog carries one. */
  toolDescription?: string | null;
}): string {
  const all = [...input.schema.properties.values()];
  // Required first, then alphabetical inside each group: a stable order, and one
  // that puts what the model MUST fill at the top where it will be read.
  const ordered = [...all].sort((a, b) => {
    if (a.required !== b.required) return a.required ? -1 : 1;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
  const shown = ordered.slice(0, MAX_PROPERTIES);
  const omitted = ordered.length - shown.length;

  const width = shown.reduce((max, property) => Math.max(max, property.name.length), 0);
  const lines = shown.map((property) => {
    const name = property.name.padEnd(width, " ");
    const flag = property.required ? "REQUIRED" : "optional";
    const detail = property.description === null
      ? ""
      : ` — ${truncate(property.description, DESCRIPTION_CHARS)}`;
    return `  ${name}  ${flag}  ${describeTypes(property)}${detail}`;
  });

  const body =
    shown.length === 0
      ? "  (this tool takes no arguments — return an empty object as \"data\")"
      : lines.join("\n");

  /**
   * NOTHING MARKED REQUIRED IS NOT THE SAME AS NOTHING NEEDED, and until the
   * catalog was recorded this block could not tell the difference.
   *
   * ./catalog-recording.ts, taken from the endpoint the SDK actually reads:
   * GMAIL_SEND_EMAIL publishes NO `required` array at all. Neither does
   * GMAIL_CREATE_EMAIL_DRAFT, GOOGLECALENDAR_EVENTS_LIST,
   * GOOGLECALENDAR_FIND_FREE_SLOTS, GMAIL_LIST_THREADS or GOOGLEDRIVE_FIND_FILE —
   * half the mapped catalog. So the block above listed every argument of the
   * runtime's most consequential tool as `optional`, the word REQUIRED never
   * appeared, and the rule below promising that required arguments must be filled
   * was addressed to an empty set. A model reading it is being told, accurately
   * and uselessly, that `{}` satisfies the send.
   *
   * REJECTED: inventing a required list here — deciding that `recipient_email`
   * "obviously" must be present. That is the hand-written table this whole file
   * exists instead of, rebuilt inside the thing that replaced it, and it would be
   * wrong silently the day Composio renames the argument. What is said instead is
   * the true thing: the schema has no opinion, so the instruction is the only
   * thing that does.
   */
  const noneRequired = shown.length > 0 && input.schema.required.length === 0;

  // `null` means "this line does not apply", `""` means "a blank line here".
  // Distinguishing them matters: filtering on emptiness would strip the blank
  // lines too and hand the model one dense block, which is exactly the shape
  // instructions get skimmed past.
  const parts: (string | null)[] = [
    "TOOL ARGUMENTS — read this before you answer.",
    "",
    `The "data" object you return becomes, verbatim, the argument list for the` +
      ` next tool call in this workflow: "${input.capability}", which Composio` +
      ` publishes as ${input.toolSlug}.` +
      (input.toolDescription === null || input.toolDescription === undefined
        ? ""
        : ` ${truncate(input.toolDescription, DESCRIPTION_CHARS)}`),
    "",
    "It accepts exactly these arguments, and it knows them by these names:",
    "",
    body,
    omitted > 0
      ? `\n  … and ${omitted} further optional argument(s) not listed here. Use only` +
        ` the names above.`
      : null,
    noneRequired
      ? `\n${input.toolSlug} marks NONE of these arguments as required, so this list` +
        ` cannot tell you which ones the step needs. That is Composio's answer, not` +
        ` permission to send an empty object: an argument you leave out is one the` +
        ` tool never receives.`
      : null,
    "",
    "Rules for \"data\":",
    "- Use these names exactly. A name that is not on the list is refused before",
    "  anything is sent — the tool would not receive it, so it must not be sent.",
    noneRequired
      ? "- Fill in every argument the instruction above implies. Nothing is marked\n" +
        "  REQUIRED here, so nothing downstream will catch one you leave out."
      : "- Every REQUIRED argument must be present, with a real value.",
    "- Omit an optional argument you have no value for. Never invent one.",
    "- This is the argument list only. Keep reporting figures in \"metrics\" as",
    "  before; they are checked against spending and volume limits separately.",
  ];

  return parts.filter((part): part is string => part !== null).join("\n");
}

/* ═══════════════════════════ The gate ═══════════════════════════ */

export type ArgumentCheck =
  | { ok: true }
  /** One sentence per problem, written for whoever has to fix the reason step. */
  | { ok: false; problems: readonly string[] };

/** More than this and the refusal stops being readable; the count is reported
    instead, so nothing is hidden. */
const MAX_REPORTED_PROBLEMS = 8;

function typeOfValue(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  const primitive = typeof value;
  if (primitive === "number") return Number.isInteger(value) ? "integer" : "number";
  return primitive === "object" ? "object" : primitive;
}

/** JSON Schema's type vocabulary against a JavaScript value. `integer` is a
    number that is whole; `number` accepts both. */
function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "array":
      return Array.isArray(value);
    case "object":
      return isRecord(value);
    case "null":
      return value === null;
    default:
      // A type name this build does not know is not evidence of a mistake.
      // Passing it on lets Composio judge, with its own words.
      return true;
  }
}

/**
 * Does this argument record match the tool's schema well enough to send?
 *
 * THE THREE THINGS IT CHECKS, and each is a shape Composio would NOT reject:
 *
 *   1. A required argument is missing. Composio does reject this — usually —
 *      but catching it here costs one HTTP call less and names the reason step.
 *   2. A name the schema does not list. THE IMPORTANT ONE. Composio accepts the
 *      call and drops the field, so `{ to, subject, body }` sends an email to
 *      nobody, or GMAIL_SEND_EMAIL rejects on the missing `recipient_email` and
 *      the person reading the timeline never learns that `to` was the problem.
 *   3. A primitive type that cannot be what the argument means — a string where
 *      a number belongs, an object where a string belongs.
 *
 * `undefined` is treated as ABSENT throughout, both for the required check and
 * the unknown-name check, because `JSON.stringify` drops it: an argument set to
 * undefined is an argument that was never sent, and refusing a call over a field
 * that will not appear on the wire would be refusing the wrong thing.
 */
export function checkArgumentsAgainstSchema(
  args: Record<string, unknown>,
  schema: ToolInputSchema,
): ArgumentCheck {
  const problems: string[] = [];

  const present = new Map<string, unknown>();
  for (const [name, value] of Object.entries(args)) {
    if (value !== undefined) present.set(name, value);
  }

  for (const name of schema.required) {
    if (!present.has(name)) {
      const property = schema.properties.get(name);
      const hint =
        property === undefined
          ? ""
          : ` (${describeTypes(property)})${
              property.description === null ? "" : ` — ${truncate(property.description, 90)}`
            }`;
      problems.push(`required argument "${name}" is missing${hint}`);
    }
  }

  for (const [name, value] of present) {
    const property = schema.properties.get(name);
    if (property === undefined) {
      if (!schema.additionalPropertiesAllowed) {
        problems.push(
          `"${name}" is not an argument this tool accepts, so it would be dropped ` +
            `rather than delivered`,
        );
      }
      continue;
    }
    if (property.types.length > 0 && !property.types.some((type) => matchesType(value, type))) {
      problems.push(
        `"${name}" must be ${describeTypes(property)}, but a ${typeOfValue(value)} was produced`,
      );
      continue;
    }
    if (property.enumValues !== null) {
      const allowed: readonly (string | number | boolean)[] = property.enumValues;
      const matched = allowed.some((candidate) => candidate === value);
      if (!matched) {
        problems.push(
          `"${name}" must be ${describeTypes(property)}, but ${JSON.stringify(value)} was produced`,
        );
      }
    }
  }

  if (problems.length === 0) return { ok: true };
  if (problems.length <= MAX_REPORTED_PROBLEMS) return { ok: false, problems };
  return {
    ok: false,
    problems: [
      ...problems.slice(0, MAX_REPORTED_PROBLEMS),
      `… and ${problems.length - MAX_REPORTED_PROBLEMS} more`,
    ],
  };
}

/** The argument names the tool accepts, required ones first — for a refusal that
    tells the reader what the right answer would have looked like. */
export function summariseArgumentNames(schema: ToolInputSchema): string {
  const names = [...schema.properties.values()]
    .sort((a, b) => {
      if (a.required !== b.required) return a.required ? -1 : 1;
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    })
    .slice(0, MAX_PROPERTIES)
    .map((property) => (property.required ? `${property.name} (required)` : property.name));
  return names.length === 0 ? "(none)" : names.join(", ");
}

/* ═══════════════════════ The seam the executor uses ═══════════════════════ */

/**
 * What a provider can answer about one capability's arguments.
 *
 * THREE ARMS, NOT TWO, because "there is no tool for this" and "the tool exists
 * and its schema could not be read" have different fixes and different blame.
 * The first is a decision written down in lib/runtime/tools/capabilities.ts; the
 * second is Composio being unreachable, a key that stopped working, or a slug
 * that no longer exists — and it is the one that must never be flattened into
 * "no schema needed, send it anyway".
 */
export type ToolArgumentLookup =
  | {
      kind: "schema";
      capability: string;
      toolSlug: string;
      schema: ToolInputSchema;
      /** Ready to append to a prompt; built here so caller and gate agree. */
      prompt: string;
    }
  | { kind: "no_tool"; capability: string; reason: string }
  | { kind: "unavailable"; capability: string; toolSlug: string | null; reason: string };

/**
 * A provider that can describe a capability's arguments.
 *
 * NOT ADDED TO `IntegrationProvider` in lib/runtime/types.ts, deliberately. That
 * interface is the contract D's integration layer implements and the stub, the
 * two refusing providers and every test double satisfy; widening it would make a
 * schema-describing method mandatory for objects that never reach Composio at all
 * — the sandbox stub simulates every send, so there is nothing to check a shape
 * against. Structural detection through `asToolSchemaSource` keeps the executor's
 * enrichment optional and the enforcement where it belongs: inside the one
 * provider that can actually send something.
 */
export interface ToolSchemaSource {
  describeToolArguments(capability: string): Promise<ToolArgumentLookup>;
}

/** The narrowing. Returns null for every provider that cannot answer — the stub
    and the two organization refusals — so the caller adds no prompt block and
    changes nothing about how those behave. */
export function asToolSchemaSource(candidate: unknown): ToolSchemaSource | null {
  if (typeof candidate !== "object" || candidate === null) return null;
  const method = (candidate as { describeToolArguments?: unknown }).describeToolArguments;
  return typeof method === "function" ? (candidate as ToolSchemaSource) : null;
}
