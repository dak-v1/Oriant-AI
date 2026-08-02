/**
 * lib/plan/verify/ingest.ts — is Role C safe against what Role B actually
 * sends?
 *
 * Every other verify target proves Role C against its own contract. This one
 * proves it against the other lane's reality, using Role B's real payload
 * rather than a shape chosen to pass.
 *
 * The assertion that matters most is INGEST-6: no agent produced from a handoff
 * may act unattended. Role B ships no approval boundaries, so the only correct
 * posture is that every action stops for the owner — and a check that merely
 * looked at `operatingMode` would miss an agent whose steps route a write
 * through the ungated `fetch` path. So the plan is validated, built and RUN,
 * and the run is required to pause.
 *
 * Run it with: npm run verify:ingest
 */

import { ingestHandoff } from "../ingest/from-handoff";
import { ROLE_B_HANDOFF, ROLE_B_HANDOFF_RESOLVED } from "../fixtures/role-b-handoff";
import { validateApprovedPlan } from "../validate";
import { isReadOnly } from "../operations";
import { isKnownUser } from "../users";
import { bundleAgent } from "../../runtime/factory";
import { startRun } from "../../runtime/executor";
import type { ExecutorOptions } from "../../runtime/executor";
import { FixtureReasoner } from "../../runtime/llm";
import { InMemoryRunStore, FixedClock, createIdFactory } from "../../runtime/store";
import { StubIntegrationProvider } from "../../runtime/tools";
import type { TriggerEvent } from "../../runtime/types";

export interface Check {
  name: string;
  pass: boolean;
  detail: string;
}

const NOW = "2026-08-01T14:10:00.000Z";

