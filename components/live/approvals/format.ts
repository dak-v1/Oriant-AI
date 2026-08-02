/**
 * components/live/approvals/format.ts — turning runtime identifiers into
 * sentences an owner can act on, without inventing meaning that is not there.
 *
 * An approval arrives as `{ integrationId: "gmail", operation: "gmail.messages.send" }`.
 * "Send an email" is what the owner needs to read. Getting from one to the other
 * is a translation, and translations are where a decision surface quietly starts
 * lying — so the rules are narrow and the failure is loud.
 *
 * THE PHRASEBOOK IS A CLOSED SET AND FALLS BACK TO THE IDENTIFIER. Nothing here
 * parses `verb.noun.action` into English. A generic splitter would render
 * `hubspot.invoices.write_off` as "write off invoices", which is right, and
 * `gmail.drafts.create` as "create drafts", which reads like drafting when it
 * means saving one — and would render an operation this build has never seen as
 * confident prose about an action nobody has checked. So an unknown operation is
 * shown as the raw id, marked as unnamed, and the drawer says in as many words
 * that this build has no plain-language description for it. An owner reading a
 * bare identifier knows to look closer; an owner reading a wrong sentence does
 * not.
 *
 * This is a STAND-IN for D's operation vocabulary registry, which ROLE_C_PLAN
 * still lists as an open dependency. When that lands, this map is deleted and
 * the registry answers instead — the shape of the answer (`ActionPhrase`) is
 * already what a registry would return, and `named: false` is already the
 * "registry has no entry" case.
 *
 * DATES ARE FORMATTED IN THE READER'S LOCALE AND TIMEZONE, which the runtime
 * library is forbidden from doing and the UI is required to do. The determinism
 * rule (M3 exit criterion) is about the runtime: instants cross the seam as ISO
 * strings and are rendered here. An unparseable instant is shown verbatim rather
 * than as "Invalid Date".
 *
 * NOTHING HERE RECOMPUTES A DEADLINE. `ApprovalDeadline.detail` is the runtime's
 * own sentence and is rendered as given; a second opinion in the browser would
 * eventually disagree with the notifier about what "overdue" means.
 */

import type { DeadlineState, ProposedInvocation, RiskLevel } from "./api";

/* ═══════════════════════════ The proposed action ═══════════════════════════ */

export interface ActionPhrase {
  /** What the agent proposes to do, in the owner's language when we have it. */
  headline: string;
  /** "Gmail", or the raw integration id when it is not a known one. */
  integration: string;
  /** False when the headline IS the operation id — nothing was translated. */
  named: boolean;
}

/** Product names, so a card says "Gmail" rather than "gmail". */
const INTEGRATION_LABEL: Record<string, string> = {
  gmail: "Gmail",
  "google-calendar": "Google Calendar",
  "google-drive": "Google Drive",
  hubspot: "HubSpot",
  mailchimp: "Mailchimp",
  quickbooks: "QuickBooks",
  slack: "Slack",
  "whatsapp-business": "WhatsApp Business",
  // Not an integration: the runtime's own id for an `approve` step, which pauses
  // with no tool call behind it. Named here so the drawer does not present an
  // explicit checkpoint as a call to a product called "oriant".
  oriant: "Oriant itself",
};

/**
 * Every side-effecting operation the approved plan can actually raise, phrased
 * as the thing that happens if the owner says yes.
 */
const OPERATION_PHRASE: Record<string, string> = {
  "gmail.messages.send": "Send an email to the customer",
  "gmail.drafts.create": "Save a reply as a draft on the customer's thread",
  "google-calendar.events.create": "Book an appointment in the calendar",
  "google-calendar.events.update": "Move an already-confirmed appointment",
  "hubspot.notes.create": "Log a note against the customer record",
  "hubspot.invoices.write_off": "Write off an invoice balance",
  "mailchimp.campaigns.create_draft": "Save a campaign as an unpublished draft",
  "slack.messages.post": "Post a message to the internal channel",
  // The `approve` step's checkpoint — see CHECKPOINT_OPERATION in the executor.
  "workflow.checkpoint": "Continue past a checkpoint the workflow always stops at",
};

