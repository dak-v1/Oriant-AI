/**
 * lib/runtime/persist/pg/run-store.ts — `RunStore` over Postgres, and the point
 * at which three guarantees stop being conventions.
 *
 * The file store earns its exclusivity from the filesystem: an exclusive create
 * is what makes "one run per trigger" and "one decision per approval" true
 * across processes rather than within one (persist/run-store.ts). Postgres has
 * the same primitives with sharper edges, and STORAGE.md §7 names the exchange
 * rate exactly:
 *
 *   exclusive create of `runs/<id>.json`        INSERT … ON CONFLICT DO NOTHING, check the count
 *   exclusive create of a decision file         INSERT against the primary key, catch 23505, read the winner
 *   exclusive create of an idempotency file     INSERT … ON CONFLICT DO NOTHING, check the count
 *
 * ONE SHAPE CHANGE, and it is the one §6.5 asked for. Run events live in their
 * own table keyed `(run_id, sequence)` and they APPEND. The file store rewrote
 * every event of a run on every step because a run is one file; here `saveRun`
 * writes the run row and inserts only the events past the ones already stored.
 * The row and its new events go in ONE transaction, because a crash between them
 * would leave a cursor that has moved past events nobody recorded — and the
 * event stream is the owner's only account of why a run paused.
 *
 * WHAT DELIBERATELY DOES NOT CHANGE. The codec still applies (util.ts says why).
 * Listing order is still DERIVED from an immutable field with the id as
 * tie-break, so the two stores agree. And every error message is the file
 * store's with the class name swapped: a bug found in one has to be findable in
 * the other, and M4's checks read these strings — M4-17 asserts that a refused
 * second decision names the owner who won and what they decided.
 *
 * `saveRun` UPDATES and refuses an unknown id rather than upserting. That is the
 * file store's behaviour and the in-memory store's, and the reason is the same
 * in all three: inserting here would sidestep `createRun`'s exclusivity and let
 * a lost caller replace a live run's cursor with a fresh one.
 *
 * Deep-clone semantics come free, exactly as they do on the file path — a read
 * decodes fresh objects out of a row, so no caller can hold an alias of stored
 * state. Nothing is cached in front of these queries, for that reason.
 *
 * NO `reset()`, unlike the file store. Wiping shared state is not a per-store
 * concern once the tables share a database: `truncateAll` in schema.ts knows
 * every table, and `createPostgresStores` is what exposes it.
 *
 * Determinism: no clock and no id generation in this file. Both arrive inside
 * the records it is handed. (`oriant_idempotency_keys.claimed_at` defaults to
 * `now()` in the DDL, and nothing reads it.)
 */

import type postgres from "postgres";
import type {
  ApprovalDecision,
  ApprovalRequest,
  RiskLevel,
  RunEvent,
  RunState,
  RunStatus,
  RunStore,
  ToolInvocation,
  TriggerEvent,
} from "../../types";
import type { Sql } from "./client";
import { fromJsonb, isoFrom, isoRequired, toJsonb } from "./util";

/** The handle inside `sql.begin`; narrower than `Sql`, so it needs its own name. */
type Tx = postgres.TransactionSql<Record<string, never>>;

/**
 * The codec's `entity` tag, one per jsonb COLUMN rather than one per row.
 *
 * A file record is a single envelope wrapping the whole record; a row is several
 * independent columns, each carrying its own. Naming them separately is what
 * keeps `fromJsonb`'s entity check worth having — it catches a `context` value
 * read as a `trigger`, which one shared name could not.
 */
const RUN_TRIGGER = "run_trigger";
const RUN_CONTEXT = "run_context";
const RUN_EVENT = "run_event";
const APPROVAL_INVOCATION = "approval_invocation";
const APPROVAL_LIMITS = "approval_breached_limits";
const DECISION_EDITED_ARGS = "decision_edited_args";

/** SQLSTATEs this store translates into the file store's wording. */
const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";

/**
 * postgres.js raises a `PostgresError` carrying the SQLSTATE. Read structurally
 * rather than with `instanceof`: the driver's error class would have to be
 * imported as a value purely to compare against, and an error re-thrown by a
 * wrapper would fail that comparison while still carrying the code.
 */
function sqlState(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const { code } = error as { code?: unknown };
  return typeof code === "string" ? code : null;
}

/* ═══════════════════════════ Row shapes ═══════════════════════════ */

/**
 * `timestamptz` arrives as Date and the runtime types it as an ISO string, so
 * every one of these goes through `isoFrom`/`isoRequired` rather than being
 * read directly. `jsonb` arrives already parsed, which is why these are
 * `unknown` — the codec, not the driver, decides what the value means.
 */
