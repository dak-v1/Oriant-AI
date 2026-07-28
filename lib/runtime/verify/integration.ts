/**
 * lib/runtime/verify/integration.ts — the M0/M1 seam, end to end.
 *
 * m1.ts proves the SPINE in isolation using inline doubles, so a change to a
 * shared stub can never make it lie. This file proves the opposite thing: that
 * the real pieces fit together. It takes actual agents out of the approved
 * BrightPath plan, compiles them with the real factory, and runs them through
 * the real executor against the real StubToolClient, FixtureReasoner and
 * InMemoryRunStore.
 *
 * If m1.ts passes and this fails, the spine is fine and a module drifted.
 * If both fail, the spine is wrong. That separation is the point.
 *
 * Run it with: npm run verify:int
 */

import { BRIGHTPATH_PLAN } from "../../plan/fixtures/brightpath";
import { isReadOnly } from "../../plan/operations";
import type { AgentSpec } from "../../plan/types";
import { bundleAgent } from "../factory";
import { startRun, decideAndResume } from "../executor";
import type { ExecutorOptions } from "../executor";
import { FixtureReasoner } from "../llm";
import { InMemoryRunStore, FixedClock, createIdFactory } from "../store";
import { StubIntegrationProvider } from "../tools";
import type { TriggerEvent } from "../types";

export interface Check {
  name: string;
  pass: boolean;
  detail: string;
}

const BUILT_AT = "2026-07-24T08:00:00.000Z";
const NOW = "2026-07-24T01:00:00.000Z"; // 09:00 Asia/Singapore, outside quiet hours

/**
 * Step 4 of the resolution order, verbatim from lib/runtime/policy.ts.
 *
 * Duplicated on purpose rather than imported: the point of INT-3 is to prove
 * the run stopped for THIS reason and not for one of the other four that also
 * end in `awaiting_approval`, and a shared constant would match whatever the
 * resolver happened to say. If policy.ts rewords step 4, this line is the
 * deliberate second edit.
 */
const DRAFT_ONLY_REASON = "This agent prepares work but never acts on its own.";

function agent(id: string): AgentSpec {
  const found = BRIGHTPATH_PLAN.agents.find((a) => a.id === id);
  if (!found) throw new Error(`Agent ${id} missing from the BrightPath plan.`);
  return found;
}

function deps(seed: string): ExecutorOptions & { provider: StubIntegrationProvider } {
  const provider = new StubIntegrationProvider();
  return {
    store: new InMemoryRunStore(),
    tools: provider,
    reasoner: new FixtureReasoner(),
    clock: new FixedClock(NOW),
    newId: createIdFactory(seed),
    sleep: async () => {},
    globalPolicy: BRIGHTPATH_PLAN.globalPolicy,
    provider,
  };
}

function triggerFor(spec: AgentSpec, workflowIndex = 0): TriggerEvent {
  const workflow = spec.workflows[workflowIndex];
  if (!workflow) throw new Error(`Agent ${spec.id} has no workflow at ${workflowIndex}.`);
  return {
    kind: workflow.trigger.kind === "schedule" ? "schedule" : "manual",
    workflowId: workflow.id,
    agentId: spec.id,
    firedAt: NOW,
    payload: {},
    idempotencyKey: `${spec.id}:${workflow.id}:1`,
  };
}