export function describeAction(proposed: ProposedInvocation): ActionPhrase {
  const phrase = OPERATION_PHRASE[proposed.operation];
  return {
    headline: phrase ?? proposed.operation,
    integration: INTEGRATION_LABEL[proposed.integrationId] ?? proposed.integrationId,
    named: phrase !== undefined,
  };
}

/**
 * The same phrasebook, for the screens that hold an operation id and nothing
 * else — a tool grant, a queued approval on the Workspace.
 *
 * Null rather than the id, so each caller decides what to fall back to and none
 * of them can mistake an untranslated identifier for a description.
 */
export function operationPhrase(operation: string): string | null {
  return OPERATION_PHRASE[operation] ?? null;
}

/** A run's stored status, as the word the rest of the product uses for it. */
const RUN_STATE_WORD: Record<string, string> = {
  running: "Running",
  awaiting_approval: "Waiting on you",
  completed: "Completed",
  failed: "Failed",
  refused: "Blocked by your rules",
  cancelled: "Cancelled",
};

export function runStateWord(status: string): string {
  return RUN_STATE_WORD[status] ?? status;
}

/** What started a run, in the owner's words rather than the stored one. */
const TRIGGER_WORD: Record<string, string> = {
  schedule: "A schedule",
  event: "Something happening in a connected tool",
  threshold: "A number crossing a line",
  dependency: "Another workflow finishing",
  manual: "Someone starting it by hand",
};

export function triggerWord(kind: string): string {
  return TRIGGER_WORD[kind] ?? kind;
}

/**
 * One line of a run's timeline, named.
 *
 * Known steps get a written phrase; anything else is de-underscored and
 * sentence-cased rather than printed as the stored word. A timeline is the
 * evidence an owner reads before approving, and it has to read as English.
 */
const EVENT_WORD: Record<string, string> = {
  run_started: "Run started",
  run_completed: "Run finished",
  run_failed: "Run failed",
  step_started: "Step started",
  step_completed: "Step finished",
  approval_raised: "Sent to you for a decision",
  approval_decided: "Your decision recorded",
  policy_refused: "Blocked by your rules",
  tool_called: "Tool used",
  reasoned: "Worked out what to do",
};