interface RunRow {
  run_id: string;
  agent_id: string;
  agent_version: number;
  workflow_id: string;
  status: string;
  cursor: number;
  trigger: unknown;
  context: unknown;
  pending_approval_id: string | null;
  started_at: Date | string;
  ended_at: Date | string | null;
  failure: string | null;
}

interface EventRow {
  run_id: string;
  sequence: number;
  event: unknown;
}

interface ApprovalRow {
  approval_id: string;
  run_id: string;
  agent_id: string;
  workflow_id: string;
  step_id: string;
  invocation: unknown;
  reason: string;
  risk: string;
  breached_limits: unknown;
  approval_owner: string;
  created_at: Date | string;
  due_at: Date | string;
}

interface DecisionRow {
  approval_id: string;
  decision: string;
  decided_by: string;
  decided_at: Date | string;
  reason: string | null;
  edited_args: unknown;
}

/* ═══════════════════════════ Decoding ═══════════════════════════ */

function decodeEvent(row: EventRow): RunEvent {
  return fromJsonb<RunEvent>(
    RUN_EVENT,
    row.event,
    `oriant_run_events(run_id=${row.run_id}, sequence=${row.sequence})`,
  );
}

/**
 * A run row plus its already-ordered events.
 *
 * `status` and `risk` are `text` columns cast back to their unions without a
 * membership check, which is the file store's behaviour too: the codec decodes
 * structure and does not validate the runtime's vocabulary. The only way either
 * column holds something outside the union is a hand-edited database.
 */
function decodeRun(row: RunRow, events: RunEvent[]): RunState {
  const where = `oriant_runs(run_id=${row.run_id})`;
  return {
    runId: row.run_id,
    agentId: row.agent_id,
    agentVersion: row.agent_version,
    workflowId: row.workflow_id,
    status: row.status as RunStatus,
    trigger: fromJsonb<TriggerEvent>(RUN_TRIGGER, row.trigger, `${where}.trigger`),
    cursor: row.cursor,
    context: fromJsonb<Record<string, unknown>>(RUN_CONTEXT, row.context, `${where}.context`),
    events,
    pendingApprovalId: row.pending_approval_id,
    startedAt: isoRequired(row.started_at, `${where}.started_at`),
    endedAt: isoFrom(row.ended_at),
    failure: row.failure,
  };
}

function decodeApproval(row: ApprovalRow): ApprovalRequest {
  const where = `oriant_approvals(approval_id=${row.approval_id})`;
  return {
    approvalId: row.approval_id,
    runId: row.run_id,
    agentId: row.agent_id,
    workflowId: row.workflow_id,
    stepId: row.step_id,
    invocation: fromJsonb<ToolInvocation>(
      APPROVAL_INVOCATION,
      row.invocation,
      `${where}.invocation`,
    ),
    reason: row.reason,
    risk: row.risk as RiskLevel,
    breachedLimits: fromJsonb<string[]>(
      APPROVAL_LIMITS,
      row.breached_limits,
      `${where}.breached_limits`,
    ),
    approvalOwner: row.approval_owner,
    createdAt: isoRequired(row.created_at, `${where}.created_at`),
    dueAt: isoRequired(row.due_at, `${where}.due_at`),
  };
}

function decodeDecision(row: DecisionRow): ApprovalDecision {
  const where = `oriant_approval_decisions(approval_id=${row.approval_id})`;
  const decision: ApprovalDecision = {
    approvalId: row.approval_id,
    decision: row.decision as ApprovalDecision["decision"],
    decidedBy: row.decided_by,
    decidedAt: isoRequired(row.decided_at, `${where}.decided_at`),
  };
  // Optional in the runtime type, nullable in the column. An absent value stays
  // ABSENT rather than becoming an explicit null, so a decision read back here
  // is the same object shape one read from the file store.
  if (row.reason !== null) decision.reason = row.reason;
  if (row.edited_args !== null && row.edited_args !== undefined) {
    decision.editedArgs = fromJsonb<Record<string, unknown>>(
      DECISION_EDITED_ARGS,
      row.edited_args,
      `${where}.edited_args`,
    );
  }
  return decision;
}

/* ═══════════════════════════ Store ═══════════════════════════ */

export class PostgresRunStore implements RunStore {
  constructor(private readonly sql: Sql) {}

  /**
   * Every structured value crosses as a `jsonb` parameter carrying the codec's
   * tagged encoding. `toJsonb` produces `JSON.parse` output, which is a
   * `JSONValue` by construction — the cast states that rather than discovering
   * it, and it is the only place in this file that asserts a type.
   */
  private jsonb(entity: string, record: unknown): postgres.Parameter {
    return this.sql.json(toJsonb(entity, record) as postgres.JSONValue);
  }

