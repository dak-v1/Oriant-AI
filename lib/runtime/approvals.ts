/**
 * lib/runtime/approvals.ts — the approval domain the Operate surface reads
 * (ROLE_C_PLAN M5).
 *
 * Three of M5's pieces existed only as comments: the version an owner's edit
 * produces, the deadline `escalateAfterMins` implies, and the dependent
 * workflows a run resumed by an approval owes. They live together here because
 * all three are about what happens AFTER the executor has stopped caring — its
 * job ends when the run settles, and everything below is what the inbox, an
 * auditor and a future notifier need from the record it left behind.
 *
 * VERSIONS ARE DERIVED, NOT STORED, and that is the decision here most worth
 * arguing with. An `ApprovalVersion` could have been a fourth table beside
 * `runs`, `approvals` and `approval-decisions`. It is not, because everything a
 * version records is already durable and already write-once: the
 * `ApprovalRequest` freezes what the agent proposed, and the `ApprovalDecision`
 * — created exclusively, so it exists at most once — carries the owner's edit,
 * their id and the instant they made it. A stored version would be a third copy
 * of facts two write-once records already hold, and the only thing a third copy
 * can add is the ability to disagree with them. Derived, the version an audit
 * reads is BY CONSTRUCTION the merge the executor replayed, because both go
 * through `resolvedApprovalArgs`.
 *
 * What would force a real table is more than one version per approval — a
 * save-draft path where an owner revises a proposal several times before
 * deciding. There is no such path today: `saveDecision` is write-once in both
 * stores, so an approval has at most one edit and therefore at most two
 * versions. That is the condition to watch for, written down here rather than
 * discovered later when the derivation has quietly started losing history.
 *
 * A DEADLINE THE RUNTIME CANNOT READ IS PAST DUE. `dueAt` crosses a store as
 * text, so it can come back as something `Date.parse` refuses. Reading that as
 * "not overdue yet" would hide the one item nobody can reason about behind a
 * calm-looking inbox, so an unreadable deadline is reported as its own state and
 * `isPastDue` counts it — the same posture policy.ts takes on a limit whose
 * metric never arrived.
 *
 * THE DEPENDENCY HANDOFF IS A CALLBACK, NOT AN IMPORT. `fireDependencies` is
 * called from here, not from the executor, because the executor is deliberately
 * unaware that a scheduler exists — and the scheduler already imports the
 * executor, so a direct import would close a cycle as well as invert the layers.
 * This module is where the two are allowed to meet: it is the Operate surface's
 * composition point, and `dependencyFanOut` is the concrete wiring the Approvals
 * route hands to `ExecutorOptions.onRunResumed`.
 *
 * Determinism (M3 exit criterion): nothing here reads a clock or mints an id.
 * Every instant arrives as an argument, and every walk over owner-supplied data
 * is depth-bounded and key-sorted so two identical inputs produce identical
 * output.
 */

import { resolvedApprovalArgs } from "./executor";
import type { RunOutcome } from "./executor";
import { fireDependencies } from "./schedule/worker";
import type { WorkerDeps } from "./schedule/worker";
import type { ApprovalDecision, ApprovalRequest, RunStore } from "./types";

/* ═══════════════════════════ Versions ═══════════════════════════ */

/**
 * How one argument differs from the previous version.
 *
 * `cleared` is separate from `changed` because an inbox renders them
 * differently — "Sarah rewrote the subject" and "Sarah removed the cc" are not
 * the same review note — and because the merge expresses a clear as a key whose
 * value is `undefined`, which is a value JSON drops and the persistence codec
 * deliberately keeps.
 */
export type ApprovalArgChangeKind = "added" | "changed" | "cleared";

export interface ApprovalArgChange {
  key: string;
  kind: ApprovalArgChangeKind;
  /** What the agent had there. Absent when the owner added a new key. */
  from?: unknown;
  /** What the owner put there. Absent when the owner cleared the key. */
  to?: unknown;
}

/**
 * One state of the arguments an approval was decided on.
 *
 * Version 1 is always the agent's frozen proposal. Version 2 exists only when an
 * APPROVING owner changed something: a rejection's edits never executed, so
 * there is no version of an action to record — the raw `editedArgs` stay on the
 * decision, and `app/api/runtime/approvals` refuses that combination at the door
 * rather than storing edits that could never take effect.
 */
