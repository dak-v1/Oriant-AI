/**
 * lib/runtime/verify/m1.ts — the M1 exit criteria, as an executable check.
 *
 * ROLE_C_PLAN M1 exits when, with NO user interface written:
 *
 *   a small invoice sends immediately,
 *   a large invoice pauses and creates an approval,
 *   an approval resumes the run to completion,
 *   a write-off always pauses (alwaysApprove),
 *   a refund is refused outright (forbidden).
 *
 * This file proves exactly that, plus the properties the rest of the project
 * leans on: fail-closed limits, determinism, idempotency, and that a paused
 * run cannot be resumed into something the plan no longer permits.
 *
 * Deliberately self-contained. The doubles below are a few dozen lines each so
 * this verification tests the SPINE — policy.ts, executor.ts, factory.ts — and
 * cannot be broken by an unrelated change to the shared stubs.
 *
 * Run it with: npm run verify:m1
 */

import type { AgentSpec } from "../../plan/types";
import { bundleAgent } from "../factory";
import { decideAndResume, startRun } from "../executor";
import type {
  ApprovalDecision,
  ApprovalRequest,
  Clock,
  IntegrationProvider,
  ReasonResult,
  Reasoner,
  RunState,
  RunStatus,
  RunStore,
  ToolClient,
  ToolInvocation,
  ToolResult,
  TriggerEvent,
} from "../types";
import type { ExecutorOptions } from "../executor";

/* ═══════════════════════════ Test doubles ═══════════════════════════ */

class MemoryStore implements RunStore {
  private runs = new Map<string, RunState>();
  private approvals = new Map<string, ApprovalRequest>();
  private decisions = new Map<string, ApprovalDecision>();
  private keys = new Set<string>();

  async createRun(state: RunState) {
    if (this.runs.has(state.runId)) throw new Error(`duplicate run ${state.runId}`);
    this.runs.set(state.runId, structuredClone(state));
  }
  async saveRun(state: RunState) {
    this.runs.set(state.runId, structuredClone(state));
  }
  async getRun(runId: string) {
    const found = this.runs.get(runId);
    return found ? structuredClone(found) : null;
  }
  async listRuns(filter?: { agentId?: string; status?: RunStatus }) {
    return [...this.runs.values()]
      .filter((r) => !filter?.agentId || r.agentId === filter.agentId)
      .filter((r) => !filter?.status || r.status === filter.status)
      .map((r) => structuredClone(r));
  }
  async claimIdempotencyKey(key: string) {
    if (this.keys.has(key)) return false;
    this.keys.add(key);
    return true;
  }
  async createApproval(request: ApprovalRequest) {
    this.approvals.set(request.approvalId, structuredClone(request));
  }
  async getApproval(id: string) {
    const found = this.approvals.get(id);
    return found ? structuredClone(found) : null;
  }
  async getDecision(id: string) {
    const found = this.decisions.get(id);
    return found ? structuredClone(found) : null;
  }
  async saveDecision(decision: ApprovalDecision) {
    if (!this.approvals.has(decision.approvalId)) {
      throw new Error(`unknown approval ${decision.approvalId}`);
    }
    if (this.decisions.has(decision.approvalId)) {
      throw new Error(`approval ${decision.approvalId} already decided`);
    }
    this.decisions.set(decision.approvalId, structuredClone(decision));
  }
  async listPendingApprovals() {
    return [...this.approvals.values()]
      .filter((a) => !this.decisions.has(a.approvalId))
      .map((a) => structuredClone(a));
  }
}

class FixedClock implements Clock {
  constructor(private iso: string) {}
  now() {
    return new Date(this.iso);
  }
}

function seededIds(): (prefix: string) => string {
  let n = 0;
  return (prefix) => `${prefix}_${++n}`;
}

class RecordingTools implements ToolClient {
  readonly calls: ToolInvocation[] = [];
  constructor(private failOn: Set<string> = new Set()) {}
  async call(invocation: ToolInvocation): Promise<ToolResult> {
    this.calls.push(structuredClone(invocation));
    if (this.failOn.has(invocation.operation)) {
      return { ok: false, error: `simulated failure: ${invocation.operation}` };
    }
    return { ok: true, data: { simulated: true, operation: invocation.operation } };
  }
}

