/**
 * lib/runtime/pipeline/source.ts — where a handoff comes FROM.
 *
 * Role B finalises a workforce plan by writing one row into Supabase's
 * `role_c_handoffs` and then stops. Nothing on Role C's side ever looked: a
 * human opened the table, copied the `payload` column, and pasted it into
 * `POST /api/runtime/pipeline`. That is not an integration — it is a person
 * acting as a message bus, and it stops working the first afternoon nobody is
 * watching. This module is the missing half.
 *
 * THE PROTOCOL IS THE MIGRATION'S, NOT THIS FILE'S INVENTION.
 * `supabase/migrations/20260801_role_c_handoffs.sql` constrains `status` to
 * 'ready' | 'consumed' | 'failed', adds `consumed_at timestamptz`, and makes
 * `workforce_plan_id` unique. Read together those three say:
 *
 *   status 'ready'      waiting for Role C, and the ONLY collectable state
 *   status 'consumed'   a pass has taken it: in flight, or finished
 *   status 'failed'     a pass did not complete, and nothing will run it again
 *                       until Role B finalises afresh
 *
 * STATUS IS THE ONLY THING THAT GATES COLLECTION. `consumed_at` is a timestamp
 * for humans reading the table; nothing reads it back. That is deliberate, and
 * it is the difference between this working twice and working once — see the
 * release rule below.
 *
 * CLAIMING IS A CONDITIONAL UPDATE, AND THAT IS THE ENTIRE DESIGN.
 *
 * Two server processes polling this table must not both collect the same row
 * and both activate the same workforce — that would register every trigger
 * twice and put two deployments live from one approval. A read-then-write
 * ("is it ready? then take it") cannot prevent that: both readers see 'ready'.
 * So the claim is one statement whose WHERE clause tests the very column it
 * writes:
 *
 *   UPDATE role_c_handoffs SET status = 'consumed', consumed_at = $now
 *    WHERE id = $id AND status = 'ready'
 *   RETURNING *
 *
 * Postgres serialises the two writers on the row lock and re-evaluates the
 * predicate for the loser, which now sees 'consumed' and matches nothing. Zero
 * rows returned means SOMEBODY ELSE WON — never an error, and never a reason to
 * run anyway. The rest of this runtime is built on exactly this shape
 * (docs/STORAGE.md §4: the idempotency-key claim, the write-once
 * approval-decision key, `FOR UPDATE SKIP LOCKED` on the job queue).
 *
 * THE RELEASE RULE, AND THE BUG IT EXISTS TO PREVENT.
 *
 * Role B's `finalize-handoff` re-finalises a revised plan by patching the SAME
 * row — `workforce_plan_id` is UNIQUE — and it sets `status` back to 'ready'
 * and nothing else. So `status` back to 'ready' has to be sufficient, on its
 * own, to make a row collectable again from ANY terminal state. Every other
 * column must therefore be inert.
 *
 * An earlier draft of this file claimed by moving `consumed_at` and leaving
 * `status` at 'ready', with both the scan and the claim also testing
 * `consumed_at IS NULL`. That reads fine for one cycle and then wedges: a
 * consumed row keeps its `consumed_at` forever, Role B's re-finalise does not
 * clear it, and the re-finalised row — 'ready', but with a stale timestamp —
 * was invisible to the scan and unclaimable by the claim, permanently. The
 * first activation would work and every revision after it would silently never
 * arrive. Moving the claim onto `status` is what makes the re-finalise a
 * complete release, and it stays inside the CHECK vocabulary because 'consumed'
 * is a value that constraint already admits.
 *
 * A pass that dies mid-flight leaves the row 'consumed' with nothing running.
 * That is recoverable by the same one move — Role B re-finalises, the row reads
 * 'ready' again — which is exactly why the release rule has to hold.
 *
 * WHICH CLIENT, AND WHY BOTH. `lib/server/planner/db.ts` is the existing access
 * path for this table and `roleCHandoffs.update()` is used verbatim for the two
 * terminal marks. Its accessors filter on `id` alone, though, so neither the
 * pending scan (a filter on `status`) nor the claim (a conditional update) can
 * be expressed through them. Those two go through `getSupabaseAdmin()` from
 * `lib/server/supabase.ts` — the same PostgREST endpoint, the same service-role
 * key, the same table. One access path, two spellings, rather than a second
 * connection story invented here.
 */

import type { WorkforceHandoffPayload } from "../../plan/ingest/types";
import { roleCHandoffs } from "../../server/planner/db";
import { getSupabaseAdmin, SupabaseConfigurationError } from "../../server/supabase";
import type { Clock } from "../types";

const TABLE = "role_c_handoffs";

/** How many waiting rows one scan will look at. Nothing here paginates. */
const DEFAULT_SCAN_LIMIT = 50;