export interface ApprovalVersion {
  approvalId: string;
  /** 1 is the agent's proposal; 2 is the owner's edit of it. */
  version: number;
  author: "agent" | "owner";
  /** The agent id for version 1, the deciding user's id for version 2. */
  authoredBy: string;
  authoredAt: string;
  /**
   * The COMPLETE arguments as of this version, not a patch. An audit has to be
   * able to answer "what would this have sent" from one record, and version 2's
   * copy is the exact object the executor replayed.
   */
  args: Record<string, unknown>;
  /** Field-level differences from the previous version; empty on version 1. */
  changes: ApprovalArgChange[];
}

/**
 * The argument lineage of one approval: what the agent proposed, and what the
 * owner made of it.
 *
 * Pass `null` for an approval nobody has decided yet — the proposal is still a
 * version, and the inbox shows it as the thing being reviewed.
 */
export function approvalVersions(
  request: ApprovalRequest,
  decision: ApprovalDecision | null,
): ApprovalVersion[] {
  const proposed: ApprovalVersion = {
    approvalId: request.approvalId,
    version: 1,
    author: "agent",
    authoredBy: request.agentId,
    authoredAt: request.createdAt,
    args: { ...request.invocation.args },
    changes: [],
  };

  if (!decision || decision.decision !== "approved" || !decision.editedArgs) {
    return [proposed];
  }

  const changes = diffArgs(request.invocation.args, decision.editedArgs);
  // An "edit" that changed nothing is not an edit. Recording a second version
  // for it would put "you edited this before approving" in front of an owner who
  // did not, which is the kind of small lie that costs an audit its credibility.
  if (changes.length === 0) return [proposed];

  return [
    proposed,
    {
      approvalId: request.approvalId,
      version: 2,
      author: "owner",
      authoredBy: decision.decidedBy,
      authoredAt: decision.decidedAt,
      // The same expression the executor replays — see resolvedApprovalArgs.
      args: resolvedApprovalArgs(request, decision),
      changes,
    },
  ];
}

/** Whether an owner changed anything before approving. */
export function wasEdited(versions: ApprovalVersion[]): boolean {
  return versions.some((version) => version.author === "owner");
}

/**
 * Which keys the owner's patch actually moves.
 *
 * Keys are walked in sorted order so two reads of the same decision produce the
 * same list. A key present in the patch whose value equals the proposal's is not
 * a change — an inbox that round-trips the whole argument object back as
 * `editedArgs` would otherwise report every field as edited.
 */
function diffArgs(
  proposed: Record<string, unknown>,
  edited: Record<string, unknown>,
): ApprovalArgChange[] {
  const changes: ApprovalArgChange[] = [];

  for (const key of Object.keys(edited).sort()) {
    const had = Object.prototype.hasOwnProperty.call(proposed, key);
    const before = proposed[key];
    const after = edited[key];

    if (had && sameValue(before, after, 0)) continue;
    // A key the proposal never had, set to nothing, adds nothing.
    if (!had && after === undefined) continue;

    if (!had) changes.push({ key, kind: "added", to: after });
    else if (after === undefined) changes.push({ key, kind: "cleared", from: before });
    else changes.push({ key, kind: "changed", from: before, to: after });
  }

  return changes;
}

/**
 * Bounded for the same reason the executor bounds its evidence walk: argument
 * values are model output, and a comparison that can be made to recurse forever
 * is a comparison an owner can hang the inbox with. Beyond the bound two values
 * are reported as different, which costs a change note nobody needed and never
 * hides one that mattered.
 */
const DIFF_MAX_DEPTH = 6;

/**
 * Structural equality over the shapes an argument can honestly hold: primitives,
 * Dates, arrays and plain objects.
 *
 * Anything else — a Map, a Set, a class instance — reports NOT equal. That is
 * the safe direction: the failure is a change note for something that did not
 * change, where the opposite failure is an edit the audit never mentions.
 */
function sameValue(a: unknown, b: unknown, depth: number): boolean {
  if (Object.is(a, b)) return true;
  if (depth >= DIFF_MAX_DEPTH) return false;

  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => sameValue(item, b[index], depth + 1));
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const left = Object.keys(a).sort();
    const right = Object.keys(b).sort();
    if (left.length !== right.length) return false;
    return left.every(
      (key, index) => key === right[index] && sameValue(a[key], b[key], depth + 1),
    );
  }

  return false;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null;
}

/* ═══════════════════════════ Deadlines ═══════════════════════════ */