  /**
   * Appends `events[from…]` at sequences `from…`.
   *
   * `ON CONFLICT (run_id, sequence) DO NOTHING` makes a retry after a partly
   * applied write harmless: an event already stored under its sequence IS the
   * event being offered, because a run's list only ever grows.
   */
  private async insertEvents(
    tx: Tx,
    runId: string,
    events: RunEvent[],
    from: number,
  ): Promise<void> {
    // A run's event list only ever grows (executor.ts appends and never edits),
    // so being offered FEWER events than are stored means the caller is working
    // from a stale run. Returning quietly would persist the caller's other
    // fields while silently discarding its events; the file store cannot reach
    // this state because it rewrites the array wholesale. Fail loudly instead
    // of writing a half-truth.
    if (events.length < from) {
      throw new Error(
        `PostgresRunStore.saveRun: run "${runId}" has ${from} stored events but only ` +
          `${events.length} were offered. Events append, they do not shrink — this ` +
          `caller is holding a stale run.`,
      );
    }
    if (from >= events.length) return;

    const rows = events.slice(from).map((event, offset) => ({
      run_id: runId,
      sequence: from + offset,
      event: this.jsonb(RUN_EVENT, event),
    }));

    await tx`
      INSERT INTO oriant_run_events ${tx(rows, "run_id", "sequence", "event")}
      ON CONFLICT (run_id, sequence) DO NOTHING
    `;
  }

  /* ── Runs ── */

  /**
   * Exclusive, not "check then insert": two triggers racing on the same id must
   * not both believe they created the run, because the loser would carry on
   * driving a run whose cursor the winner owns. `ON CONFLICT DO NOTHING` with
   * `RETURNING` answers that in one statement — no row back means no row went in.
   *
   * The run and its events land together. Throwing rolls the transaction back,
   * so a refused duplicate leaves nothing behind.
   */
  async createRun(state: RunState): Promise<void> {
    await this.sql.begin(async (tx) => {
      const inserted = await tx`
        INSERT INTO oriant_runs (
          run_id, agent_id, agent_version, workflow_id, status, "cursor",
          trigger, context, pending_approval_id, started_at, ended_at, failure
        ) VALUES (
          ${state.runId}, ${state.agentId}, ${state.agentVersion}, ${state.workflowId},
          ${state.status}, ${state.cursor},
          ${this.jsonb(RUN_TRIGGER, state.trigger)}, ${this.jsonb(RUN_CONTEXT, state.context)},
          ${state.pendingApprovalId}, ${state.startedAt}, ${state.endedAt}, ${state.failure}
        )
        ON CONFLICT (run_id) DO NOTHING
        RETURNING run_id
      `;

      if (inserted.length === 0) {
        throw new Error(`PostgresRunStore.createRun: run "${state.runId}" already exists`);
      }

      await this.insertEvents(tx, state.runId, state.events, 0);
    });
  }

  /**
   * Update only. An unknown id is a bug in the caller rather than a request to
   * insert, and creating the run here would sidestep the exclusivity above.
   *
   * The run carries its WHOLE event array; the table holds what has already been
   * written. Only the tail is sent (STORAGE.md §7 step 3), which is the entire
   * reason the events were split out of the run — §6.5 is about a few hundred
   * events being rewritten on every step boundary.
   */
  async saveRun(state: RunState): Promise<void> {
    await this.sql.begin(async (tx) => {
      const updated = await tx`
        UPDATE oriant_runs SET
          agent_id            = ${state.agentId},
          agent_version       = ${state.agentVersion},
          workflow_id         = ${state.workflowId},
          status              = ${state.status},
          "cursor"            = ${state.cursor},
          trigger             = ${this.jsonb(RUN_TRIGGER, state.trigger)},
          context             = ${this.jsonb(RUN_CONTEXT, state.context)},
          pending_approval_id = ${state.pendingApprovalId},
          started_at          = ${state.startedAt},
          ended_at            = ${state.endedAt},
          failure             = ${state.failure}
        WHERE run_id = ${state.runId}
        RETURNING run_id
      `;

      if (updated.length === 0) {
        throw new Error(
          `PostgresRunStore.saveRun: unknown run "${state.runId}" — call createRun first`,
        );
      }

      // Counted inside the transaction, so the count and the insert cannot be
      // separated by another writer's append.
      const counted = await tx<{ stored: number }[]>`
        SELECT count(*)::int AS stored FROM oriant_run_events WHERE run_id = ${state.runId}
      `;
      const first: { stored: number } | undefined = counted[0];

      await this.insertEvents(tx, state.runId, state.events, first?.stored ?? 0);
    });
  }