/* ═══════════════════════════ The contract ═══════════════════════════ */

/** One handoff, read and shape-checked, ready to hand to `runPipeline`. */
export interface CollectedHandoff {
  id: string;
  workforcePlanId: string;
  organizationId: string;
  idempotencyKey: string;
  payload: WorkforceHandoffPayload;
  status: string;
  createdAt: string;
}

/** A waiting row whose `payload` is not a handoff. Reported, never run. */
export interface UnreadableHandoff {
  id: string;
  workforcePlanId: string;
  reason: string;
}

/**
 * The result of a scan: what can be run, and what is stuck.
 *
 * Two buckets rather than one list because a malformed row is neither
 * collectable nor invisible. Dropping it silently would show an operator an
 * empty queue while Role B believes they deposited something; returning it
 * alongside the runnable rows would invite a caller to try to run it.
 */
export interface PendingScan {
  collectable: CollectedHandoff[];
  unreadable: UnreadableHandoff[];
}

export interface HandoffSource {
  /**
   * Everything waiting for Role C, oldest first.
   *
   * READS ONLY — no row changes state here, including the malformed ones. An
   * earlier draft retired unreadable rows on this path to stop them being
   * reported forever, which made a GET destructive: a prefetch, an uptime
   * monitor, or a browser reload would move rows to a terminal state that only
   * a Role B re-finalise can undo, and one shape drift on Role B's side would
   * retire the whole queue the first time anyone opened the page. Retirement
   * belongs in `claim()`, which is the write path by design and already does
   * it.
   */
  pending(): Promise<PendingScan>;
  /**
   * Take exclusive ownership of one handoff.
   *
   * `null` means the claim did not land: the row is gone, already consumed, or
   * another process got there first. It is a normal outcome of two collectors
   * racing, not a failure — the caller stops and does nothing.
   *
   * Throws `HandoffPayloadError` when the row IS claimed but its payload turns
   * out not to be a handoff. The row is marked 'failed' first, so the throw
   * describes a state already recorded; returning `null` instead would tell the
   * caller "somebody else won", which is a different and untrue story.
   */
  claim(id: string): Promise<CollectedHandoff | null>;
  /** A pipeline pass completed. This handoff is done, forever. */
  markConsumed(id: string): Promise<void>;
  /** A pipeline pass did not complete. Releases the claim; see the header. */
  markFailed(id: string, reason: string): Promise<void>;
}

/** A claimed row that cannot be handed on. Carries the row id so the caller can name it. */
export class HandoffPayloadError extends Error {
  readonly handoffId: string;

  constructor(handoffId: string, reason: string) {
    super(`Handoff ${handoffId} was marked failed: ${reason}`);
    this.name = "HandoffPayloadError";
    this.handoffId = handoffId;
  }
}

/* ═══════════════════════════ Payload validation ═══════════════════════════ */

/**
 * `payload` is a jsonb column: Postgres guarantees it is JSON and nothing more.
 * `ingestHandoff` walks `agents[].required_tools` and `integrations[].status`
 * without checking either, so a hand-seeded or legacy row takes the collector
 * down with a TypeError from four frames deep in the adapter. Checking the
 * shape here turns that into a sentence somebody can act on.
 */
type PayloadRead =
  | { ok: true; payload: WorkforceHandoffPayload }
  | { ok: false; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return typeof value;
}