class Provider implements IntegrationProvider {
  constructor(
    readonly client: RecordingTools,
    private disconnected: Set<string> = new Set(),
  ) {}
  getToolClient(integrationId: string) {
    return this.disconnected.has(integrationId) ? null : this.client;
  }
  getIntegrationStatus(integrationId: string) {
    return this.disconnected.has(integrationId)
      ? ("required" as const)
      : ("connected" as const);
  }
}

/** Emits whatever metrics the scenario needs, with no model involved. */
class ScriptedReasoner implements Reasoner {
  constructor(private result: ReasonResult) {}
  async reason(): Promise<ReasonResult> {
    return structuredClone(this.result);
  }
}

/* ═══════════════════════════ Fixture agent ═══════════════════════════ */

const OWNER = "user_sarah_chen";

/**
 * A minimal Finance Follow-up agent carrying every policy shape that matters:
 * a limit that can pass or breach, an always-approve operation, and a
 * forbidden one.
 */
function financeAgent(overrides: Partial<AgentSpec> = {}): AgentSpec {
  return {
    id: "finance-followup",
    version: 3,
    name: "Finance Follow-up Agent",
    role: "Chases overdue invoices and prepares payment reminders",
    capabilities: [
      {
        id: "send_payment_reminder",
        name: "Send payment reminder",
        description: "Send an approved reminder to the customer.",
        backedBy: ["gmail.messages.send"],
      },
    ],
    tools: [
      {
        integrationId: "hubspot",
        operations: ["hubspot.invoices.list", "hubspot.invoices.write_off"],
        purpose: "Find overdue invoices and settle balances",
        required: true,
      },
      {
        integrationId: "gmail",
        operations: ["gmail.messages.send"],
        purpose: "Send payment reminders",
        required: true,
      },
    ],
    policy: {
      operatingMode: "auto_within_limits",
      limits: [
        {
          id: "amt",
          metric: "invoice.amount",
          op: "<=",
          value: 500,
          unit: "SGD",
          onBreach: "require_approval",
        },
      ],
      alwaysApprove: ["hubspot.invoices.write_off"],
      forbidden: ["hubspot.refunds.issue"],
      approvalOwner: OWNER,
      escalateAfterMins: 240,
      quietHours: null,
      maxRunsPerDay: null,
    },
    guidance: {
      objective: "Reduce time to payment without damaging relationships.",
      businessContext: "BrightPath Home Services, Singapore.",
    },
    workflows: [
      {
        id: "overdue-sweep",
        name: "Overdue sweep",
        description: "Chase invoices past their due date.",
        enabled: true,
        trigger: {
          kind: "schedule",
          label: "Fridays 9am",
          cron: "0 9 * * 5",
          timezone: "Asia/Singapore",
        },
        steps: [
          {
            id: "s1",
            kind: "fetch",
            instruction: "List overdue invoices.",
            tool: { integrationId: "hubspot", operation: "hubspot.invoices.list" },
          },
          { id: "s2", kind: "reason", instruction: "Decide who to chase and draft it." },
          {
            id: "s3",
            kind: "act",
            instruction: "Send the reminder.",
            tool: { integrationId: "gmail", operation: "gmail.messages.send" },
            risk: "medium",
          },
        ],
        output: { kind: "message", successCriteria: "One reminder sent or queued." },
        onFailure: { retries: 0, backoffSeconds: 0, onExhausted: "notify_owner" },
      },
    ],
    ...overrides,
  };
}

function trigger(key: string): TriggerEvent {
  return {
    kind: "schedule",
    workflowId: "overdue-sweep",
    agentId: "finance-followup",
    firedAt: "2026-07-24T09:00:00+08:00",
    payload: {},
    idempotencyKey: key,
  };
}

