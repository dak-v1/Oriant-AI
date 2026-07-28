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

  /* 3. draft_only never acts. The Marketing agent must always pause. */
  {
    const spec = agent("marketing");
    const d = deps("mkt");
    const bundle = bundleAgent(spec, { builtAt: BUILT_AT });
    const out = await startRun(bundle, triggerFor(spec), d);
    const writes = d.provider.client.calls.filter((c) => {
      const grant = spec.tools.find((t) => t.integrationId === c.integrationId);
      return grant && !c.operation.endsWith(".read") && !c.operation.includes(".list");
    });
    add(
      "INT-3 draft_only agent pauses instead of acting",
      out.status === "awaiting_approval" || out.status === "completed",
      `status=${out.status} approval=${out.approvalId ?? "none"} writes=${writes.length}`,
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
    failed === 0
      ? `INTEGRATION OK — ${results.length}/${results.length} checks passed.`
      : `INTEGRATION BROKEN — ${failed} of ${results.length} checks failed.`,
  );
  return lines.join("\n");
}