export async function runINTEGRATIONVerification(): Promise<Check[]> {
  const checks: Check[] = [];
  const add = (name: string, pass: boolean, detail: string) =>
    checks.push({ name, pass, detail });

  /* 1. Every agent in the approved plan compiles into a runnable package. */
  {
    const results = BRIGHTPATH_PLAN.agents.map((spec) => {
      const bundle = bundleAgent(spec, { builtAt: BUILT_AT });
      const enabled = spec.workflows.filter((w) => w.enabled).length;
      return {
        id: spec.id,
        ok:
          bundle.pkg.allowedOperations.length > 0 &&
          bundle.pkg.systemPrompt.length > 0 &&
          bundle.pkg.workflows.filter((w) => w.enabled).length === enabled,
      };
    });
    add(
      "INT-1 every planned agent compiles to a package",
      results.every((r) => r.ok),
      results.map((r) => `${r.id}:${r.ok ? "ok" : "FAILED"}`).join(", "),
    );
  }

  /* 2. Compiled allowlists never exceed what the plan granted. Widening here
        would silently defeat every policy check downstream. */
  {
    const leaks: string[] = [];
    for (const spec of BRIGHTPATH_PLAN.agents) {
      const granted = new Set(spec.tools.flatMap((t) => t.operations));
      const bundle = bundleAgent(spec, { builtAt: BUILT_AT });
      for (const op of bundle.pkg.allowedOperations) {
        if (!granted.has(op)) leaks.push(`${spec.id}:${op}`);
      }
    }
    add(
      "INT-2 compiled allowlist never widens the plan's grants",
      leaks.length === 0,
      leaks.length ? leaks.join(", ") : "no widening",
    );
  }

  /* 3. draft_only never acts. The Marketing agent must always pause.
        Every clause here is load-bearing, and the check used to have none of
        them: it computed the writes and then asserted only
        `awaiting_approval || completed`, which is true of every non-error
        outcome. Delete the draft_only branch from the policy engine and the
        marketing agent — whose limits are empty — would auto-send and finish
        `completed`, with this check still green.

        So: the run must pause, it must have produced a real reviewable item,
        and the pause must be the one draft_only causes. Asserting the reason
        pins the DECISION PATH; a status alone cannot tell "never acts on its
        own" apart from "breached a limit" or "always-approve operation". */
  {
    const spec = agent("marketing");
    const d = deps("mkt");
    const bundle = bundleAgent(spec, { builtAt: BUILT_AT });
    const out = await startRun(bundle, triggerFor(spec), d);
    // Classified from the registry's `access` field rather than from the shape
    // of the operation name. A `.endsWith(".read")` heuristic silently depends
    // on a naming convention surviving D's real vocabulary (contract §8 Q2),
    // and isReadOnly already fails closed on an id it does not know.
    const writes = d.provider.client.calls.filter((c) => !isReadOnly(c.operation));
    const pending = await d.store.listPendingApprovals();
    const reason = pending[0]?.reason ?? "";
    add(
      "INT-3 draft_only agent pauses instead of acting",
      out.status === "awaiting_approval" &&
        writes.length === 0 &&
        pending.length === 1 &&
        out.approvalId !== null &&
        reason === DRAFT_ONLY_REASON,
      `status=${out.status} approval=${out.approvalId ?? "none"} writes=${writes.length} pending=${pending.length} reason=${JSON.stringify(reason)}`,
    );
  }

  /* 4. act_after_approval always pauses on its first act, then completes. */
  {
    const spec = agent("service-recovery");
    const d = deps("rec");
    const bundle = bundleAgent(spec, { builtAt: BUILT_AT });
    const paused = await startRun(bundle, triggerFor(spec), d);

    let resumedStatus = "n/a";
    if (paused.approvalId) {
      const resumed = await decideAndResume(
        {
          approvalId: paused.approvalId,
          decision: "approved",
          decidedBy: BRIGHTPATH_PLAN.approvedBy,
          decidedAt: NOW,
        },
        bundle,
        d,
      );
      resumedStatus = resumed.status;
    }
    add(
      "INT-4 act_after_approval pauses, then resumes on approval",
      paused.status === "awaiting_approval" &&
        (resumedStatus === "completed" || resumedStatus === "awaiting_approval"),
      `paused=${paused.status} afterApproval=${resumedStatus}`,
    );
  }

  /* 5. A refused run never reaches its tool. Force the Finance agent past its
        limit by scripting the reasoner with a large amount. */
  {
    const spec = agent("finance-followup");
    const d = deps("fin");
    d.reasoner = new FixtureReasoner({
      __default: {
        summary: "Chase the large overdue invoice.",
        data: { to: "ops@example.com", subject: "Overdue invoice" },
        metrics: { "invoice.amount": 5000, "emails.per_run": 1 },
      },
    });
    const bundle = bundleAgent(spec, { builtAt: BUILT_AT });
    const out = await startRun(bundle, triggerFor(spec), d);
    const pending = await d.store.listPendingApprovals();
    // Assert the SCRIPTED amount reached policy. Checking only the status would
    // pass even when the script silently missed and derive() invented a
    // different over-limit figure from the stub data — a test that asserts
    // nothing about what it claims to control.
    const seenAmount = pending[0]?.invocation.metrics["invoice.amount"];
    add(
      "INT-5 an over-limit finance run escalates on the scripted amount",
      out.status === "awaiting_approval" && pending.length === 1 && seenAmount === 5000,
      `status=${out.status} pending=${pending.length} scriptedAmountSeen=${String(seenAmount)} (expected 5000)`,
    );
  }

  /* 5b. Regression: a stale metric in the executor's __metrics envelope must
         never outrank one derived from the CURRENT batch. Policy fails closed
         on a missing metric but not on a stale one, so if the fixture reasoner
         re-harvested its own earlier output, a small first invoice would pin
         the value and a later large one would send with no approval. */
  {
    const reasoner = new FixtureReasoner();
    const result = await reasoner.reason({
      systemPrompt: "",
      workflowPrompt: "",
      instruction: "Decide who to chase.",
      context: {
        // What the executor would have written after an earlier small batch.
        __metrics: { "invoice.amount": 95, "emails.per_run": 1 },
        // What the current fetch actually returned.
        s1: {
          invoices: [
            { id: "INV-1", amount: 95 },
            { id: "INV-2", amount: 1200 },
          ],
        },
      },
    });
    const derived = result.metrics?.["invoice.amount"];
    add(
      "INT-5b stale __metrics never outranks the current batch",
      derived === 1200,
      `derived invoice.amount=${String(derived)} (expected 1200, stale value was 95)`,
    );
  }

  /* 6. Determinism across the REAL modules, not just the inline doubles. */
  {
    const once = async () => {
      const spec = agent("admin-operations");
      const d = deps("det");
      const bundle = bundleAgent(spec, { builtAt: BUILT_AT });
      const out = await startRun(bundle, triggerFor(spec), d);
      return JSON.stringify(out.run.events);
    };
    const a = await once();
    const b = await once();
    add("INT-6 real modules produce identical event streams", a === b, `equal=${a === b}`);
  }

  /* 7. No run may ever call an operation the plan did not grant, whatever the
        stub offers or the reasoner suggests. */
  {
    const violations: string[] = [];
    for (const spec of BRIGHTPATH_PLAN.agents) {
      const d = deps(`grant-${spec.id}`);
      const bundle = bundleAgent(spec, { builtAt: BUILT_AT });
      await startRun(bundle, triggerFor(spec), d);
      const granted = new Set(spec.tools.flatMap((t) => t.operations));
      for (const call of d.provider.client.calls) {
        if (!granted.has(call.operation)) violations.push(`${spec.id}:${call.operation}`);
      }
    }
    add(
      "INT-7 no run calls an ungranted operation",
      violations.length === 0,
      violations.length ? violations.join(", ") : "clean across all agents",
    );
  }

  return checks;
}

export function formatResults(results: Check[]): string {
  const lines = results.map(
    (r) => `${r.pass ? "PASS" : "FAIL"}  ${r.name}\n        ${r.detail}`,
  );
  const failed = results.filter((r) => !r.pass).length;
  lines.push("");
  lines.push(
    // An empty result set is not a pass: `[].filter(...).length === 0` is true,
    // so the two-branch version reports OK for a runner that asserted nothing.
    results.length === 0
      ? "INTEGRATION BROKEN — the runner produced no checks."
      : failed === 0
        ? `INTEGRATION OK — ${results.length}/${results.length} checks passed.`
        : `INTEGRATION BROKEN — ${failed} of ${results.length} checks failed.`,
  );
  return lines.join("\n");
}