export async function runINGESTVerification(): Promise<Check[]> {
  const checks: Check[] = [];
  const add = (name: string, pass: boolean, detail: string) =>
    checks.push({ name, pass, detail });

  /* 1. The real payload is refused, and for the right reasons. Role B's actual
        handoff is version 1 against current_version 2 with an unknown approval
        owner, so a build MUST NOT proceed. */
  const raw = ingestHandoff(ROLE_B_HANDOFF);
  const blocking = raw.gaps.filter((g) => g.severity === "blocking");
  add(
    "INGEST-1 Role B's real payload is refused, naming why",
    !raw.runnable &&
      blocking.some((g) => g.code === "plan_stale") &&
      blocking.some((g) => g.code === "approval_owner_unresolved"),
    `runnable=${raw.runnable} blocking=[${blocking.map((g) => g.code).join(", ")}]`,
  );

  /* 2. Every gap is actionable. A gap report that says "TODO" is a worse
        version of silence, because it looks like it was considered. */
  add(
    "INGEST-2 every gap carries a concrete resolution",
    raw.gaps.every((g) => g.resolution.trim().length > 20 && g.message.trim().length > 20),
    `${raw.gaps.length} gaps, shortest resolution ${Math.min(...raw.gaps.map((g) => g.resolution.length))} chars`,
  );

  /* 3. With Role B's side corrected, the plan is valid against the contract. */
  const good = ingestHandoff(ROLE_B_HANDOFF_RESOLVED);
  const findings = validateApprovedPlan(good.plan);
  const errors = findings.filter((f) => f.severity === "error");
  add(
    "INGEST-3 a corrected payload produces a contract-valid plan",
    good.runnable && errors.length === 0,
    good.runnable && errors.length === 0
      ? `0 errors, ${findings.length} warnings, ${good.plan.agents.length} agent(s)`
      : `runnable=${good.runnable} errors=${errors.map((e) => `r${e.rule}:${e.message}`).join(" | ")}`,
  );

  /* 4. The approval owner is a real user id, never the display name Role B
        sends. A display name is not an identity. */
  add(
    "INGEST-4 approval owners resolve to known user ids",
    good.plan.agents.every((a) => isKnownUser(a.policy.approvalOwner)),
    good.plan.agents.map((a) => `${a.id}:${a.policy.approvalOwner}`).join(", "),
  );

  /* 5. Forbidden operations are never granted. Role B's payload cannot ask for
        a refund, but a future one could, and the deny must survive it. */
  {
    const leaks = good.plan.agents.flatMap((agent) => {
      const granted = new Set(agent.tools.flatMap((t) => t.operations));
      return [...agent.policy.forbidden, ...good.plan.globalPolicy.forbidden]
        .filter((op) => granted.has(op))
        .map((op) => `${agent.id}:${op}`);
    });
    add(
      "INGEST-5 no forbidden operation is ever granted",
      leaks.length === 0,
      leaks.length === 0 ? "clean" : leaks.join(", "),
    );
  }

  /* 6. THE ONE THAT MATTERS. Actually run an ingested agent and require it to
        stop. Reading operatingMode would not catch a write routed through a
        fetch step; running it does. */
  {
    const agent = good.plan.agents[0];
    if (!agent) {
      add("INGEST-6 an ingested agent cannot act unattended", false, "no agents produced");
    } else {
      const workflow = agent.workflows[0];
      const provider = new StubIntegrationProvider();
      const deps: ExecutorOptions = {
        store: new InMemoryRunStore(),
        tools: provider,
        reasoner: new FixtureReasoner(),
        clock: new FixedClock(NOW),
        newId: createIdFactory("ingest"),
        sleep: async () => {},
        globalPolicy: good.plan.globalPolicy,
      };
      const trigger: TriggerEvent = {
        kind: "manual",
        workflowId: workflow?.id ?? "",
        agentId: agent.id,
        firedAt: NOW,
        payload: {},
        idempotencyKey: "ingest-1",
      };
      const out = await startRun(bundleAgent(agent, { builtAt: NOW }), trigger, deps);
      const writesPerformed = provider.client.calls
        .map((c) => c.operation)
        .filter((op) => !isReadOnly(op));

      add(
        "INGEST-6 an ingested agent cannot act unattended",
        out.status === "awaiting_approval" && writesPerformed.length === 0,
        `status=${out.status} approval=${out.approvalId ?? "none"} writesPerformed=${JSON.stringify(writesPerformed)}`,
      );
    }
  }

  /* 7. Fetch steps are read-only. The ungated path must not carry a side
        effect, whatever the synthesiser did with the grants. */
  {
    const bad = good.plan.agents.flatMap((agent) =>
      agent.workflows.flatMap((w) =>
        w.steps
          .filter((s) => s.kind === "fetch" && s.tool && !isReadOnly(s.tool.operation))
          .map((s) => `${agent.id}/${s.id}:${s.tool?.operation}`),
      ),
    );
    add(
      "INGEST-7 no synthesised fetch step performs a write",
      bad.length === 0,
      bad.length === 0 ? "clean" : bad.join(", "),
    );
  }

  /* 8. Ingest is deterministic — the same payload twice is the same plan. The
        Factory keys rebuild skipping on a checksum over the spec, so a
        non-deterministic adapter would rebuild the workforce on every fetch. */
  {
    const a = JSON.stringify(ingestHandoff(ROLE_B_HANDOFF_RESOLVED).plan);
    const b = JSON.stringify(ingestHandoff(ROLE_B_HANDOFF_RESOLVED).plan);
    add("INGEST-8 ingesting the same payload twice is identical", a === b, `equal=${a === b}`);
  }

  /* 9. Every tool Role B requires is actually serviceable, so an ingested agent
        never carries a grant the runtime cannot honour. */
  {
    const required = new Set(ROLE_B_HANDOFF.agents.flatMap((a) => a.required_tools));
    const granted = new Set(
      good.plan.agents.flatMap((a) => a.tools.map((t) => t.integrationId)),
    );
    const unserviceable = [...required].filter((t) => !granted.has(t));
    add(
      "INGEST-9 every required tool maps to real operations",
      unserviceable.length === 0,
      unserviceable.length === 0
        ? `${required.size} tool(s) all serviceable`
        : `unserviceable: ${unserviceable.join(", ")}`,
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
      ? `INGEST OK — ${results.length}/${results.length} checks passed.`
      : `INGEST BROKEN — ${failed} of ${results.length} checks failed.`,
  );
  return lines.join("\n");
}