function readPayload(value: unknown): PayloadRead {
  if (!isRecord(value)) {
    return { ok: false, reason: `the payload column holds ${describe(value)}, not an object` };
  }

  const problems: string[] = [];

  if (value.handoff_type !== "workforce_plan") {
    problems.push(
      `handoff_type is ${JSON.stringify(value.handoff_type)}, expected "workforce_plan"`,
    );
  }
  if (typeof value.generated_at !== "string") problems.push("generated_at is not a string");

  const plan = value.workforce_plan;
  if (!isRecord(plan)) {
    problems.push(`workforce_plan is ${describe(plan)}, not an object`);
  } else {
    if (typeof plan.id !== "string") problems.push("workforce_plan.id is not a string");
    if (typeof plan.version !== "number") problems.push("workforce_plan.version is not a number");
    if (typeof plan.current_version !== "number") {
      problems.push("workforce_plan.current_version is not a number");
    }
    if (typeof plan.status !== "string") problems.push("workforce_plan.status is not a string");
  }

  const organization = value.organization;
  if (!isRecord(organization) || typeof organization.id !== "string") {
    problems.push("organization.id is missing");
  }

  const agents = value.agents;
  if (!Array.isArray(agents)) {
    problems.push(`agents is ${describe(agents)}, not an array`);
  } else {
    agents.forEach((agent: unknown, index: number) => {
      if (!isRecord(agent)) {
        problems.push(`agents[${index}] is ${describe(agent)}, not an object`);
        return;
      }
      if (typeof agent.agent_key !== "string") problems.push(`agents[${index}].agent_key is not a string`);
      if (typeof agent.agent_type !== "string") problems.push(`agents[${index}].agent_type is not a string`);
      if (!isRecord(agent.config)) problems.push(`agents[${index}].config is not an object`);
      const tools = agent.required_tools;
      if (!Array.isArray(tools) || tools.some((tool: unknown) => typeof tool !== "string")) {
        problems.push(`agents[${index}].required_tools is not an array of strings`);
      }
    });
  }

  const integrations = value.integrations;
  if (!Array.isArray(integrations)) {
    problems.push(`integrations is ${describe(integrations)}, not an array`);
  } else {
    integrations.forEach((integration: unknown, index: number) => {
      if (!isRecord(integration)) {
        problems.push(`integrations[${index}] is ${describe(integration)}, not an object`);
        return;
      }
      if (typeof integration.tool_key !== "string") {
        problems.push(`integrations[${index}].tool_key is not a string`);
      }
      if (typeof integration.status !== "string") {
        problems.push(`integrations[${index}].status is not a string`);
      }
    });
  }

  if (problems.length === 0) {
    return { ok: true, payload: value as unknown as WorkforceHandoffPayload };
  }

  // Truncated: a payload that is wrong in forty places is wrong in the first
  // three, and an unreadable error is as good as none.
  const shown = problems.slice(0, 4).join("; ");
  const rest = problems.length > 4 ? ` (and ${problems.length - 4} more)` : "";
  return { ok: false, reason: `${shown}${rest}` };
}

/* ═══════════════════════════ Supabase ═══════════════════════════ */

/** The columns this module reads. Mirrors `RoleCHandoff` in lib/server/planner/types.ts. */
interface HandoffRow {
  id: string;
  organization_id: string;
  workforce_plan_id: string;
  idempotency_key: string;
  payload: unknown;
  status: string;
  consumed_at: string | null;
  created_at: string;
}

function toCollected(row: HandoffRow, payload: WorkforceHandoffPayload): CollectedHandoff {
  return {
    id: row.id,
    workforcePlanId: row.workforce_plan_id,
    organizationId: row.organization_id,
    idempotencyKey: row.idempotency_key,
    payload,
    status: row.status,
    createdAt: row.created_at,
  };
}

export interface SupabaseHandoffSourceOptions {
  /** Injected because lib/runtime never reads a wall clock (M3 determinism). */
  clock: Clock;
  /** Rows examined per scan. */
  limit?: number;
}

export class SupabaseHandoffSource implements HandoffSource {
  private readonly clock: Clock;
  private readonly limit: number;

  constructor(options: SupabaseHandoffSourceOptions) {
    this.clock = options.clock;
    this.limit = options.limit ?? DEFAULT_SCAN_LIMIT;
  }

  async pending(): Promise<PendingScan> {
    const rows = await this.waitingRows();
    const collectable: CollectedHandoff[] = [];
    const unreadable: UnreadableHandoff[] = [];

    for (const row of rows) {
      const read = readPayload(row.payload);
      if (!read.ok) {
        // Reported, not retired. See `pending()` on the interface: this path
        // writes nothing, so looking at the queue can never change it.
        unreadable.push({
          id: row.id,
          workforcePlanId: row.workforce_plan_id,
          reason: `The stored payload is not a workforce handoff: ${read.reason}`,
        });
        continue;
      }
      collectable.push(toCollected(row, read.payload));
    }

    return { collectable, unreadable };
  }

  async claim(id: string): Promise<CollectedHandoff | null> {
    const client = this.client();
    const at = this.clock.now().toISOString();

    // See the header. The predicate tests `status`, which is the column this
    // statement writes, so a second claimant re-evaluating it matches nothing.
    // `.select()` is what makes the affected rows observable.
    const { data, error } = await client
      .from(TABLE)
      .update({ status: "consumed", consumed_at: at, updated_at: at })
      .eq("id", id)
      .eq("status", "ready")
      .select("*");

    if (error) {
      throw new Error(`Claiming handoff ${id} from ${TABLE} failed: ${error.message}`);
    }

    const rows = (data ?? []) as HandoffRow[];
    const row = rows[0];
    // Zero rows affected. Not an error: the row was consumed, failed, deleted,
    // or another collector claimed it between the scan and this statement.
    if (!row) return null;

    const read = readPayload(row.payload);
    if (!read.ok) {
      const reason = `The stored payload is not a workforce handoff: ${read.reason}`;
      await this.markFailed(id, reason);
      throw new HandoffPayloadError(id, reason);
    }

    return toCollected(row, read.payload);
  }

