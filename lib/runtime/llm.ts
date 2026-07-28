/**
 * lib/runtime/llm.ts — the reasoning layer behind `reason` steps (ROLE_C_PLAN M1).
 *
 * The runtime interprets `StepSpec[]`, so the model never chooses what happens
 * next: it only fills in the one step kind that has no side effects. That makes
 * this file small on purpose. It answers a single question — "given the system
 * prompt, the workflow prompt, an instruction and the accumulated run context,
 * what did the agent conclude?" — and returns it as a `ReasonResult`.
 *
 * Two implementations, because the sandbox and production have opposite needs:
 *
 *   FixtureReasoner  deterministic, offline, replayable. Powers M3's "identical
 *                    verdict across 5 consecutive runs" exit criterion, and
 *                    every headless test. No clock, no network, no randomness.
 *
 *   AiAndReasoner    the real thing, over AI&'s OpenAI-compatible chat
 *                    completions endpoint. Configured from server-only env.
 *
 * Two rules this file exists to enforce:
 *
 *  1. NO SILENT FALLBACK. If AI& is selected but unconfigured, the constructor
 *     throws. A fixture answer served under a live badge would make the agent
 *     look like it is thinking when it is not, and the owner would be approving
 *     a decision nobody made.
 *
 *  2. METRICS ARE LOAD-BEARING. `ReasonResult.metrics` feeds
 *     `ToolInvocation.metrics`, which policy evaluates against `PolicyLimit`.
 *     A missing metric fails closed upstream (see policy.ts), so both
 *     implementations emit numbers only, never strings and never nulls.
 *
 * Determinism: nothing here reads a clock or a random source. Delays come from
 * an injected `sleep`, so retry paths are instant in tests.
 */

import type { ReasonResult, Reasoner } from "./types";

/** The `Reasoner.reason` argument, named so implementations can refer to it. */
export interface ReasonInput {
  systemPrompt: string;
  workflowPrompt: string;
  instruction: string;
  context: Record<string, unknown>;
}

/* ═══════════════════════════ Errors ═══════════════════════════ */

/**
 * Thrown by the AI& constructor when required configuration is absent. Named
 * so wiring code can distinguish "you have not set this up" from "the call
 * failed", and surface the first as a setup task rather than a run failure.
 */
export class ReasonerConfigError extends Error {
  readonly missing: readonly string[];

  constructor(missing: readonly string[]) {
    super(
      `AI& reasoner is not configured. Missing: ${missing.join(", ")}. ` +
        "Set these in .env.local (see .env.example) or pass an explicit config " +
        "to the AiAndReasoner constructor. The reasoner deliberately does not " +
        "fall back to fixtures: a silent fallback would present scripted output " +
        "as live reasoning.",
    );
    this.name = "ReasonerConfigError";
    this.missing = missing;
  }
}

/** The provider was reachable but the exchange failed (HTTP error, timeout). */
export class ReasonerRequestError extends Error {
  readonly status: number | null;
  readonly attempts: number;

  constructor(message: string, status: number | null, attempts: number) {
    super(message);
    this.name = "ReasonerRequestError";
    this.status = status;
    this.attempts = attempts;
  }
}

/** The provider answered, but not with a usable ReasonResult. */
export class ReasonerResponseError extends Error {
  /** Trimmed excerpt of what came back, for the run's error event. */
  readonly excerpt: string;

  constructor(message: string, excerpt: string) {
    super(message);
    this.name = "ReasonerResponseError";
    this.excerpt = excerpt;
  }
}

/* ═══════════════════════ Fixture reasoner ═══════════════════════ */

/**
 * Context key a caller may set to choose a scripted entry explicitly, for when
 * two steps share an instruction or the instruction is long. Checked before
 * the instruction itself.
 */
export const REASON_SCRIPT_KEY = "__reasonKey";

