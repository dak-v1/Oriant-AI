/**
 * components/live/integrations/format.ts — the words this screen puts around
 * facts the runtime hands over, and the one rule that decides where a connection
 * is filed.
 *
 * WHAT IS *NOT* HERE IS THE POINT. Nothing in this module decides whether a
 * connection blocks go-live: that judgement is `lib/runtime/schedule/activation.ts`'s
 * and arrives already made, as the checklist's own blocker sentences. `groupOf`
 * only reads whether such a sentence exists. The moment this file starts asking
 * "is it required and is it connected", the screen has a second opinion about
 * activation, and a screen that disagrees with the go-live button is worse than
 * one that says nothing.
 *
 * PRODUCT NAMES ARE COSMETIC AND FALL BACK TO THE IDENTIFIER, the same closed-set
 * posture `components/live/approvals/format.ts` takes for the same reason: no
 * splitter turns an unknown id into confident prose. The integration id is also
 * rendered beside the name everywhere, because the id is the thing the plan, the
 * runtime and D's registry all actually agree on — the name is a convenience this
 * lane maintains until D's registry supplies one.
 *
 * INSTANTS ARE FORMATTED IN THE READER'S TIMEZONE, which the runtime library is
 * forbidden from doing and the UI is required to do. An unparseable instant is
 * shown verbatim rather than as "Invalid Date".
 */

import type { ConnectionStatus, IntegrationView } from "./api";
import type { AgentRuntimeState } from "@/lib/runtime/schedule/types";

/* ═══════════════════════════ Names ═══════════════════════════ */

/** Product spellings. Fallback below, never a parser. */
const INTEGRATION_LABEL: Record<string, string> = {
  gmail: "Gmail",
  "google-calendar": "Google Calendar",
  "google-drive": "Google Drive",
  hubspot: "HubSpot",
  mailchimp: "Mailchimp",
  quickbooks: "QuickBooks",
  slack: "Slack",
  "whatsapp-business": "WhatsApp Business",
};

/**
 * "brightpath-crm" → "Brightpath Crm". Deliberately dull: an id this build has
 * never seen gets a readable heading and its exact id underneath, and nobody is
 * told a product name that was invented in a browser.
 */