/**
 * `due` — the deadline is still ahead.
 * `overdue` — `escalateAfterMins` has elapsed and this belongs in front of a
 *   human now. This is the state `AgentPolicy.escalateAfterMins` exists to
 *   produce; nothing before M5 ever computed it.
 * `unreadable` — `dueAt` is not an instant, or the caller's clock is not. Fails
 *   towards attention; see the module header.
 */
export type ApprovalDeadlineState = "due" | "overdue" | "unreadable";

export interface ApprovalDeadline {
  approvalId: string;
  /** Mirrors `ApprovalRequest.dueAt` — createdAt + escalateAfterMins. */
  dueAt: string;
  state: ApprovalDeadlineState;
  /** Whole minutes past `dueAt`. Zero unless the state is `overdue`. */
  overdueByMins: number;
  /** Whole minutes still to run. Zero unless the state is `due`. */
  minutesRemaining: number;
  /** One line in the owner's language: "Overdue by 2h 15m." */
  detail: string;
}

/** Anything that carries a deadline. `ApprovalRequest` satisfies it. */
export interface HasDeadline {
  approvalId: string;
  dueAt: string;
}

/**
 * Where one approval stands against its escalation deadline at a given instant.
 *
 * Pure and clock-free on purpose: the inbox re-derives this every second in the
 * browser without a fetch, and a notifier derives it on a timer from the same
 * function, so the two can never disagree about what "overdue" means.
 */
export function approvalDeadline(approval: HasDeadline, at: Date): ApprovalDeadline {
  const base = { approvalId: approval.approvalId, dueAt: approval.dueAt };
  const dueMs = Date.parse(approval.dueAt);
  const atMs = at.getTime();

  if (!Number.isFinite(dueMs) || !Number.isFinite(atMs)) {
    return {
      ...base,
      state: "unreadable",
      overdueByMins: 0,
      minutesRemaining: 0,
      detail: !Number.isFinite(atMs)
        ? `Cannot tell whether this is overdue: the clock read ${String(at)}.`
        : `Cannot tell whether this is overdue: "${approval.dueAt}" is not a readable ` +
          `instant. Treated as needing attention.`,
    };
  }

  // The deadline PASSING is the escalation, not a whole minute after it. A
  // notifier polling every thirty seconds has to escalate on the first pass at
  // or after `dueAt`, so the boundary is inclusive and `overdueByMins` is
  // allowed to be zero.
  if (atMs >= dueMs) {
    const by = Math.floor((atMs - dueMs) / 60_000);
    return {
      ...base,
      state: "overdue",
      overdueByMins: by,
      minutesRemaining: 0,
      detail:
        by === 0
          ? "Overdue — the deadline has just passed."
          : `Overdue by ${describeMinutes(by)}.`,
    };
  }

  // Rounded up, so an approval with forty seconds left reads "due in 1m" rather
  // than "due now" and then jumps straight to overdue.
  const remaining = Math.ceil((dueMs - atMs) / 60_000);
  return {
    ...base,
    state: "due",
    overdueByMins: 0,
    minutesRemaining: remaining,
    detail: `Due in ${describeMinutes(remaining)}.`,
  };
}

/**
 * Whether this approval should be in front of someone now.
 *
 * `unreadable` counts. A deadline the runtime cannot evaluate must not be
 * quietly treated as having plenty of time left.
 */
export function isPastDue(deadline: ApprovalDeadline): boolean {
  return deadline.state !== "due";
}

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

/** "45m", "2h 15m", "3d 4h" — coarse on purpose; this is a review queue. */
function describeMinutes(total: number): string {
  const mins = Math.max(0, Math.floor(total));
  if (mins < MINUTES_PER_HOUR) return `${mins}m`;

  if (mins < MINUTES_PER_DAY) {
    const hours = Math.floor(mins / MINUTES_PER_HOUR);
    const rest = mins % MINUTES_PER_HOUR;
    return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
  }

  const days = Math.floor(mins / MINUTES_PER_DAY);
  const hours = Math.floor((mins % MINUTES_PER_DAY) / MINUTES_PER_HOUR);
  return hours === 0 ? `${days}d` : `${days}d ${hours}h`;
}

/* ═══════════════════════════ The inbox ═══════════════════════════ */

export interface PendingApproval {
  request: ApprovalRequest;
  deadline: ApprovalDeadline;
}

/**
 * Every undecided approval, with where each one stands at `at`.
 *
 * The store's order is kept rather than re-sorted: both implementations already
 * list pending approvals by `dueAt` ascending, which is most-overdue-first and
 * is exactly the inbox's order. Sorting again here would be a second opinion
 * about the same question, and the two would eventually differ.
 */