/**
 * Catch-all script entry, consulted after every specific match and before the
 * derive() heuristic. A sandbox scenario usually wants ONE reasoning result for
 * whichever reason step its workflow happens to contain, without restating the
 * step's instruction verbatim. Without this the script silently misses and
 * derive() invents metrics from stub data, which looks like a passing test
 * while asserting nothing the author intended.
 */
export const REASON_DEFAULT_KEY = "__default";

/** Fields a fixture treats as "the money on this record", in priority order. */
const AMOUNT_FIELDS = [
  "amount",
  "amountDue",
  "amount_due",
  "total",
  "balance",
  "value",
] as const;

const WALK_MAX_DEPTH = 5;
const WALK_MAX_NODES = 2000;
const WALK_MAX_ARRAY_SCAN = 200;

export class FixtureReasoner implements Reasoner {
  private readonly scripted: Record<string, ReasonResult>;

  constructor(scripted?: Record<string, ReasonResult>) {
    this.scripted = scripted ?? {};
  }

  async reason(input: ReasonInput): Promise<ReasonResult> {
    const scripted = this.lookup(input);
    if (scripted) return clone(scripted);
    return derive(input);
  }

  /** Explicit key wins over the instruction; instructions match after
      whitespace normalisation so wrapped fixture strings still hit. */
  private lookup(input: ReasonInput): ReasonResult | null {
    const explicit = input.context[REASON_SCRIPT_KEY];
    // Own keys only. The script is a caller-supplied object literal and so
    // inherits Object.prototype: without this guard an instruction of
    // "toString" resolves to a function and is handed back as a ReasonResult.
    if (typeof explicit === "string" && Object.hasOwn(this.scripted, explicit)) {
      const byKey = this.scripted[explicit];
      if (byKey) return byKey;
    }

    if (Object.hasOwn(this.scripted, input.instruction)) {
      const exact = this.scripted[input.instruction];
      if (exact) return exact;
    }

    const wanted = normalise(input.instruction);
    if (wanted.length > 0) {
      for (const key of Object.keys(this.scripted).sort()) {
        if (key === REASON_DEFAULT_KEY) continue;
        if (normalise(key) === wanted) {
          const hit = this.scripted[key];
          if (hit) return hit;
        }
      }
    }

    // Last resort before derive(): the scenario's catch-all.
    if (Object.hasOwn(this.scripted, REASON_DEFAULT_KEY)) {
      const fallback = this.scripted[REASON_DEFAULT_KEY];
      if (fallback) return fallback;
    }

    return null;
  }
}

/**
 * TEST-ONLY HEURISTIC. When nothing is scripted, invent a result that is still
 * useful enough to exercise the policy engine, rather than an empty shell that
 * would make every limit trivially satisfied.
 *
 * The rules, in full, so nobody mistakes this for real inference:
 *
 *  1. Walk the run context (bounded depth and node count, keys visited in
 *     sorted order so the walk is reproducible).
 *  2. Any numeric leaf whose key already looks like a metric id, i.e. it
 *     contains a dot ("invoice.amount"), is copied through verbatim. A prior
 *     fetch step that reported a metric always wins.
 *  3. The largest array of objects found becomes the "batch". Its length is
 *     emitted as `emails.per_run` — the contract's batch-size metric, on the
 *     fixture assumption of one outbound message per item.
 *  4. Within that batch, the first present of amount / amountDue / amount_due
 *     / total / balance / value gives `<singular-of-array-key>.amount`, set to
 *     the MAXIMUM across items. Maximum, not sum or mean, because limits are
 *     written as "no single invoice above $500" and the worst case is what has
 *     to escalate.
 *
 * So a context holding twelve invoices, one of them $1,200, yields
 * `{ "invoice.amount": 1200, "emails.per_run": 12 }` — enough to drive both
 * BrightPath limits without a scripted fixture.
 */