interface Harness {
  deps: ExecutorOptions;
  tools: RecordingTools;
  store: MemoryStore;
}

function harness(opts: {
  metrics?: Record<string, number>;
  disconnected?: string[];
  failOn?: string[];
} = {}): Harness {
  const store = new MemoryStore();
  const tools = new RecordingTools(new Set(opts.failOn ?? []));
  const deps: ExecutorOptions = {
    store,
    tools: new Provider(tools, new Set(opts.disconnected ?? [])),
    reasoner: new ScriptedReasoner({
      summary: "Chase the overdue invoice.",
      data: { to: "customer@example.com", subject: "Payment reminder" },
      metrics: opts.metrics ?? {},
    }),
    clock: new FixedClock("2026-07-24T09:00:00.000Z"),
    newId: seededIds(),
    sleep: async () => {},
    globalPolicy: { quietHours: null, forbidden: [] },
  };
  return { deps, tools, store };
}

const BUILT_AT = "2026-07-24T08:00:00.000Z";

/* ═══════════════════════════ Assertions ═══════════════════════════ */

interface Check {
  name: string;
  pass: boolean;
  detail: string;
}

const checks: Check[] = [];

function check(name: string, pass: boolean, detail: string): void {
  checks.push({ name, pass, detail });
}

/* ═══════════════════════════ The scenarios ═══════════════════════════ */