  /**
   * ONE SNAPSHOT, TWO STATEMENTS. The run row and its events are read inside a
   * transaction so they cannot come from either side of a concurrent
   * `saveRun`. Read autocommit, the pair can disagree: the events would include
   * `approval_resolved` while the row still says `awaiting_approval`, because
   * the write landed between the two SELECTs.
   *
   * The file store cannot reach that state — it reads one atomically-renamed
   * file — so this is a divergence introduced by splitting the run across two
   * tables, and it has to be closed here rather than tolerated.
   */
  async getRun(runId: string): Promise<RunState | null> {
    return this.sql.begin(async (tx) => {
      const runs = await tx<RunRow[]>`
        SELECT run_id, agent_id, agent_version, workflow_id, status, "cursor",
               trigger, context, pending_approval_id, started_at, ended_at, failure
        FROM oriant_runs
        WHERE run_id = ${runId}
      `;
      const row: RunRow | undefined = runs[0];
      if (row === undefined) return null;

      const events = await tx<EventRow[]>`
        SELECT run_id, sequence, event
        FROM oriant_run_events
        WHERE run_id = ${runId}
        ORDER BY sequence
      `;

      return decodeRun(row, events.map(decodeEvent));
    }) as Promise<RunState | null>;
  }

  /**
   * Start order, oldest first — `(started_at, run_id)`, which is the index
   * `oriant_runs_order_idx` exists for and the same total order the file store
   * derives in memory.
   *
   * A null filter parameter means "unfiltered". Postgres plans an unnamed
   * statement with the bound values in hand, so the disabled arm is folded away
   * rather than costing a scan, and the `(agent_id)` / `(status)` indexes stay
   * reachable.
   *
   * The events are fetched in ONE query and grouped in memory. Per-run queries
   * here would be the N+1 that makes the Workspace list slower the more it has
   * to show.
   */
  async listRuns(filter?: { agentId?: string; status?: RunStatus }): Promise<RunState[]> {
    const agentId = filter?.agentId ?? null;
    const status = filter?.status ?? null;

    // Transactional for the same reason getRun is, and more so: the window
    // between the two statements spans every row in the list, so an unwrapped
    // read grows more likely to tear the more the Workspace has to show.
    return this.sql.begin(async (tx) => {
      const runs = await tx<RunRow[]>`
        SELECT run_id, agent_id, agent_version, workflow_id, status, "cursor",
               trigger, context, pending_approval_id, started_at, ended_at, failure
        FROM oriant_runs
        WHERE (${agentId}::text IS NULL OR agent_id = ${agentId})
          AND (${status}::text IS NULL OR status = ${status})
        ORDER BY started_at, run_id COLLATE "C"
      `;
      if (runs.length === 0) return [];

      const runIds = runs.map((row) => row.run_id);
      const events = await tx<EventRow[]>`
        SELECT run_id, sequence, event
        FROM oriant_run_events
        WHERE run_id IN ${tx(runIds)}
        ORDER BY run_id, sequence
      `;

      // Ordered by (run_id, sequence), so appending in scan order leaves every
      // bucket in sequence order without a second sort.
      const byRun = new Map<string, RunEvent[]>();
      for (const row of events) {
        const bucket = byRun.get(row.run_id);
        if (bucket === undefined) byRun.set(row.run_id, [decodeEvent(row)]);
        else bucket.push(decodeEvent(row));
      }

      return runs.map((row) => decodeRun(row, byRun.get(row.run_id) ?? []));
    }) as Promise<RunState[]>;
  }

  /**
   * The scheduler's guarantee against double-firing (M4): a re-delivered trigger
   * claims the same key and is told to stand down.
   *
   * The primary key IS the claim, and it is un-raceable — two workers inserting
   * the same key produce exactly one inserted row. The file store had to hash the
   * key into a filename and check for a collision on the way out; here the raw
   * key is the key, so that branch does not exist.
   */
  async claimIdempotencyKey(key: string): Promise<boolean> {
    const claimed = await this.sql`
      INSERT INTO oriant_idempotency_keys (key) VALUES (${key})
      ON CONFLICT DO NOTHING
      RETURNING key
    `;
    return claimed.length > 0;
  }

  /* ── Approvals ── */

