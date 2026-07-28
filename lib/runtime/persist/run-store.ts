/**
 * lib/runtime/persist/run-store.ts — the durable `RunStore` (ROLE_C_PLAN M0
 * storage decision; the documented M4 blocker).
 *
 * `RUNTIME_SETUP.md` §3 states the consequence of not having this in one line:
 * without durability "a paused run and its pending approval vanish on restart,
 * which defeats the approval interrupt". That is the entire justification for
 * this file. Everything else the runtime does can be re-run; a run that stopped
 * mid-workflow to ask a human a question cannot, because the question is already
 * in front of the human.
 *
 * It is a strict behavioural twin of `InMemoryRunStore`, deliberately down to
 * the error text, so a bug found in one is findable in the other. The four
 * properties that store documents as load-bearing are preserved here by
 * different means, and it is worth being explicit about which:
 *
 *   NOTHING IS SHARED BY REFERENCE — free, and stronger than the in-memory
 *   version. A write encodes to a JSON string and a read decodes to fresh
 *   objects, so there is no object for a caller to alias. There is no cache in
 *   front of these files for the same reason (see table.ts).
 *
 *   DECISIONS ARE WRITE-ONCE — a filesystem property, not a convention. The
 *   decision file is created exclusively; a second decision loses the race and
 *   is told who won and when. Across processes as well as within one.
 *
 *   IDEMPOTENCY CLAIMS ARE REAL CLAIMS — same mechanism. `claimIdempotencyKey`
 *   is the scheduler's only guarantee against firing the Friday sweep twice,
 *   and an exclusive create is the strongest form of it available without a
 *   database. Two workers, two processes, one claim.
 *
 *   RUN CREATION IS EXCLUSIVE — `createRun` cannot silently replace a live run's
 *   cursor with a fresh one, because it never overwrites.
 *
 * ORDERING differs from the in-memory store and the difference is deliberate.
 * `InMemoryRunStore` lists in insertion order, which a directory cannot
 * reproduce without recording a sequence number on every write. Runs are
 * therefore listed by `startedAt` and approvals by `dueAt`, both immutable
 * fields, with the id as a tie-break so the order is total. Stable and
 * reproducible, which is what the callers actually need; not identical, which is
 * written down in STORAGE.md rather than hidden.
 *
 * Determinism: no clock and no id generation anywhere in this file. Both arrive
 * inside the records it is handed.
 */

import { createHash } from "node:crypto";
import path from "node:path";
import type {
  ApprovalDecision,
  ApprovalRequest,
  RunState,
  RunStatus,
  RunStore,
} from "../types";
import { Table, compareByInstant, compareId, compareInstant } from "./table";

/**
 * An idempotency key is arbitrary caller-supplied text — it can hold slashes,
 * spaces, or 4KB of trigger payload — and it has to become a filename. Hashing
 * gives a bounded, always-safe name; the raw key is written INSIDE the file so
 * the directory stays inspectable and so a collision is detectable rather than
 * silent.
 */
