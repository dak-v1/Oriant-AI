/**
 * lib/runtime/store.ts — persistence for runs and approvals (ROLE_C_PLAN M1).
 *
 * M0 has not settled the real database yet, so this is the reference in-memory
 * implementation of `RunStore`. Every M1 test and the sandbox run against it,
 * and because the interface is deliberately narrow the real store swaps in
 * later without the executor changing a line.
 *
 * Two properties are load-bearing and worth stating plainly:
 *
 *   1. NOTHING IS SHARED BY REFERENCE. Every write clones its input and every
 *      read clones its output. The approval interrupt persists a run, hands
 *      control to a human, then resumes from `cursor` much later; if a caller
 *      held an alias of the stored `RunState` it could mutate the resume point
 *      after the fact and the run would silently continue from the wrong step.
 *      A real database gives us this for free, so the test double must too,
 *      otherwise tests pass against behaviour production will not have.
 *
 *   2. DECISIONS ARE WRITE-ONCE. A second decision on the same approval would
 *      resume the same run twice, which for an `act` step means sending the
 *      email twice. It throws rather than overwriting.
 *
 * Determinism (M3 exit criterion): no timers, no `Date.now()`, no
 * `Math.random()` anywhere in this file. Time arrives through `Clock` and ids
 * through the factory below. `SystemClock` is the single sanctioned place in
 * the runtime where wall-clock time is read.
 */

import type {
  ApprovalDecision,
  ApprovalRequest,
  Clock,
  RunState,
  RunStatus,
  RunStore,
} from "./types";

/* ═══════════════════════════ Cloning ═══════════════════════════ */

/**
 * `structuredClone` rather than a JSON round-trip: run context legitimately
 * holds Dates, Maps and Sets, all of which JSON would flatten or drop.
 */
function clone<T>(value: T): T {
  return structuredClone(value);
}

/* ═══════════════════════════ Run store ═══════════════════════════ */

export class InMemoryRunStore implements RunStore {
  /** Insertion-ordered, which is what makes list ordering reproducible. */
  private readonly runs = new Map<string, RunState>();
  private readonly approvals = new Map<string, ApprovalRequest>();
  private readonly decisions = new Map<string, ApprovalDecision>();
  private readonly claimedKeys = new Set<string>();

  /* ── Runs ── */

  async createRun(state: RunState): Promise<void> {
    if (this.runs.has(state.runId)) {
      // A duplicate id means the caller lost track of an existing run; letting
      // it through would replace a live run's cursor with a fresh one.
      throw new Error(
        `InMemoryRunStore.createRun: run "${state.runId}" already exists`,
      );
    }
    this.runs.set(state.runId, clone(state));
  }

  /**
   * Update only. An unknown id is a bug in the caller rather than a request to
   * insert, and creating the run here would sidestep the duplicate check above.
   */
  async saveRun(state: RunState): Promise<void> {
    if (!this.runs.has(state.runId)) {
      throw new Error(
        `InMemoryRunStore.saveRun: unknown run "${state.runId}" — call createRun first`,
      );
    }
    this.runs.set(state.runId, clone(state));
  }

  async getRun(runId: string): Promise<RunState | null> {
    const found = this.runs.get(runId);
    return found === undefined ? null : clone(found);
  }

  async listRuns(filter?: {
    agentId?: string;
    status?: RunStatus;
  }): Promise<RunState[]> {
    const out: RunState[] = [];
    for (const run of this.runs.values()) {
      if (filter?.agentId !== undefined && run.agentId !== filter.agentId) continue;
      if (filter?.status !== undefined && run.status !== filter.status) continue;
      out.push(clone(run));
    }
    return out;
  }

  /**
   * The scheduler's guarantee against double-firing (M4): a re-delivered
   * trigger claims the same key and is told to stand down.
   */
  async claimIdempotencyKey(key: string): Promise<boolean> {
    if (this.claimedKeys.has(key)) return false;
    this.claimedKeys.add(key);
    return true;
  }

  /* ── Approvals ── */

  async createApproval(request: ApprovalRequest): Promise<void> {
    if (this.approvals.has(request.approvalId)) {
      throw new Error(
        `InMemoryRunStore.createApproval: approval "${request.approvalId}" already exists`,
      );
    }
    this.approvals.set(request.approvalId, clone(request));
  }

  async getApproval(approvalId: string): Promise<ApprovalRequest | null> {
    const found = this.approvals.get(approvalId);
    return found === undefined ? null : clone(found);
  }