export async function pendingApprovals(
  store: Pick<RunStore, "listPendingApprovals">,
  at: Date,
): Promise<PendingApproval[]> {
  const requests = await store.listPendingApprovals();
  return requests.map((request) => ({
    request,
    deadline: approvalDeadline(request, at),
  }));
}

/**
 * The pending approvals that have blown their `escalateAfterMins` deadline.
 *
 * A function over the store rather than a query on it, so the inbox, the
 * Workspace's "at risk" tile and a future notifier all ask the same question the
 * same way. `RunStore` gains nothing from a dedicated method: the filter is a
 * function of data it already returns, and pushing it into the interface would
 * oblige every future store to reimplement the definition of overdue.
 */
export async function overdueApprovals(
  store: Pick<RunStore, "listPendingApprovals">,
  at: Date,
): Promise<PendingApproval[]> {
  const pending = await pendingApprovals(store, at);
  return pending.filter((item) => isPastDue(item.deadline));
}

/** One approval and everything decided about it. */
export interface ApprovalRecord {
  request: ApprovalRequest;
  /** Null while the approval is still pending. */
  decision: ApprovalDecision | null;
  deadline: ApprovalDeadline;
  versions: ApprovalVersion[];
  /** True when the owner changed something before approving. */
  edited: boolean;
}

/**
 * The review drawer's read, and the only way to see an approval once a decision
 * has taken it out of the pending list.
 *
 * BY ID, one at a time, because `RunStore` cannot list decided approvals — there
 * is no `listApprovals`, only `listPendingApprovals`. An inbox wanting a
 * "recently decided" section therefore needs that method added, or the ids it
 * already holds from before it decided them. Named here rather than worked
 * around with a full scan the interface does not offer.
 */
export async function approvalRecord(
  store: Pick<RunStore, "getApproval" | "getDecision">,
  approvalId: string,
  at: Date,
): Promise<ApprovalRecord | null> {
  const request = await store.getApproval(approvalId);
  if (!request) return null;

  const decision = await store.getDecision(approvalId);
  const versions = approvalVersions(request, decision);

  return {
    request,
    decision,
    deadline: approvalDeadline(request, at),
    versions,
    edited: wasEdited(versions),
  };
}

/* ═══════════════════ The dependency handoff (M4 → M5) ═══════════════════ */

/**
 * The wiring that makes a run finishing by approval behave like one finishing
 * inside a worker pass.
 *
 * `runDueWork` fans out to dependent workflows when a run it started completes.
 * A run that PAUSED settles its job `succeeded` and completes much later, inside
 * `decideAndResume`, which no pass ever observes — and on BrightPath that is the
 * ORDINARY path, because the Friday sweep pauses on its first over-limit
 * invoice. Without this, anything chained behind the sweep would silently never
 * become due, and "silently" is the whole problem: nothing errors, nothing
 * retries, the workflow simply never runs.
 *
 * Handed to `ExecutorOptions.onRunResumed` rather than called by the executor
 * itself. See the module header for why the callback beats the import; the short
 * version is that the scheduler already imports the executor, so the executor
 * cannot import the scheduler back, and it has no business knowing what a
 * dependency trigger is either way.
 *
 * `queued()` is a counter rather than a return value because the hook's result
 * is discarded by the executor — the caller reads it after the resume returns,
 * exactly as `runDueWork` reads its own `dependencyJobs`. A throw from
 * `fireDependencies` is deliberately NOT swallowed here: the executor catches it
 * and reports it on `RunOutcome.followUpError`, so a queue that refused a write
 * is visible without a settled, correct run being reported as broken.
 */
export interface ResumeFanOut {
  /** Wire as `ExecutorOptions.onRunResumed`. */
  onRunResumed(outcome: RunOutcome): Promise<void>;
  /** Dependent jobs queued so far. Read after the resume returns. */
  queued(): number;
}

export function dependencyFanOut(
  deps: Pick<WorkerDeps, "plan" | "scheduler" | "maxAttempts">,
): ResumeFanOut {
  let total = 0;
  return {
    async onRunResumed(outcome: RunOutcome): Promise<void> {
      // `fireDependencies` fires nothing for a run that did not complete, and
      // that guard is left where it is rather than repeated here: a resumed run
      // can end refused, failed, or paused again at a second approval, and only
      // one of those means the chained workflow's precondition was met.
      total += await fireDependencies(outcome.run, deps);
    },
    queued(): number {
      return total;
    },
  };
}