function idempotencyFileId(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

interface IdempotencyClaim {
  key: string;
}

export class FileRunStore implements RunStore {
  private readonly runs: Table<RunState>;
  private readonly approvals: Table<ApprovalRequest>;
  private readonly decisions: Table<ApprovalDecision>;
  private readonly claims: Table<IdempotencyClaim>;

  constructor(readonly root: string) {
    this.runs = new Table<RunState>(path.join(root, "runs"), "runs");
    this.approvals = new Table<ApprovalRequest>(path.join(root, "approvals"), "approvals");
    this.decisions = new Table<ApprovalDecision>(
      path.join(root, "approval-decisions"),
      "approval_decisions",
    );
    this.claims = new Table<IdempotencyClaim>(
      path.join(root, "idempotency-keys"),
      "idempotency_keys",
    );
  }

  /* ── Runs ── */

  async createRun(state: RunState): Promise<void> {
    // Exclusive, not "check then write": two triggers racing on the same id must
    // not both believe they created the run, because the loser would carry on
    // driving a run whose cursor the winner owns.
    const created = await this.runs.create(state.runId, state);
    if (!created) {
      throw new Error(`FileRunStore.createRun: run "${state.runId}" already exists`);
    }
  }

  /**
   * Update only. An unknown id is a bug in the caller rather than a request to
   * insert, and creating the run here would sidestep the exclusivity above.
   */
  async saveRun(state: RunState): Promise<void> {
    await this.runs.update(
      state.runId,
      state,
      `FileRunStore.saveRun: unknown run "${state.runId}" — call createRun first`,
    );
  }

  async getRun(runId: string): Promise<RunState | null> {
    return this.runs.read(runId);
  }

  /** Start order, oldest first. */
  async listRuns(filter?: { agentId?: string; status?: RunStatus }): Promise<RunState[]> {
    const runs = await this.runs.all();
    const out = runs.filter((run) => {
      if (filter?.agentId !== undefined && run.agentId !== filter.agentId) return false;
      if (filter?.status !== undefined && run.status !== filter.status) return false;
      return true;
    });
    out.sort((a, b) => compareByInstant(a.startedAt, a.runId, b.startedAt, b.runId));
    return out;
  }

  /**
   * The scheduler's guarantee against double-firing (M4): a re-delivered trigger
   * claims the same key and is told to stand down.
   *
   * A hash collision would silently refuse a legitimate run, so it is checked
   * rather than assumed away — and it THROWS rather than returning false,
   * because the executor's own message for a refused-but-missing claim ("was
   * already claimed but no run was found") would send the reader looking in
   * completely the wrong place. With SHA-256 this branch is unreachable in
   * practice; it costs one string comparison to make sure it can never be
   * mysterious.
   */
  async claimIdempotencyKey(key: string): Promise<boolean> {
    const fileId = idempotencyFileId(key);
    if (await this.claims.create(fileId, { key })) return true;

    const existing = await this.claims.read(fileId);
    if (existing && existing.key !== key) {
      throw new Error(
        `FileRunStore.claimIdempotencyKey: "${key}" hashes to the same file as the ` +
          `already-claimed key "${existing.key}". This is a SHA-256 collision, which ` +
          `does not happen — suspect a hand-edited file in ${this.claims.dir}.`,
      );
    }
    return false;
  }

  /* ── Approvals ── */

  async createApproval(request: ApprovalRequest): Promise<void> {
    const created = await this.approvals.create(request.approvalId, request);
    if (!created) {
      throw new Error(
        `FileRunStore.createApproval: approval "${request.approvalId}" already exists`,
      );
    }
  }

  async getApproval(approvalId: string): Promise<ApprovalRequest | null> {
    return this.approvals.read(approvalId);
  }

  async getDecision(approvalId: string): Promise<ApprovalDecision | null> {
    return this.decisions.read(approvalId);
  }

  /**
   * Write-once, enforced by the filesystem.
   *
   * A second decision on the same approval would resume the same run twice,
   * which for an `act` step means sending the email twice. The exclusive create
   * is what makes "once" true even when the two decisions arrive in different
   * processes — the in-memory store's `Map.has` check cannot promise that, and
   * from M4 onwards two workers over one directory is the expected deployment.
   */
  async saveDecision(decision: ApprovalDecision): Promise<void> {
    if (!(await this.approvals.exists(decision.approvalId))) {
      throw new Error(
        `FileRunStore.saveDecision: unknown approval "${decision.approvalId}"`,
      );
    }

    if (await this.decisions.create(decision.approvalId, decision)) return;

    const existing = await this.decisions.read(decision.approvalId);
    throw new Error(
      existing
        ? `FileRunStore.saveDecision: approval "${decision.approvalId}" was already ` +
          `${existing.decision} by ${existing.decidedBy} at ${existing.decidedAt}`
        : `FileRunStore.saveDecision: approval "${decision.approvalId}" was already decided`,
    );
  }

  /**
   * Undecided approvals, most overdue first.
   *
   * The decision directory is listed rather than read: this answers "is there a
   * decision", and the file's existence IS the answer. Reading every decision to
   * discover it exists would triple the I/O on the screen an owner refreshes
   * most.
   */
  async listPendingApprovals(): Promise<ApprovalRequest[]> {
    const [approvals, decided] = await Promise.all([
      this.approvals.all(),
      this.decisions.ids(),
    ]);
    const settled = new Set(decided);

    const pending = approvals.filter((a) => !settled.has(a.approvalId));
    pending.sort(
      (a, b) =>
        compareInstant(a.dueAt, b.dueAt) ||
        // Same deadline: the one raised first has been waiting longest. The
        // in-memory store gets this from insertion order and a stable sort.
        compareInstant(a.createdAt, b.createdAt) ||
        compareId(a.approvalId, b.approvalId),
    );
    return pending;
  }

  /* ── Development helper ── */

  /**
   * Drops every run, approval, decision and idempotency claim on disk.
   *
   * Destructive and irreversible, and unlike the in-memory `reset()` it destroys
   * state that outlives the process — which is why it is only ever reached
   * through `RuntimeSession.reset()`.
   */
  async reset(): Promise<void> {
    await Promise.all([
      this.runs.clear(),
      this.approvals.clear(),
      this.decisions.clear(),
      this.claims.clear(),
    ]);
  }
}