export function integrationLabel(integrationId: string): string {
  const known = INTEGRATION_LABEL[integrationId];
  if (known !== undefined) return known;
  return integrationId
    .split(/[-_.\s]+/)
    .filter((part) => part !== "")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/* ═══════════════════════════ Connection status ═══════════════════════════ */

export interface StatusMeta {
  /** The word on the badge. Status is never carried by colour alone. */
  label: string;
  /** `.oa-status--*` modifier, so the badge matches every other one in the app. */
  badge: string;
  /** What this state means for the runtime, in the owner's language. */
  sentence: string;
}

/**
 * The four states, read exactly as the activation gate reads them: `required`
 * and `optional` both describe a connection that is NOT there and differ only in
 * what the registry thinks of that, and `needs_approval` is a connection that
 * exists and may not be called yet.
 */
const STATUS_META: Record<ConnectionStatus, StatusMeta> = {
  connected: {
    label: "Connected",
    badge: "oa-status--connected",
    sentence: "The registry reports this connection live, so the runtime can call it.",
  },
  /* Both not-connected states carry the SAME badge on purpose. They differ only
     in what the registry thinks of the absence, and that opinion is in the
     sentence — while the one that decides anything, the plan's own `required`
     flag, is a tag on the card. Two badges reading the same word in two colours
     would be a distinction carried by colour alone, which is the one way this
     screen is not allowed to say anything. */
  required: {
    label: "Not connected",
    badge: "oa-status--neutral",
    sentence:
      "The registry has no connection for this tool and lists it as one that is needed.",
  },
  optional: {
    label: "Not connected",
    badge: "oa-status--neutral",
    sentence: "The registry has no connection for this tool and lists it as optional.",
  },
  needs_approval: {
    label: "Needs approval",
    badge: "oa-status--pending",
    sentence:
      "Connected, but still waiting for someone to approve the permissions it asked " +
      "for — so the runtime may not call it yet. This is the closest thing to a " +
      "re-authorisation prompt that exists in this build.",
  },
};

/** Null status means the registry threw, or answered a word this build lacks. */
export const UNREADABLE_STATUS: StatusMeta = {
  label: "Status unreadable",
  badge: "oa-status--failed",
  sentence:
    "The connection's state could not be established. An unreadable state is not a " +
    "connection: nothing here assumes it is live.",
};

export function statusMeta(status: ConnectionStatus | null): StatusMeta {
  return status === null ? UNREADABLE_STATUS : STATUS_META[status];
}

/**
 * What the runtime's own client lookup said, and only when it disagrees with the
 * status or fails outright. Null when there is nothing worth saying — a
 * disconnected tool having no client is not news.
 */
export function clientContradiction(row: IntegrationView): string | null {
  if (row.client === "unreadable") {
    return (
      "Asking the registry for a client for this connection threw. Whatever the status " +
      "above says, the runtime could not establish that it can call this tool."
    );
  }
  if (row.status === "connected" && row.client === "unavailable") {
    return (
      "The registry reports this connection as live but hands the runtime no client for " +
      "it, so every step that needs it would fail. The two answers contradict each other " +
      "and the pessimistic one is the safe reading."
    );
  }
  return null;
}

/* ═══════════════════════════ Grouping ═══════════════════════════ */

export type GroupId = "blocking" | "attention" | "unconnected" | "connected";

export interface GroupMeta {
  id: GroupId;
  title: string;
  /** What membership of this group means. Rendered under the heading. */
  sentence: string;
}

/**
 * Where one connection is filed.
 *
 * Order of the tests is the whole rule and it runs most-serious first:
 *
 *   1. The activation checklist raised a blocker naming it → BLOCKING. Taken,
 *      never re-derived. This is the only group whose membership is decided
 *      outside this screen.
 *   2. Anything else that cannot be called → ATTENTION. A client lookup that
 *      threw, an unreadable status, permissions awaiting approval, or a
 *      "connected" the runtime holds no client for. None of these is stopping
 *      go-live, and every one of them means a step that needs the tool fails.
 *   3. Simply not connected → UNCONNECTED. The ordinary optional case: nothing
 *      on the checklist names it.
 *   4. Connected and callable → CONNECTED.
 */
export function groupOf(row: IntegrationView): GroupId {
  if (row.blockers.length > 0) return "blocking";
  if (row.client === "unreadable") return "attention";
  if (row.status === null || row.status === "needs_approval") return "attention";
  if (row.status === "connected") {
    return row.client === "available" ? "connected" : "attention";
  }
  return "unconnected";
}

/**
 * The groups in reading order: whatever is stopping go-live comes first, and the
 * healthy majority comes last. An empty group renders nothing at all.
 */
export const GROUPS: GroupMeta[] = [
  {
    id: "blocking",
    title: "Blocking activation",
    sentence:
      "The approved plan marks these required and the runtime cannot use them. Each " +
      "sentence below is the activation checklist's own — the same words the go-live " +
      "button refuses with.",
  },
  {
    id: "attention",
    title: "Cannot be called",
    sentence:
      "Connected in name but unusable, or in a state that could not be read. Nothing on " +
      "the activation checklist names them, so they are not holding up go-live — and any " +
      "step that needs one ends its run with an error.",
  },
  {
    id: "unconnected",
    title: "Not connected",
    sentence:
      "Not connected, and the activation checklist does not name them, so they are not " +
      "stopping anything going live. Read the note on each card about what the agents " +
      "using them actually do when the tool is missing.",
  },
  {
    id: "connected",
    title: "Connected",
    sentence: "Live connections the runtime can call, and what each agent may do through them.",
  },
];

/* ═══════════════════════ What "optional" really costs ═══════════════════════ */

/**
 * The sentence a not-connected, not-blocking card carries.
 *
 * PLAN_CONTRACT §3.9 says an agent with `required: false` "degrades gracefully"
 * without the tool, and the activation gate repeats that phrase. The runtime does
 * not implement it, and saying so is the whole reason this string exists:
 * `performTool` returns an error when `getToolClient` yields null, and both
 * `runFetch` and `runAct` end the run `failed` on a failed tool result
 * (lib/runtime/executor.ts). There is no path anywhere that skips a step because
 * its integration is missing. So "optional" today means "activation will not wait
 * for it", never "the workflow copes".
 *
 * It asserts nothing about what the plan says — the card's own tag carries that,
 * and this text has to stay true for a row that reaches this group for any reason.
 */
export const OPTIONAL_REALITY =
  "Nothing on the activation checklist is waiting for this connection, so it will not " +
  "hold up go-live. That is not the same as the workflows coping without it: the runtime " +
  "has no path that skips a step whose tool is missing — the step returns an error and " +
  "the run ends failed.";

/**
 * The one distinction this screen exists to keep straight, in a sentence that is
 * true whatever state the page is in.
 *
 * "Not connected" covers two situations that could not be further apart — one is
 * a plan working as designed, the other is the reason a go-live button is refusing
 * — and the difference is invisible in the connection state itself, which reads
 * the same word for both (see `STATUS_META` above). So it is stated in prose,
 * ABOVE the list, and it is rendered while loading, while erroring and on an empty
 * plan as well as beside the cards: those are precisely the moments when a reader
 * has no cards to infer it from, and the moment they most need to know that a row
 * about to appear in the "not connected" group might be either.
 */
export const REQUIRED_VS_OPTIONAL =
  "Two connections can both read “not connected” and mean opposite things. Required — the " +
  "activation checklist names it, and go-live is refused until it is there. Optional — nothing " +
  "is waiting for it, so it holds nothing up, though a workflow step that needs it still ends " +
  "its run in an error. This page groups by that difference and takes it from the checklist, " +
  "never from its own reading of the plan.";

/* ═══════════════════════════ Agent runtime state ═══════════════════════════ */

export interface RuntimeStateMeta {
  label: string;
  /** True when this agent is live, and therefore actively relying on the tool. */
  live: boolean;
}

const RUNTIME_STATE_META: Record<AgentRuntimeState, RuntimeStateMeta> = {
  building: { label: "Building", live: false },
  validated: { label: "Validated", live: false },
  active: { label: "Active", live: true },
  paused: { label: "Paused", live: false },
  failed: { label: "Failed", live: false },
};

/**
 * Null is "never activated", which is a different fact from paused and must not
 * be shown as one — an agent with no runtime record has never been through the
 * go-live gate at all.
 */
export function runtimeStateMeta(state: AgentRuntimeState | null): RuntimeStateMeta {
  return state === null ? { label: "Not activated", live: false } : RUNTIME_STATE_META[state];
}

/* ═══════════════════════════ Operations ═══════════════════════════ */

/**
 * The two columns every card carries, plus the third that only appears when the
 * registry could not classify something.
 *
 * "Can act on your behalf" rather than "May request": the scripted screen's
 * phrase describes a request an owner will see, and that is true only for an
 * agent whose policy escalates. An `auto_within_limits` agent inside its limits
 * acts without asking, so the column has to say what the grant permits rather
 * than what the owner will be shown.
 */
export const ACCESS_HEADING: Record<"read" | "write" | "unknown", string> = {
  read: "Can read",
  write: "Can act on your behalf",
  unknown: "Not in the operation registry",
};

/** Why an unclassified operation is its own column rather than filed as a read. */
export const UNKNOWN_ACCESS_NOTE =
  "lib/plan/operations.ts has no entry for these, so nothing can say whether they read " +
  "or write. They are shown as unknown rather than assumed harmless, which is how the " +
  "runtime treats them too — `isReadOnly` answers false for an operation it does not know.";

/* ═══════════════════════════ Instants ═══════════════════════════ */

const STAMP: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

/** "24 Jul 2026, 09:00" in the reader's timezone; the raw string if unparseable. */
export function formatInstant(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso === "" ? "—" : iso;
  return new Date(ms).toLocaleString(undefined, STAMP);
}