  async createApproval(request: ApprovalRequest): Promise<void> {
    const inserted = await this.sql`
      INSERT INTO oriant_approvals (
        approval_id, run_id, agent_id, workflow_id, step_id, invocation,
        reason, risk, breached_limits, approval_owner, created_at, due_at
      ) VALUES (
        ${request.approvalId}, ${request.runId}, ${request.agentId}, ${request.workflowId},
        ${request.stepId}, ${this.jsonb(APPROVAL_INVOCATION, request.invocation)},
        ${request.reason}, ${request.risk},
        ${this.jsonb(APPROVAL_LIMITS, request.breachedLimits)},
        ${request.approvalOwner}, ${request.createdAt}, ${request.dueAt}
      )
      ON CONFLICT (approval_id) DO NOTHING
      RETURNING approval_id
    `;

    if (inserted.length === 0) {
      throw new Error(
        `PostgresRunStore.createApproval: approval "${request.approvalId}" already exists`,
      );
    }
  }

  async getApproval(approvalId: string): Promise<ApprovalRequest | null> {
    const rows = await this.sql<ApprovalRow[]>`
      SELECT approval_id, run_id, agent_id, workflow_id, step_id, invocation,
             reason, risk, breached_limits, approval_owner, created_at, due_at
      FROM oriant_approvals
      WHERE approval_id = ${approvalId}
    `;
    const row: ApprovalRow | undefined = rows[0];
    return row === undefined ? null : decodeApproval(row);
  }

  async getDecision(approvalId: string): Promise<ApprovalDecision | null> {
    const rows = await this.sql<DecisionRow[]>`
      SELECT approval_id, decision, decided_by, decided_at, reason, edited_args
      FROM oriant_approval_decisions
      WHERE approval_id = ${approvalId}
    `;
    const row: DecisionRow | undefined = rows[0];
    return row === undefined ? null : decodeDecision(row);
  }

  /**
   * Write-once, enforced by the primary key rather than by a check.
   *
   * A second decision on the same approval would resume the same run twice,
   * which for an `act` step means sending the customer the same email twice.
   * There is no read before the write, so there is no window between them: the
   * loser of a race gets a unique violation, and only then is the winner read —
   * to say who decided what and when, because an owner told only "refused"
   * cannot tell a duplicate click from a bug.
   *
   * The foreign key catches the other case. An approval that does not exist
   * raises 23503, which is accurate and unreadable, so it is restated in the
   * file store's words.
   */
  async saveDecision(decision: ApprovalDecision): Promise<void> {
    try {
      await this.sql`
        INSERT INTO oriant_approval_decisions (
          approval_id, decision, decided_by, decided_at, reason, edited_args
        ) VALUES (
          ${decision.approvalId}, ${decision.decision}, ${decision.decidedBy},
          ${decision.decidedAt}, ${decision.reason ?? null},
          ${
            decision.editedArgs === undefined
              ? null
              : this.jsonb(DECISION_EDITED_ARGS, decision.editedArgs)
          }
        )
      `;
    } catch (error) {
      const state = sqlState(error);

      if (state === UNIQUE_VIOLATION) {
        const existing = await this.getDecision(decision.approvalId);
        throw new Error(
          existing
            ? `PostgresRunStore.saveDecision: approval "${decision.approvalId}" was already ` +
              `${existing.decision} by ${existing.decidedBy} at ${existing.decidedAt}`
            : `PostgresRunStore.saveDecision: approval "${decision.approvalId}" was already decided`,
        );
      }

      if (state === FOREIGN_KEY_VIOLATION) {
        throw new Error(
          `PostgresRunStore.saveDecision: unknown approval "${decision.approvalId}"`,
        );
      }

      throw error;
    }
  }

  /**
   * Undecided approvals, most overdue first.
   *
   * The anti-join answers "is there a decision" without reading one: the row's
   * absence IS the answer, which is the same reasoning that made the file store
   * list the decision directory rather than read it. This is the screen an
   * approval owner refreshes most.
   *
   * Same deadline: the one raised first has been waiting longest, then the id, so
   * the order is total and matches the file store's.
   */
  async listPendingApprovals(): Promise<ApprovalRequest[]> {
    const rows = await this.sql<ApprovalRow[]>`
      SELECT a.approval_id, a.run_id, a.agent_id, a.workflow_id, a.step_id, a.invocation,
             a.reason, a.risk, a.breached_limits, a.approval_owner, a.created_at, a.due_at
      FROM oriant_approvals a
      LEFT JOIN oriant_approval_decisions d ON d.approval_id = a.approval_id
      WHERE d.approval_id IS NULL
      ORDER BY a.due_at, a.created_at, a.approval_id COLLATE "C"
    `;
    return rows.map(decodeApproval);
  }
}