  async getDecision(approvalId: string): Promise<ApprovalDecision | null> {
    const found = this.decisions.get(approvalId);
    return found === undefined ? null : clone(found);
  }

  async saveDecision(decision: ApprovalDecision): Promise<void> {
    if (!this.approvals.has(decision.approvalId)) {
      throw new Error(
        `InMemoryRunStore.saveDecision: unknown approval "${decision.approvalId}"`,
      );
    }
    const existing = this.decisions.get(decision.approvalId);
    if (existing !== undefined) {
      // Deciding twice would resume the paused run twice, and for an `act`
      // step that means performing the side effect twice.
      throw new Error(
        `InMemoryRunStore.saveDecision: approval "${decision.approvalId}" was already ` +
          `${existing.decision} by ${existing.decidedBy} at ${existing.decidedAt}`,
      );
    }
    this.decisions.set(decision.approvalId, clone(decision));
  }

  /** Undecided approvals, most overdue first. */
  async listPendingApprovals(): Promise<ApprovalRequest[]> {
    const pending: ApprovalRequest[] = [];
    for (const approval of this.approvals.values()) {
      if (!this.decisions.has(approval.approvalId)) pending.push(clone(approval));
    }
    // Array.prototype.sort is stable, so equal dueAt values keep creation
    // order and the list never reshuffles between reads.
    pending.sort(compareByDueAt);
    return pending;
  }

  /* ── Test helpers ── */

  /** Drops all state. Used between tests so cases cannot leak into each other. */
  reset(): void {
    this.runs.clear();
    this.approvals.clear();
    this.decisions.clear();
    this.claimedKeys.clear();
  }

  snapshotRuns(): RunState[] {
    return Array.from(this.runs.values(), (run) => clone(run));
  }

  snapshotApprovals(): ApprovalRequest[] {
    return Array.from(this.approvals.values(), (a) => clone(a));
  }
}

/**
 * `dueAt` is ISO 8601 but not guaranteed to be UTC-normalised, so parse rather
 * than compare the strings. An unparseable value falls back to a lexicographic
 * comparison so the ordering stays total and deterministic instead of
 * collapsing to "equal".
 */
function compareByDueAt(a: ApprovalRequest, b: ApprovalRequest): number {
  const left = Date.parse(a.dueAt);
  const right = Date.parse(b.dueAt);
  if (Number.isNaN(left) || Number.isNaN(right)) {
    if (a.dueAt < b.dueAt) return -1;
    if (a.dueAt > b.dueAt) return 1;
    return 0;
  }
  return left - right;
}

/* ═══════════════════════════ Clocks ═══════════════════════════ */

/**
 * Production time. The only place in the runtime that reads the wall clock;
 * everything else takes a `Clock` so the sandbox can be replayed exactly.
 */
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

/**
 * Frozen time for sandbox runs and tests. `advance` is the only way it moves,
 * so a run's event timeline is a function of the test, not of how long the
 * test took to execute.
 */
export class FixedClock implements Clock {
  private currentMs: number;

  constructor(iso: string) {
    const parsed = Date.parse(iso);
    if (Number.isNaN(parsed)) {
      throw new Error(`FixedClock: "${iso}" is not a parseable ISO 8601 instant`);
    }
    this.currentMs = parsed;
  }

  now(): Date {
    return new Date(this.currentMs);
  }

  /** Moves forward only; a clock that goes backwards would reorder run events. */
  advance(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) {
      throw new Error(`FixedClock.advance: expected a non-negative finite number, got ${ms}`);
    }
    this.currentMs += ms;
  }
}

/* ═══════════════════════════ Id factory ═══════════════════════════ */

/**
 * Ids are injected for the same reason time is: a sandbox run must be
 * byte-identical on a rerun, and random ids would leak into every event,
 * approval and stored run.
 *
 * With a seed the ids are sequential per prefix — `createIdFactory("seed")`
 * yields "run_seed_1", "run_seed_2", "approval_seed_1". Counting per prefix
 * rather than globally means adding a new kind of id later does not renumber
 * the existing ones and invalidate every recorded fixture. Ids stay unique
 * because the prefix is part of them.
 *
 * Without a seed, production uniqueness comes from `crypto.randomUUID()`.
 */
export function createIdFactory(seed?: string): (prefix: string) => string {
  if (seed === undefined) {
    return (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
  }

  const counters = new Map<string, number>();
  return (prefix: string) => {
    const next = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, next);
    return `${prefix}_${seed}_${next}`;
  };
}