function derive(input: ReasonInput): ReasonResult {
  const signals = collectSignals(input.context);
  const batch = pickBatch(signals.arrays);

  const metrics: Record<string, number> = {};
  if (batch) {
    metrics["emails.per_run"] = batch.items.length;
    const amount = maxAmount(batch.items);
    if (amount !== null) metrics[`${singular(lastSegment(batch.path))}.amount`] = amount;
  }
  // Explicit metric-shaped keys override anything derived above.
  for (const key of Object.keys(signals.dotted).sort()) {
    const value = signals.dotted[key];
    if (typeof value === "number") metrics[key] = value;
  }

  const headline = firstSentence(input.instruction);
  const summary =
    headline.length > 0
      ? `Fixture reasoning: ${headline}${batch ? ` Reviewed ${batch.items.length} item(s).` : ""}`
      : "Fixture reasoning: no instruction supplied, nothing decided.";

  return {
    summary,
    data: {
      fixture: true,
      instruction: input.instruction,
      source: batch ? batch.path : null,
      itemCount: batch ? batch.items.length : 0,
    },
    metrics,
  };
}

interface ArrayFinding {
  path: string;
  items: Record<string, unknown>[];
}

interface ContextSignals {
  arrays: ArrayFinding[];
  dotted: Record<string, number>;
}

/** Breadth-first, bounded, and sorted at every level so two identical contexts
    always produce the same findings in the same order. */
function collectSignals(context: Record<string, unknown>): ContextSignals {
  const arrays: ArrayFinding[] = [];
  const dotted: Record<string, number> = {};
  const seen = new Set<object>();

  interface Node {
    path: string;
    value: unknown;
    depth: number;
  }
  const queue: Node[] = [{ path: "", value: context, depth: 0 }];
  let head = 0;
  let budget = WALK_MAX_NODES;

  while (head < queue.length && budget > 0) {
    const node = queue[head];
    head += 1;
    budget -= 1;
    if (!node || node.depth > WALK_MAX_DEPTH) continue;

    if (Array.isArray(node.value)) {
      // Re-typed as unknown[] because Array.isArray widens `unknown` to any[].
      const items: unknown[] = node.value;
      const records = items.filter(isRecord);
      if (records.length > 0 && node.path.length > 0) {
        arrays.push({ path: node.path, items: records });
      }
      const scan = Math.min(items.length, WALK_MAX_ARRAY_SCAN);
      for (let i = 0; i < scan; i += 1) {
        queue.push({ path: `${node.path}[${i}]`, value: items[i], depth: node.depth + 1 });
      }
      continue;
    }

    if (!isRecord(node.value)) continue;
    if (seen.has(node.value)) continue;
    seen.add(node.value);

    const record = node.value;
    for (const key of Object.keys(record).sort()) {
      // The executor's reserved envelope keys (__metrics, __action, __reasonKey)
      // are runtime bookkeeping, not tool output. __metrics in particular is a
      // flat record of dotted metric ids that the executor writes back into the
      // very context handed to the next reason step. Harvesting it would let a
      // STALE metric from an earlier, smaller batch outrank one derived from the
      // current batch, and policy.ts only fails closed on a MISSING metric, never
      // a stale one. A $95 invoice seen first would then pin the value and a
      // later $1,200 invoice would send with no approval. Skip the envelope.
      if (node.depth === 0 && key.startsWith("__")) continue;

      const child = record[key];
      if (key.includes(".") && typeof child === "number" && Number.isFinite(child)) {
        dotted[key] = child;
      }
      queue.push({
        path: node.path.length === 0 ? key : `${node.path}.${key}`,
        value: child,
        depth: node.depth + 1,
      });
    }
  }

  return { arrays, dotted };
}

/** Longest array wins; ties broken by path so the choice never flips. */
function pickBatch(arrays: ArrayFinding[]): ArrayFinding | null {
  let best: ArrayFinding | null = null;
  for (const candidate of arrays) {
    if (best === null) {
      best = candidate;
      continue;
    }
    if (candidate.items.length > best.items.length) best = candidate;
    else if (candidate.items.length === best.items.length && candidate.path < best.path) {
      best = candidate;
    }
  }
  return best;
}