  async markConsumed(id: string): Promise<void> {
    const at = this.clock.now().toISOString();
    // `claim()` already wrote 'consumed'; this records when the pass finished.
    // Re-asserting the status rather than assuming it keeps the method true to
    // its name for any caller that reaches it without having claimed.
    await roleCHandoffs.update(id, { status: "consumed", updated_at: at });
  }

  async markFailed(id: string, reason: string): Promise<void> {
    const at = this.clock.now().toISOString();
    // `consumed_at` is left where the claim put it. It is a record of when a
    // pass took this row, which stays true, and nothing reads it back — status
    // alone decides collectability, so leaving it cannot wedge anything.
    await roleCHandoffs.update(id, { status: "failed", updated_at: at });
    // The reason is not persisted, and that is a gap rather than a decision:
    // `role_c_handoffs` has no column for it, and writing into `payload` would
    // put Role C's words inside Role B's record of what Role B sent. It is
    // returned to the caller and logged here; a `failure_reason text` column is
    // a one-line migration on the side that owns the table.
    console.warn(`[role-c/collect] handoff ${id} marked failed: ${reason}`);
  }

  private client() {
    const client = getSupabaseAdmin();
    if (!client) throw new SupabaseConfigurationError();
    return client;
  }

  /** Every row whose status says it is waiting, oldest first. */
  private async waitingRows(): Promise<HandoffRow[]> {
    const client = this.client();
    const { data, error } = await client
      .from(TABLE)
      .select("*")
      // 'ready' is the whole predicate. A claimed row reads 'consumed', so it
      // is already excluded, and a stale `consumed_at` on a re-finalised row
      // must NOT exclude it — see the release rule in the header.
      .eq("status", "ready")
      .order("created_at", { ascending: true })
      .limit(this.limit);

    if (error) throw new Error(`Reading ${TABLE} failed: ${error.message}`);
    return (data ?? []) as HandoffRow[];
  }
}

/* ═══════════════════════════ In memory ═══════════════════════════ */

interface StaticRow {
  handoff: CollectedHandoff;
}

/**
 * The same protocol without a database, for the verify targets and for the
 * route's fixture arm.
 *
 * `status` is the only claim marker here too, and that mirroring is the point:
 * a fixture that released rows on a rule the database does not share would
 * prove the protocol works when it does not. The claim is genuinely exclusive
 * for the same structural reason it is in Postgres — the field it tests is the
 * field it sets — and one JavaScript process cannot interleave the two, so a
 * second `claim()` of the same id returns null exactly as the conditional
 * UPDATE would.
 */
export class StaticHandoffSource implements HandoffSource {
  private readonly rows: Map<string, StaticRow>;

  constructor(seed: readonly CollectedHandoff[]) {
    this.rows = new Map(seed.map((handoff) => [handoff.id, { handoff: { ...handoff } }]));
  }

  async pending(): Promise<PendingScan> {
    const collectable: CollectedHandoff[] = [];
    const unreadable: UnreadableHandoff[] = [];
    for (const row of this.rows.values()) {
      if (row.handoff.status !== "ready") continue;
      const read = readPayload(row.handoff.payload);
      if (!read.ok) {
        unreadable.push({
          id: row.handoff.id,
          workforcePlanId: row.handoff.workforcePlanId,
          reason: `The seeded payload is not a workforce handoff: ${read.reason}`,
        });
        continue;
      }
      collectable.push(this.copy(row.handoff));
    }
    return { collectable, unreadable };
  }

  async claim(id: string): Promise<CollectedHandoff | null> {
    const row = this.rows.get(id);
    if (!row || row.handoff.status !== "ready") return null;
    // Written before the payload is read, so a malformed row is claimed and
    // then retired rather than left 'ready' for the next caller to trip over.
    row.handoff = { ...row.handoff, status: "consumed" };

    const read = readPayload(row.handoff.payload);
    if (!read.ok) {
      const reason = `The seeded payload is not a workforce handoff: ${read.reason}`;
      await this.markFailed(id, reason);
      throw new HandoffPayloadError(id, reason);
    }

    return this.copy(row.handoff);
  }

  async markConsumed(id: string): Promise<void> {
    const row = this.rows.get(id);
    if (row) row.handoff = { ...row.handoff, status: "consumed" };
  }

  async markFailed(id: string, _reason: string): Promise<void> {
    const row = this.rows.get(id);
    if (!row) return;
    // Terminal, exactly as in Supabase. Nothing collects this again until Role
    // B re-finalises and the status goes back to 'ready'.
    row.handoff = { ...row.handoff, status: "failed" };
  }

  /**
   * Handed out as a copy. The fixture payloads are module-level constants
   * shared by every caller in the process, and the pipeline is entitled to
   * treat what it is given as its own.
   */
  private copy(handoff: CollectedHandoff): CollectedHandoff {
    return { ...handoff, payload: structuredClone(handoff.payload) };
  }
}