export function eventWord(kind: string): string {
  const known = EVENT_WORD[kind];
  if (known !== undefined) return known;
  const spaced = kind.replace(/[_.]+/g, " ").trim();
  return spaced === "" ? kind : spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/* ═══════════════════════════ Risk and deadlines ═══════════════════════════ */

/**
 * Risk → `.oa-tag` tone, matching the scripted inbox exactly so the two screens
 * agree about what amber means. Duplicated rather than imported from
 * components/mock/approvals/format, whose module pulls the whole demo store's
 * types and fixtures into this bundle for the sake of three lines.
 */
export const RISK_TAG: Record<RiskLevel, string> = {
  low: "oa-tag--teal",
  medium: "oa-tag--neutral",
  high: "oa-tag--amber",
};

export interface DeadlineTone {
  /** Short label beside the runtime's sentence. Never the only signal. */
  label: string;
  /** True when this belongs in front of somebody now — overdue OR unreadable. */
  pressing: boolean;
}

const DEADLINE_TONE: Record<DeadlineState, DeadlineTone> = {
  due: { label: "Due", pressing: false },
  overdue: { label: "Overdue", pressing: true },
  // Not a milder case of overdue: the runtime could not read the deadline at
  // all, and says so rather than assuming there is time left.
  unreadable: { label: "Deadline unreadable", pressing: true },
};

export function deadlineTone(state: DeadlineState): DeadlineTone {
  return DEADLINE_TONE[state];
}

/* ═══════════════════════════ Run status ═══════════════════════════ */

export type OutcomeTone = "ok" | "warn" | "bad" | "unknown";

export interface RunStatusMeta {
  label: string;
  /** `.oa-status--*` modifier, so the badge matches every other status badge. */
  badge: string;
  tone: OutcomeTone;
  /** What this status means for the decision that was just made. */
  sentence: string;
}

/**
 * How a resumed run ended, read in the light of what the owner chose.
 *
 * `refused` is the status that needs the context: after a rejection it is the
 * correct, requested ending, and after an approval it means the runtime stopped
 * the run at a later policy gate. The same word, two very different things to
 * tell somebody.
 */
export function runStatusMeta(
  status: string | null,
  decision: "approved" | "rejected",
): RunStatusMeta {
  switch (status) {
    case "completed":
      return {
        label: "Run completed",
        badge: "completed",
        tone: "ok",
        sentence:
          decision === "approved"
            ? "The run resumed and finished. What you approved has been carried out."
            : "The run resumed and finished without performing the rejected action.",
      };
    case "refused":
      return decision === "rejected"
        ? {
            label: "Run stopped",
            badge: "approved",
            tone: "ok",
            sentence: "The run stopped without acting, which is exactly what your rejection asked for.",
          }
        : {
            label: "Run blocked",
            badge: "failed",
            tone: "bad",
            sentence:
              "The run carried on and was then blocked by your rules at a later step, so it " +
              "stopped. The reason is on the run below.",
          };
    case "awaiting_approval":
      return {
        label: "Paused again",
        badge: "pending",
        tone: "warn",
        sentence:
          "The run resumed and has paused again at a different approval. It is a new decision, " +
          "not an echo of this one.",
      };
    case "failed":
      return {
        label: "Run failed",
        badge: "failed",
        tone: "bad",
        sentence:
          "Your decision was recorded, then the run failed while continuing. The failure is " +
          "below; the decision itself stands.",
      };
    case "cancelled":
      return {
        label: "Run cancelled",
        badge: "neutral",
        tone: "warn",
        sentence: "Your decision was recorded, but the run had been cancelled and did not continue.",
      };
    case "running":
      return {
        label: "Still running",
        badge: "active",
        tone: "warn",
        sentence: "Your decision was recorded and the run is still working through its steps.",
      };
    default:
      return {
        label: status === null ? "Outcome not reported" : "Outcome not recognised",
        badge: "neutral",
        tone: "unknown",
        sentence:
          "Your decision was recorded, but this screen does not recognise how the run ended, " +
          "so it cannot tell you what happened next.",
      };
  }
}

/* ═══════════════════════════ Instants ═══════════════════════════ */

const STAMP: Intl.DateTimeFormatOptions = {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
};

const CLOCK: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", second: "2-digit" };

/** "Fri 24 Jul, 09:00" in the reader's timezone; the raw string if unparseable. */
export function formatInstant(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso === "" ? "—" : iso;
  return new Date(ms).toLocaleString(undefined, STAMP);
}

/** "09:00:12" — for the server clock, where the seconds are the point. */
export function formatClock(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso === "" ? "—" : iso;
  return new Date(ms).toLocaleTimeString(undefined, CLOCK);
}

/* ═══════════════════════════ Argument values ═══════════════════════════ */

/**
 * Which editor an argument gets. `json` covers arrays, objects and anything
 * else: those are edited as text and re-parsed, because a bespoke widget per
 * shape is a lot of surface for values that are, in practice, model output.
 */
export type ValueKind = "string" | "number" | "boolean" | "null" | "json";

export function valueKind(value: unknown): ValueKind {
  if (value === null) return "null";
  if (typeof value === "string") return "string";
  if (typeof value === "number" && Number.isFinite(value)) return "number";
  if (typeof value === "boolean") return "boolean";
  return "json";
}

/** One line, bounded, for a table cell. Strings keep their quotes so `"12"` and `12` differ. */
export function previewValue(value: unknown, max = 120): string {
  const flat = safeStringify(value).replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/**
 * Indented, for a textarea or an evidence panel.
 *
 * The `undefined` guard is real despite the type: `JSON.stringify` is declared
 * to return `string` and returns `undefined` for `undefined` and for functions,
 * both of which can sit in a value the runtime handed us.
 */
export function safeStringify(value: unknown): string {
  try {
    const text = JSON.stringify(value, null, 2) as string | undefined;
    return text ?? String(value);
  } catch {
    // Circular, or a BigInt. Neither can survive the wire either, so saying so
    // beats rendering "[object Object]".
    return "(this value cannot be shown as JSON)";
  }
}

/**
 * Structural equality, used only to decide whether an owner's edit actually
 * changed anything. Deliberately the cheap version: values that JSON cannot
 * round-trip cannot reach the runtime either, so comparing their serialisations
 * is comparing exactly what would be sent.
 */
export function sameJsonValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  return safeStringify(a) === safeStringify(b);
}