function maxAmount(items: Record<string, unknown>[]): number | null {
  for (const field of AMOUNT_FIELDS) {
    let found: number | null = null;
    for (const item of items) {
      const value = toFiniteNumber(item[field]);
      if (value === null) continue;
      found = found === null || value > found ? value : found;
    }
    if (found !== null) return found;
  }
  return null;
}

/** Naive and deliberately so: "invoices" → "invoice", "entries" → "entry". */
function singular(word: string): string {
  if (word.length > 3 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word.length > 0 ? word : "item";
}

function lastSegment(path: string): string {
  const cleaned = path.replace(/\[\d+\]/g, "");
  const parts = cleaned.split(".").filter((p) => p.length > 0);
  return parts.length > 0 ? String(parts[parts.length - 1]) : "item";
}

function firstSentence(text: string): string {
  const flat = normalise(text);
  if (flat.length === 0) return "";
  const stop = flat.search(/[.!?](\s|$)/);
  const sentence = stop === -1 ? flat : flat.slice(0, stop + 1);
  return sentence.length > 160 ? `${sentence.slice(0, 157)}...` : sentence;
}

function normalise(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/* ═══════════════════════════ AI& reasoner ═══════════════════════════ */

export interface AiAndConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

/** Narrower than `typeof fetch` on purpose: it is all this file uses, and it
    keeps a test double from having to reimplement the whole global. */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface AiAndReasonerOptions {
  /** Overrides the environment. Intended for tests and for callers that
      already resolved configuration; still validated the same way. */
  config?: Partial<AiAndConfig>;
  /** Per-attempt budget. Default 30s. */
  timeoutMs?: number;
  /** Extra attempts after the first. Default 2, so at most 3 calls. */
  maxRetries?: number;
  /** Linear backoff base: attempt N waits N * backoffMs. Default 500ms. */
  backoffMs?: number;
  /** Injected so tests never actually wait. */
  sleep?: (ms: number) => Promise<void>;
  /** Injected transport, for tests and for future proxying. */
  fetchImpl?: FetchLike;
  /** Ask for response_format json_object. Default true; automatically dropped
      once if the provider rejects the field. */
  jsonMode?: boolean;
  /** Sent only when set. Some OpenAI-compatible servers reject unknown fields,
      so pin it explicitly when your deployment supports it. */
  seed?: number;
  maxTokens?: number;
  /** Serialised context is truncated past this many characters. Default 24k. */
  contextCharLimit?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_BACKOFF_MS = 500;
const DEFAULT_CONTEXT_CHARS = 24_000;

/** Spelled out in the user message because the JSON mode flag alone does not
    tell the model which keys we need. */
const RESPONSE_CONTRACT = [
  "Answer with ONE JSON object and nothing else. No prose, no markdown fences.",
  "",
  "Shape:",
  "{",
  '  "summary": string,   // one or two sentences, shown on the run timeline',
  '  "data": object,      // structured result later steps can use',
  '  "metrics": object    // string -> number, e.g. {"invoice.amount": 1200, "emails.per_run": 12}',
  "}",
  "",
  "Rules:",
  '- Every value in "metrics" must be a plain number. Never a string, never null.',
  "- Only report a metric you can actually derive from the context above.",
  "- Metrics are checked against spending and volume limits before anything is",
  "  sent, so an invented number is worse than a missing one.",
  "- You are reasoning only. You cannot call tools; never claim to have acted.",
].join("\n");

/**
 * AI& is OpenAI-compatible, so this is a thin, defensive chat-completions
 * client. It is the only part of the runtime that knows the wire format.
 */
export class AiAndReasoner implements Reasoner {
  private readonly config: AiAndConfig;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly backoffMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly fetchImpl: FetchLike;
  private readonly jsonMode: boolean;
  private readonly seed: number | undefined;
  private readonly maxTokens: number | undefined;
  private readonly contextCharLimit: number;

  constructor(options: AiAndReasonerOptions = {}) {
    // Server-side names only. Nothing here is NEXT_PUBLIC_*, so a key can
    // never reach the browser bundle.
    const env = typeof process === "undefined" ? undefined : process.env;
    const apiKey = options.config?.apiKey ?? env?.AIAND_API_KEY ?? "";
    const baseUrl = options.config?.baseUrl ?? env?.AIAND_BASE_URL ?? "";
    const model = options.config?.model ?? env?.AIAND_MODEL ?? "";

    const missing: string[] = [];
    if (apiKey.trim().length === 0) missing.push("AIAND_API_KEY");
    if (baseUrl.trim().length === 0) missing.push("AIAND_BASE_URL");
    if (model.trim().length === 0) missing.push("AIAND_MODEL");
    if (missing.length > 0) throw new ReasonerConfigError(missing);

    this.config = {
      apiKey: apiKey.trim(),
      baseUrl: baseUrl.trim().replace(/\/+$/, ""),
      model: model.trim(),
    };
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = Math.max(0, options.maxRetries ?? DEFAULT_MAX_RETRIES);
    this.backoffMs = Math.max(0, options.backoffMs ?? DEFAULT_BACKOFF_MS);
    this.sleep = options.sleep ?? defaultSleep;
    // Wrapped rather than passed by reference so the global keeps its binding.
    this.fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
    this.jsonMode = options.jsonMode ?? true;
    this.seed = options.seed;
    this.maxTokens = options.maxTokens;
    this.contextCharLimit = options.contextCharLimit ?? DEFAULT_CONTEXT_CHARS;
  }

  async reason(input: ReasonInput): Promise<ReasonResult> {
    const system = [input.systemPrompt, input.workflowPrompt]
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .join("\n\n");

    const user = [
      `Step instruction:\n${input.instruction.trim()}`,
      `Run context (JSON):\n${stableStringify(input.context, this.contextCharLimit)}`,
      RESPONSE_CONTRACT,
    ].join("\n\n");

    const base: Record<string, unknown> = {
      model: this.config.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      // Zero temperature is the determinism floor. Everything above it is the
      // provider's business, which is why sandbox runs use FixtureReasoner.
      temperature: 0,
    };
    if (this.seed !== undefined) base["seed"] = this.seed;
    if (this.maxTokens !== undefined) base["max_tokens"] = this.maxTokens;

    let wantJsonMode = this.jsonMode;
    let downgraded = false;
    let attempts = 0;

    for (;;) {
      const payload = wantJsonMode
        ? { ...base, response_format: { type: "json_object" } }
        : base;
      const outcome = await this.send(payload);

      if (outcome.kind === "ok") return parseReasonResult(outcome.content);

      // Some OpenAI-compatible deployments 400 on response_format. Drop it
      // once and retry for free rather than failing a perfectly good call.
      if (
        outcome.kind === "http" &&
        outcome.status === 400 &&
        wantJsonMode &&
        !downgraded &&
        /response_format|json_object|json_schema/i.test(outcome.text)
      ) {
        wantJsonMode = false;
        downgraded = true;
        continue;
      }

      attempts += 1;
      if (isTransient(outcome) && attempts <= this.maxRetries) {
        await this.sleep(this.backoffMs * attempts);
        continue;
      }
      throw toError(outcome, attempts);
    }
  }

  /** One attempt. Never throws: failures come back as a typed outcome so the
      retry loop stays readable. */
  private async send(payload: Record<string, unknown>): Promise<AttemptOutcome> {
    const controller = new AbortController();
    let timedOut = false;
    const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);

    try {
      const res = await this.fetchImpl(`${this.config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await safeText(res);
        return { kind: "http", status: res.status, text };
      }

      const raw = await safeText(res);
      let envelope: unknown;
      try {
        envelope = JSON.parse(raw);
      } catch {
        // The abort timer also covers the body read. An unparseable body after
        // our own abort is a timeout (retryable), not a provider that answered
        // badly (not retryable), so classify it as such.
        if (timedOut) {
          return {
            kind: "network",
            timedOut: true,
            message: `AI& request timed out after ${this.timeoutMs}ms`,
          };
        }
        return { kind: "malformed", excerpt: excerptOf(raw) };
      }

      const content = readContent(envelope);
      if (content === null || content.trim().length === 0) {
        return { kind: "malformed", excerpt: excerptOf(raw) };
      }
      return { kind: "ok", content };
    } catch (error) {
      return {
        kind: "network",
        timedOut,
        message: timedOut
          ? `AI& request timed out after ${this.timeoutMs}ms`
          : errorMessage(error),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

type AttemptOutcome =
  | { kind: "ok"; content: string }
  | { kind: "http"; status: number; text: string }
  | { kind: "network"; timedOut: boolean; message: string }
  | { kind: "malformed"; excerpt: string };

/** Rate limits, server faults, timeouts and dropped connections are worth a
    second try. A 4xx that is not 429 is our mistake and will repeat. */
function isTransient(outcome: AttemptOutcome): boolean {
  if (outcome.kind === "network") return true;
  if (outcome.kind === "http") return outcome.status === 429 || outcome.status >= 500;
  return false;
}

function toError(outcome: AttemptOutcome, attempts: number): Error {
  if (outcome.kind === "http") {
    return new ReasonerRequestError(
      `AI& chat/completions failed with ${outcome.status} after ${attempts} attempt(s): ${excerptOf(outcome.text)}`,
      outcome.status,
      attempts,
    );
  }
  if (outcome.kind === "network") {
    return new ReasonerRequestError(
      `AI& chat/completions unreachable after ${attempts} attempt(s): ${outcome.message}`,
      null,
      attempts,
    );
  }
  if (outcome.kind === "malformed") {
    return new ReasonerResponseError(
      "AI& returned a completion the runtime could not read (empty or non-JSON envelope).",
      outcome.excerpt,
    );
  }
  return new ReasonerResponseError("AI& returned an unexpected outcome.", "");
}

function readContent(envelope: unknown): string | null {
  if (!isRecord(envelope)) return null;
  const rawChoices = envelope["choices"];
  if (!Array.isArray(rawChoices)) return null;
  const choices: unknown[] = rawChoices;
  if (choices.length === 0) return null;
  const first = choices[0];
  if (!isRecord(first)) return null;
  const message = first["message"];
  if (!isRecord(message)) return null;
  const content = message["content"];
  return typeof content === "string" ? content : null;
}

/* ═══════════════════ Defensive result parsing ═══════════════════ */

/**
 * Models drift towards prose and markdown fences even under a JSON mode flag,
 * so the runtime does the tolerant thing once here rather than in every caller:
 * parse as-is, else unfence, else take the first balanced object. Anything
 * still unparseable is a typed error, never a guessed result.
 */
export function parseReasonResult(content: string): ReasonResult {
  const candidates: string[] = [];
  const trimmed = content.trim();
  candidates.push(trimmed);

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const fencedBody = fenced?.[1];
  if (typeof fencedBody === "string") candidates.push(fencedBody.trim());

  const balanced = extractFirstJsonObject(trimmed);
  if (balanced !== null) candidates.push(balanced);

  for (const candidate of candidates) {
    if (candidate.length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      continue;
    }
    if (isRecord(parsed)) return coerceReasonResult(parsed);
  }

  throw new ReasonerResponseError(
    "AI& reply was not valid JSON matching ReasonResult { summary, data, metrics }.",
    excerptOf(content),
  );
}

function coerceReasonResult(parsed: Record<string, unknown>): ReasonResult {
  const rawSummary = parsed["summary"];
  const summary =
    typeof rawSummary === "string" && rawSummary.trim().length > 0
      ? rawSummary.trim()
      : "The agent returned a decision with no summary.";

  const rawData = parsed["data"];
  const data = isRecord(rawData) ? rawData : {};

  const metrics: Record<string, number> = {};
  const rawMetrics = parsed["metrics"];
  if (isRecord(rawMetrics)) {
    for (const key of Object.keys(rawMetrics).sort()) {
      // Numeric strings are accepted because models emit "1200" routinely;
      // anything else is dropped so policy never sees a NaN.
      const value = toFiniteNumber(rawMetrics[key]);
      if (value !== null) metrics[key] = value;
    }
  }

  return { summary, data, metrics };
}

/** Scans for the first `{`, then tracks depth with string and escape awareness
    so a brace inside a quoted value cannot close the object early. */
export function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text.charAt(i);
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/* ═══════════════════════════ Factory ═══════════════════════════ */

/**
 * Used by the executor wiring. Sandbox and tests pass "fixture"; production
 * passes "aiand" and accepts that an unconfigured environment throws here,
 * loudly, at construction rather than silently at run time.
 */
export function createReasoner(mode: "fixture" | "aiand"): Reasoner {
  return mode === "aiand" ? new AiAndReasoner() : new FixtureReasoner();
}

/* ═══════════════════════════ Helpers ═══════════════════════════ */

function defaultSleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Copied on the way out so a caller cannot mutate the script it was handed,
    which would make the next run of the same fixture behave differently.
    Top level only: nested values are treated as immutable fixture data. */
function clone(result: ReasonResult): ReasonResult {
  return {
    summary: result.summary,
    data: { ...result.data },
    metrics: { ...(result.metrics ?? {}) },
  };
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch (error) {
    return `<unreadable body: ${errorMessage(error)}>`;
  }
}

function excerptOf(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 400 ? `${flat.slice(0, 400)}...` : flat;
}

/**
 * Key-sorted, cycle-safe, depth-capped JSON. Sorting matters: the same context
 * must produce byte-identical prompts, otherwise two runs of one scenario can
 * differ for no reason the owner could ever explain. Dates are serialised via
 * toISOString, which reads the value rather than the clock.
 */
function stableStringify(value: unknown, charLimit: number): string {
  const seen = new Set<object>();

  const walk = (node: unknown, depth: number): string => {
    if (node === null) return "null";
    if (depth > 12) return '"[max-depth]"';

    const type = typeof node;
    if (type === "string") return JSON.stringify(node);
    if (type === "boolean") return node === true ? "true" : "false";
    if (type === "number") return Number.isFinite(node) ? JSON.stringify(node) : "null";
    if (type === "bigint") return JSON.stringify(String(node));
    if (type === "undefined" || type === "function" || type === "symbol") return "null";

    if (node instanceof Date) return JSON.stringify(node.toISOString());

    if (Array.isArray(node)) {
      if (seen.has(node)) return '"[circular]"';
      seen.add(node);
      const items: unknown[] = node;
      const parts = items.map((item) => walk(item, depth + 1));
      seen.delete(node);
      return `[${parts.join(",")}]`;
    }

    if (isRecord(node)) {
      if (seen.has(node)) return '"[circular]"';
      seen.add(node);
      const parts: string[] = [];
      for (const key of Object.keys(node).sort()) {
        const child = node[key];
        if (typeof child === "undefined" || typeof child === "function") continue;
        parts.push(`${JSON.stringify(key)}:${walk(child, depth + 1)}`);
      }
      seen.delete(node);
      return `{${parts.join(",")}}`;
    }

    return "null";
  };

  const out = walk(value, 0);
  return out.length > charLimit
    ? `${out.slice(0, charLimit)}\n... [context truncated at ${charLimit} characters]`
    : out;
}