export async function runM1Verification(): Promise<Check[]> {
  checks.length = 0;

  /* 1. Small invoice sends immediately. */
  {
    const h = harness({ metrics: { "invoice.amount": 95 } });
    const bundle = bundleAgent(financeAgent(), { builtAt: BUILT_AT });
    const out = await startRun(bundle, trigger("k1"), h.deps);
    const sent = h.tools.calls.some((c) => c.operation === "gmail.messages.send");
    check(
      "M1-1 small invoice auto-sends",
      out.status === "completed" && sent,
      `status=${out.status} sent=${sent}`,
    );
  }

  /* 2. Large invoice pauses and creates an approval naming the breached limit. */
  let pausedApprovalId = "";
  {
    const h = harness({ metrics: { "invoice.amount": 1200 } });
    const bundle = bundleAgent(financeAgent(), { builtAt: BUILT_AT });
    const out = await startRun(bundle, trigger("k2"), h.deps);
    const pending = await h.store.listPendingApprovals();
    const sent = h.tools.calls.some((c) => c.operation === "gmail.messages.send");
    pausedApprovalId = out.approvalId ?? "";
    check(
      "M1-2 large invoice pauses for approval",
      out.status === "awaiting_approval" &&
        pending.length === 1 &&
        pending[0]?.breachedLimits.includes("amt") === true &&
        !sent,
      `status=${out.status} pending=${pending.length} breached=${JSON.stringify(pending[0]?.breachedLimits)} sentEarly=${sent}`,
    );
  }

  /* 3. Approving resumes the paused run to completion, executing exactly once. */
  {
    const h = harness({ metrics: { "invoice.amount": 1200 } });
    const bundle = bundleAgent(financeAgent(), { builtAt: BUILT_AT });
    const paused = await startRun(bundle, trigger("k3"), h.deps);
    const approvalId = paused.approvalId ?? "";

    const resumed = await decideAndResume(
      {
        approvalId,
        decision: "approved",
        decidedBy: OWNER,
        decidedAt: "2026-07-24T10:00:00.000Z",
      },
      bundle,
      h.deps,
    );

    const sends = h.tools.calls.filter((c) => c.operation === "gmail.messages.send");
    check(
      "M1-3 approval resumes run to completion, acts exactly once",
      resumed.status === "completed" && sends.length === 1,
      `status=${resumed.status} sends=${sends.length}`,
    );
  }

  /* 4. Rejecting ends the run and never performs the action. */
  {
    const h = harness({ metrics: { "invoice.amount": 1200 } });
    const bundle = bundleAgent(financeAgent(), { builtAt: BUILT_AT });
    const paused = await startRun(bundle, trigger("k4"), h.deps);
    const out = await decideAndResume(
      {
        approvalId: paused.approvalId ?? "",
        decision: "rejected",
        decidedBy: OWNER,
        decidedAt: "2026-07-24T10:00:00.000Z",
        reason: "Customer already paid.",
      },
      bundle,
      h.deps,
    );
    const sent = h.tools.calls.some((c) => c.operation === "gmail.messages.send");
    check(
      "M1-4 rejection ends the run without acting",
      out.status === "refused" && !sent,
      `status=${out.status} sent=${sent}`,
    );
  }

  /* 5. alwaysApprove pauses even when every limit is satisfied. */
  {
    const h = harness({ metrics: { "invoice.amount": 50 } });
    const spec = financeAgent();
    spec.workflows[0]!.steps[2] = {
      id: "s3",
      kind: "act",
      instruction: "Write off the balance.",
      tool: { integrationId: "hubspot", operation: "hubspot.invoices.write_off" },
      risk: "high",
    };
    const bundle = bundleAgent(spec, { builtAt: BUILT_AT });
    const out = await startRun(bundle, trigger("k5"), h.deps);
    const pending = await h.store.listPendingApprovals();
    check(
      "M1-5 alwaysApprove pauses despite limits passing",
      out.status === "awaiting_approval" && pending.length === 1,
      `status=${out.status} pending=${pending.length}`,
    );
  }

  /* 6. A forbidden operation is refused outright, with no approval offered. */
  {
    const h = harness({ metrics: { "invoice.amount": 50 } });
    const spec = financeAgent();
    spec.tools.push({
      integrationId: "hubspot",
      operations: ["hubspot.refunds.issue"],
      purpose: "(deliberately granted to prove forbidden still wins)",
      required: false,
    });
    spec.workflows[0]!.steps[2] = {
      id: "s3",
      kind: "act",
      instruction: "Issue a refund.",
      tool: { integrationId: "hubspot", operation: "hubspot.refunds.issue" },
      risk: "high",
    };
    const bundle = bundleAgent(spec, { builtAt: BUILT_AT });
    const out = await startRun(bundle, trigger("k6"), h.deps);
    const pending = await h.store.listPendingApprovals();
    const called = h.tools.calls.some((c) => c.operation === "hubspot.refunds.issue");
    check(
      "M1-6 forbidden operation refused, never escalated",
      out.status === "refused" && pending.length === 0 && !called,
      `status=${out.status} pending=${pending.length} called=${called}`,
    );
  }

  /* 7. Fail closed: an unmeasured limit metric escalates rather than proceeds. */
  {
    const h = harness({ metrics: {} });
    const bundle = bundleAgent(financeAgent(), { builtAt: BUILT_AT });
    const out = await startRun(bundle, trigger("k7"), h.deps);
    const pending = await h.store.listPendingApprovals();
    const mentions = pending[0]?.reason.includes("invoice.amount") === true;
    check(
      "M1-7 unmeasured limit fails closed and names the metric",
      out.status === "awaiting_approval" && mentions,
      `status=${out.status} reason=${JSON.stringify(pending[0]?.reason ?? null)}`,
    );
  }

  /* 8. Determinism: identical inputs produce an identical event stream. */
  {
    const runOnce = async () => {
      const h = harness({ metrics: { "invoice.amount": 95 } });
      const bundle = bundleAgent(financeAgent(), { builtAt: BUILT_AT });
      const out = await startRun(bundle, trigger("same-key"), h.deps);
      return JSON.stringify(out.run.events);
    };
    const a = await runOnce();
    const b = await runOnce();
    check("M1-8 identical runs produce identical event streams", a === b, `equal=${a === b}`);
  }

  /* 9. Idempotency: the same trigger delivered twice yields one run. */
  {
    const h = harness({ metrics: { "invoice.amount": 95 } });
    const bundle = bundleAgent(financeAgent(), { builtAt: BUILT_AT });
    await startRun(bundle, trigger("dupe"), h.deps);
    await startRun(bundle, trigger("dupe"), h.deps);
    const runs = await h.store.listRuns({ agentId: "finance-followup" });
    const sends = h.tools.calls.filter((c) => c.operation === "gmail.messages.send");
    check(
      "M1-9 duplicate trigger does not double-run",
      runs.length === 1 && sends.length === 1,
      `runs=${runs.length} sends=${sends.length}`,
    );
  }

  /* 10. A plan change during the pause cannot be overridden by an approval. */
  {
    const h = harness({ metrics: { "invoice.amount": 1200 } });
    const bundle = bundleAgent(financeAgent(), { builtAt: BUILT_AT });
    const paused = await startRun(bundle, trigger("k10"), h.deps);

    // The owner revises the plan while the run sits in the inbox.
    const revised = financeAgent();
    revised.policy.forbidden = [...revised.policy.forbidden, "gmail.messages.send"];
    const revisedBundle = bundleAgent(revised, { builtAt: BUILT_AT });

    const out = await decideAndResume(
      {
        approvalId: paused.approvalId ?? "",
        decision: "approved",
        decidedBy: OWNER,
        decidedAt: "2026-07-24T10:00:00.000Z",
      },
      revisedBundle,
      h.deps,
    );
    const sent = h.tools.calls.some((c) => c.operation === "gmail.messages.send");
    check(
      "M1-10 approval cannot authorise a newly forbidden action",
      out.status === "refused" && !sent,
      `status=${out.status} sent=${sent}`,
    );
  }

  /* 11. A disconnected integration fails the run rather than acting blindly. */
  {
    const h = harness({ metrics: { "invoice.amount": 95 }, disconnected: ["gmail"] });
    const bundle = bundleAgent(financeAgent(), { builtAt: BUILT_AT });
    const out = await startRun(bundle, trigger("k11"), h.deps);
    check(
      "M1-11 disconnected integration fails the run",
      out.status === "failed" && (out.run.failure ?? "").includes("not connected"),
      `status=${out.status} failure=${JSON.stringify(out.run.failure)}`,
    );
  }

  /* 12. Owner edits are what actually execute. */
  {
    const h = harness({ metrics: { "invoice.amount": 1200 } });
    const bundle = bundleAgent(financeAgent(), { builtAt: BUILT_AT });
    const paused = await startRun(bundle, trigger("k12"), h.deps);
    await decideAndResume(
      {
        approvalId: paused.approvalId ?? "",
        decision: "approved",
        decidedBy: OWNER,
        decidedAt: "2026-07-24T10:00:00.000Z",
        editedArgs: { subject: "Gentle reminder about invoice INV-1187" },
      },
      bundle,
      h.deps,
    );
    const send = h.tools.calls.find((c) => c.operation === "gmail.messages.send");
    check(
      "M1-12 owner edits are what execute",
      send?.args.subject === "Gentle reminder about invoice INV-1187",
      `subject=${JSON.stringify(send?.args.subject)}`,
    );
  }

  /* 13. Compiling the same spec twice yields the same checksum (M2 groundwork). */
  {
    const a = bundleAgent(financeAgent(), { builtAt: "2026-01-01T00:00:00.000Z" });
    const b = bundleAgent(financeAgent(), { builtAt: "2026-09-09T00:00:00.000Z" });
    check(
      "M1-13 package checksum is stable across builds",
      a.pkg.checksum === b.pkg.checksum,
      `${a.pkg.checksum} vs ${b.pkg.checksum}`,
    );
  }

  return checks;
}

/* ═══════════════════════════ Runner ═══════════════════════════ */

export function formatResults(results: Check[]): string {
  const lines = results.map(
    (r) => `${r.pass ? "PASS" : "FAIL"}  ${r.name}\n        ${r.detail}`,
  );
  const failed = results.filter((r) => !r.pass).length;
  lines.push("");
  lines.push(
    failed === 0
      ? `M1 EXIT CRITERIA MET — ${results.length}/${results.length} checks passed.`
      : `M1 NOT MET — ${failed} of ${results.length} checks failed.`,
  );
  return lines.join("\n");
}
