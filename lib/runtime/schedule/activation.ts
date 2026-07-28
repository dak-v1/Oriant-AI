/**
 * lib/runtime/schedule/activation.ts — the three gates and go-live (ROLE_C_PLAN M4).
 *
 * This is the moment the product stops asking. Up to here every run happened
 * because a person clicked something; past it, a cron expression mails a
 * customer at nine on a Friday with nobody in the room. The button is trivial —
 * the evidence it demands is the entire feature, and five decisions carry it.
 *
 * EVERY GATE IS RE-DERIVED ON READ, NEVER CACHED. There is no stored "ready"
 * anywhere in this file. A cached green is the one failure mode that ships a
 * workforce on evidence gathered before the plan changed: the packages gate asks
 * the package store what exists for the CURRENT agent versions, the sandbox gate
 * re-reads the verdict, and the integrations gate asks the registry now. Reading
 * the checklist twice in a row is meant to cost two full derivations.
 *
 * THE SANDBOX VERDICT IS DATA ABOUT A PARTICULAR PLAN, NOT A BOOLEAN. A recent
 * audit fixed a defect where a verdict reported `ready: true` while the stress
 * sweep had been skipped — absent evidence reading as a pass. So this gate does
 * not ask the verdict whether it is happy. It re-derives the same conditions
 * from the verdict's own data (the sweep ran and passed in full, every scenario
 * passed, every agent IN THIS PLAN has passing coverage) and additionally
 * insists the verdict is about this plan at this version, because a verdict
 * earned on v2 cannot authorise v3 however green it is. The flag still gets a
 * vote — it can only shut the gate, never open it — and when it says shut for a
 * reason this gate does not model, its own words are shown.
 *
 * REQUIRED MEANS REQUIRED; OPTIONAL MEANS DEGRADE. Contract §3.9 makes
 * `ToolGrant.required` the switch: true blocks activation, false means the agent
 * copes without it. A missing `required` is treated as true — a malformed grant
 * is a reason to stop, not a licence — and any connection state other than
 * "connected", including one this build does not recognise, blocks. The optional
 * ones are still counted, so the owner can see what their workforce is going
 * live without.
 *
 * IDEMPOTENCE IS "NO OBSERVABLE CHANGE", NOT "WRITE THE SAME THING TWICE".
 * Trigger ids are derived (see triggers.ts), so re-registering is safe in
 * itself — but registration recomputes `nextFireAt` from now, and a second
 * activation of an already-live plan version would push a sweep that is due and
 * not yet claimed into next week. The Friday run would silently not happen, on
 * the day someone pressed a button that promised nothing would change. So an
 * activation whose plan version and agent versions already match the live
 * deployment writes nothing at all. A plan EDIT is the opposite case: a new
 * `planVersion` (or any changed agent version) re-registers, adopting the edited
 * specs, and writes a NEW deployment record that supersedes the old one rather
 * than mutating it — deployments are an audit trail, and an audit trail that is
 * rewritten in place is not one.
 *
 * WRITE ORDER IS TRIGGERS, THEN AGENT STATES, THEN THE DEPLOYMENT, because a
 * crash has to land somewhere survivable. Interrupted here, the store holds
 * registered triggers and no deployment: `getActiveDeployment` still returns the
 * previous record, so the next `activate` sees work to do and finishes it.
 * Writing the deployment first would invert that — a record claiming a go-live
 * whose triggers were never registered, and every subsequent activation would
 * read as `unchanged` while nothing ever fired.
 *
 * Nothing here reads a wall clock or invents an id: time comes from
 * `SchedulerDeps.clock` and the deployment id from `SchedulerDeps.newId`, so a
 * fixed-clock activation is byte-identical on a rerun (M3's determinism
 * criterion, which M4 must not regress).
 */

import type { ApprovedPlan } from "../../plan/types";
import { planBuildStatus } from "../build/runner";
import type { BuildDeps } from "../build/types";
import { verdictFingerprint } from "../sandbox/runner";
import type { SandboxVerdict } from "../sandbox/types";
import type { IntegrationProvider } from "../types";
import { registerPlanTriggers } from "./triggers";
import type { RejectedTrigger, TriggerRegistration } from "./triggers";
import type {
  ActivationBlocker,
  ActivationChecklist,
  ActivationGate,
  ActivationGateId,
  AgentRuntimeRecord,
  Deployment,
  ScheduledTrigger,
  SchedulerDeps,
} from "./types";

/* ═══════════════════════════ Wiring ═══════════════════════════ */

/**
 * Where the M3 verdict comes from.
 *
 * Activation does not run the sandbox itself. Proving a workforce takes seconds
 * and the checklist is read on every visit to the deploy screen, so the verdict
 * arrives over a seam. A seam rather than a plain `SandboxVerdict` field for the
 * same reason every gate is re-derived: the checklist must observe the verdict
 * that exists at the moment it is read, not one captured when the caller was
 * wired together.
 */
export interface SandboxEvidence {
  /** The most recent verdict for this plan, or null when nothing was proved. */
  latestVerdict(
    plan: Pick<ApprovedPlan, "planId" | "version">,
  ): Promise<SandboxVerdict | null>;
}

/**
 * The evidence source for a caller that already holds a verdict — the verify
 * scripts, and any route that has just run the suite. Named after `FixedClock`
 * and for the same reason: it pins something the rest of the system treats as
 * live, and it makes "when was this gathered" a fact about the caller rather
 * than a question this module has to answer.
 */
export class FixedSandboxEvidence implements SandboxEvidence {
  private readonly verdict: SandboxVerdict | null;

  constructor(verdict: SandboxVerdict | null) {
    this.verdict = verdict;
  }

  async latestVerdict(): Promise<SandboxVerdict | null> {
    return this.verdict;
  }
}

export interface ActivationDeps {
  /** Trigger registration, deployment and agent-state writes, plus clock and ids. */
  scheduler: SchedulerDeps;
  /**
   * The Agent Factory's store. Gate 1 reads PACKAGES, never job rows: a job says
   * what happened, a package says what is available to run.
   */
  packages: Pick<BuildDeps, "store">;
  /** D's integration registry in production; `StubIntegrationProvider` today. */
  integrations: IntegrationProvider;
  /** M3's verdict, re-read on every checklist. */
  sandbox: SandboxEvidence;
}

/** Derived from the provider so the four states are never restated here. */
type IntegrationStatus = ReturnType<IntegrationProvider["getIntegrationStatus"]>;

/* ═══════════════════════════ Shared helpers ═══════════════════════════ */

/** Where each gate sends the owner to fix what is missing. */
const GATE_HREF: Record<ActivationGateId, string> = {
  packages: "/app/build",
  sandbox: "/app/sandbox",
  integrations: "/app/integrations",
};

/** A collection arriving over the seam is a promise, not proof — as in policy.ts. */
function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Display names, so a blocker reads "Finance Follow-up Agent" not "finance-followup". */
function agentNames(plan: ApprovedPlan): Map<string, string> {
  return new Map(asArray(plan.agents).map((agent) => [agent.id, agent.name || agent.id]));
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/* ═══════════════════════ Gate 1 — packages built ═══════════════════════ */

/**
 * M2's gate, re-asked. `planBuildStatus` already re-derives from stored packages
 * and returns a per-agent reason, so this only has to turn each reason into
 * something an owner can act on.
 *
 * A plan with no agents is refused here rather than silently passing all three
 * gates and "activating" an empty workforce. It is the packages gate's business
 * because this gate is the one that asserts the workforce exists at all.
 */
async function packagesGate(
  plan: ApprovedPlan,
  packages: Pick<BuildDeps, "store">,
): Promise<ActivationGate> {
  const agents = asArray(plan.agents);

  if (agents.length === 0) {
    return {
      id: "packages",
      label: "Agents built",
      satisfied: false,
      detail: "This plan has no agents.",
      blockers: [
        {
          message:
            "This plan contains no agents, so there is nothing to activate. " +
            "Approve a plan with at least one agent first.",
          href: GATE_HREF.packages,
        },
      ],
    };
  }

  const status = await planBuildStatus(plan, packages);
  const names = agentNames(plan);

  const blockers: ActivationBlocker[] = status.missing.map((missing) => ({
    message: `${names.get(missing.agentId) ?? missing.agentId} has no package to run: ${missing.reason}`,
    href: GATE_HREF.packages,
    agentId: missing.agentId,
  }));

  const built = agents.length - status.missing.length;
  return {
    id: "packages",
    label: "Agents built",
    satisfied: blockers.length === 0,
    detail:
      blockers.length === 0
        ? `${built} of ${agents.length} agents built and current.`
        : `${built} of ${agents.length} agents built; ${status.missing.length} still to build.`,
    blockers,
  };
}

/* ═══════════════════════ Gate 2 — sandbox passed ═══════════════════════ */

/**
 * The gate and the verdict it read. `activate` needs the second so the
 * deployment's evidence can name the exact verdict that authorised it; a second
 * read could return a different one and the record would attest to a verdict
 * this go-live never saw.
 */
interface SandboxGateOutcome {
  gate: ActivationGate;
  verdict: SandboxVerdict | null;
}

function shutSandboxGate(detail: string, message: string): ActivationGate {
  return {
    id: "sandbox",
    label: "Sandbox passed",
    satisfied: false,
    detail,
    blockers: [{ message, href: GATE_HREF.sandbox }],
  };
}

async function sandboxGate(
  plan: ApprovedPlan,
  evidence: SandboxEvidence,
): Promise<SandboxGateOutcome> {
  let verdict: SandboxVerdict | null;
  try {
    verdict = await evidence.latestVerdict(plan);
  } catch (error) {
    // A gate that cannot read its evidence is shut, not open. This is the one
    // place the checklist can fail for an infrastructural reason, and reporting
    // it as a blocker keeps the whole checklist readable instead of throwing
    // out of a page load.
    return {
      gate: shutSandboxGate(
        "The verdict could not be read.",
        `The sandbox verdict could not be read: ${describeError(error)}. ` +
          `Activation cannot proceed on evidence it was unable to fetch.`,
      ),
      verdict: null,
    };
  }

  if (verdict === null) {
    return {
      gate: shutSandboxGate(
        "Not proved yet.",
        "This workforce has not been proved in the sandbox yet. Run the scenarios " +
          "and the stress sweep, then come back.",
      ),
      verdict: null,
    };
  }

  /* ── Is this evidence even about the plan in hand? ──
     Checked before anything else, because a verdict for another plan or an
     earlier version is not a red gate, it is the WRONG gate: reporting its
     scenario failures would tell the owner to fix things that are not in front
     of them. */
  if (verdict.planId !== plan.planId || verdict.planVersion !== plan.version) {
    return {
      gate: shutSandboxGate(
        `The latest verdict covers ${verdict.planId} v${verdict.planVersion}.`,
        `The most recent sandbox verdict proves ${verdict.planId} at version ` +
          `${verdict.planVersion}, not ${plan.planId} at version ${plan.version}. ` +
          `Evidence gathered before the plan changed cannot authorise this go-live — ` +
          `re-run the sandbox against the current plan.`,
      ),
      verdict,
    };
  }

  const blockers: ActivationBlocker[] = [];
  const block = (message: string, agentId?: string): void => {
    blockers.push(
      agentId === undefined
        ? { message, href: GATE_HREF.sandbox }
        : { message, href: GATE_HREF.sandbox, agentId },
    );
  };

  /* ── The stress sweep. THE audited defect: a sweep that did not run is absent
        evidence, never a pass. Re-derived from `stress` itself rather than taken
        from `ready`, so a verdict assembled by hand — or one that crossed a
        JSON boundary and lost its blockers — cannot open this gate. */
  const stress = verdict.stress;
  if (stress === null) {
    block(
      "The stress sweep did not run, so the limit boundary is unproven. A sweep " +
        "that was skipped is missing evidence, not a pass.",
    );
  } else if (stress.passed !== stress.total) {
    block(
      `${stress.total - stress.passed} of ${stress.total} stress cases failed. ` +
        `The sweep walks the policy limits in both directions, so a failure there ` +
        `is a guardrail that does not hold.`,
    );
  }

  /* ── The scenarios, counted rather than trusted. */
  const results = asArray(verdict.results);
  const passed = results.filter((result) => result.passed).length;
  if (results.length === 0) {
    block("No scenario ran, so nothing about this workforce has been proved.");
  } else if (passed !== results.length) {
    block(`${results.length - passed} of ${results.length} sandbox scenarios failed.`);
  }

  /* ── Coverage is per agent IN THIS PLAN, not per agent the suite happened to
        exercise. An agent nobody wrote a scenario for has no evidence, and
        absence of evidence must never read as evidence of safety at a gate. */
  const byAgent = new Map(asArray(verdict.byAgent).map((entry) => [entry.agentId, entry]));
  for (const agent of asArray(plan.agents)) {
    const coverage = byAgent.get(agent.id);
    if (coverage === undefined || coverage.total === 0) {
      block(
        `No sandbox scenario covers ${agent.name || agent.id}, so there is no evidence ` +
          `it behaves. Add a scenario before it goes live.`,
        agent.id,
      );
      continue;
    }
    if (coverage.passed !== coverage.total) {
      block(
        `${agent.name || agent.id} failed ${coverage.total - coverage.passed} of ` +
          `${coverage.total} scenarios.`,
        agent.id,
      );
    }
  }

  /* ── The verdict's own flag gets a vote it can only use to shut the gate.
        When it says "not ready" for a reason nothing above models — a check M3
        grows later, say — believe it and show its words rather than quietly
        overruling it with a derivation written before that check existed. */
  if (blockers.length === 0 && verdict.ready !== true) {
    for (const reason of asArray(verdict.blockers)) {
      block(reason);
    }
    if (blockers.length === 0) {
      block(
        "The sandbox verdict reports that it is not ready but gives no reason. " +
          "An unexplained red verdict cannot be waved through; re-run the sandbox.",
      );
    }
  }

  const stressDetail =
    stress === null
      ? "no stress sweep"
      : `${stress.passed} of ${stress.total} stress cases`;

  return {
    gate: {
      id: "sandbox",
      label: "Sandbox passed",
      satisfied: blockers.length === 0 && verdict.ready === true,
      detail: `${passed} of ${results.length} scenarios and ${stressDetail} passed against v${verdict.planVersion}.`,
      blockers,
    },
    verdict,
  };
}

/* ═══════════════════ Gate 3 — integrations connected ═══════════════════ */

/**
 * Which agents need an integration, in plan order.
 *
 * `required` is read as "anything but an explicit false". A grant that crossed
 * the seam without the flag is malformed, and the safe reading of a malformed
 * grant is the strict one: block the go-live and make someone look, rather than
 * let an agent launch quietly unable to do the job it was activated for.
 */
interface IntegrationDemand {
  required: Map<string, string[]>;
  optional: Map<string, string[]>;
  /** Grants that name no integration at all, and the agent that carries them. */
  malformed: { agentId: string; purpose: string }[];
}

function integrationDemand(plan: ApprovedPlan): IntegrationDemand {
  const required = new Map<string, string[]>();
  const optional = new Map<string, string[]>();
  const malformed: { agentId: string; purpose: string }[] = [];

  for (const agent of asArray(plan.agents)) {
    for (const grant of asArray(agent.tools)) {
      const isRequired = grant.required !== false;
      const integrationId =
        typeof grant.integrationId === "string" ? grant.integrationId.trim() : "";

      if (integrationId === "") {
        // Only a required grant blocks: an optional grant nobody can identify is
        // an agent degrading gracefully without something unnameable.
        if (isRequired) {
          malformed.push({
            agentId: agent.id,
            purpose: typeof grant.purpose === "string" ? grant.purpose : "",
          });
        }
        continue;
      }

      const bucket = isRequired ? required : optional;
      const existing = bucket.get(integrationId);
      if (existing === undefined) bucket.set(integrationId, [agent.id]);
      else if (!existing.includes(agent.id)) existing.push(agent.id);
    }
  }

  // Required for one agent and optional for another is required, full stop.
  for (const integrationId of required.keys()) optional.delete(integrationId);

  return { required, optional, malformed };
}

/**
 * What to tell the owner about a connection that is not usable. Null means the
 * integration is fine.
 *
 * A guarded switch with a refusing default, not a truthiness test: this repo has
 * already shipped the bug where an unrecognised value fell through into the
 * permissive path. "connected" is the only state that opens this gate.
 */
function integrationBlockerText(
  integrationId: string,
  status: IntegrationStatus,
  needs: string,
): string | null {
  switch (status) {
    case "connected":
      return null;
    case "required":
      return `${integrationId} is not connected. ${needs}`;
    case "optional":
      return (
        `${integrationId} is not connected. The integrations registry lists it as ` +
        `optional, but the approved plan marks it required. ${needs}`
      );
    case "needs_approval":
      return (
        `${integrationId} is connected but is still waiting for someone to approve ` +
        `the permissions it asked for, so the runtime cannot call it yet. ${needs}`
      );
  }

  // Unreachable through the type system, reachable at run time: the registry is
  // D's and answers over a seam. An unrecognised connection state cannot be read
  // as connected — see the module header.
  const unhandled: never = status;
  return (
    `${integrationId} reports connection status "${String(unhandled)}", which this ` +
    `build does not recognise. An unknown state is not a connection, so activation ` +
    `is blocked until it is understood. ${needs}`
  );
}

function statusOf(
  integrations: IntegrationProvider,
  integrationId: string,
): { status: IntegrationStatus } | { error: string } {
  try {
    return { status: integrations.getIntegrationStatus(integrationId) };
  } catch (error) {
    return { error: describeError(error) };
  }
}

function integrationsGate(
  plan: ApprovedPlan,
  integrations: IntegrationProvider,
): ActivationGate {
  const names = agentNames(plan);
  const demand = integrationDemand(plan);
  const blockers: ActivationBlocker[] = [];

  for (const malformed of demand.malformed) {
    blockers.push({
      message:
        `${names.get(malformed.agentId) ?? malformed.agentId} has a required tool grant ` +
        `that names no integration${malformed.purpose ? ` ("${malformed.purpose}")` : ""}, ` +
        `so there is nothing to check for it. Fix the plan before activating.`,
      href: GATE_HREF.integrations,
      agentId: malformed.agentId,
    });
  }

  let connected = 0;
  for (const [integrationId, agentIds] of demand.required) {
    const who = agentIds.map((id) => names.get(id) ?? id);
    const needs = `${who.join(", ")} ${plural(who.length, "needs", "need")} it.`;

    const result = statusOf(integrations, integrationId);
    if ("error" in result) {
      // Fail closed: an integration whose state could not be read is not one we
      // may assume is live.
      blockers.push({
        message:
          `${integrationId} could not be checked: ${result.error}. Activation cannot ` +
          `assume a connection it was unable to verify. ${needs}`,
        href: GATE_HREF.integrations,
        integrationId,
      });
      continue;
    }

    const message = integrationBlockerText(integrationId, result.status, needs);
    if (message === null) {
      connected += 1;
      continue;
    }

    blockers.push(
      agentIds.length === 1
        ? {
            message,
            href: GATE_HREF.integrations,
            integrationId,
            // Attributed to an agent only when exactly one needs it; naming one
            // of three would send the owner to the wrong agent's screen.
            agentId: agentIds[0],
          }
        : { message, href: GATE_HREF.integrations, integrationId },
    );
  }

  /* ── Optional connections are counted, never blocked. Contract §3.9 says the
        agent degrades gracefully without them, and the owner deserves to know
        which capabilities are going live switched off. */
  const optionalMissing: string[] = [];
  for (const integrationId of demand.optional.keys()) {
    const result = statusOf(integrations, integrationId);
    if ("error" in result || result.status !== "connected") {
      optionalMissing.push(integrationId);
    }
  }

  const required = demand.required.size;
  const optionalNote =
    optionalMissing.length === 0
      ? ""
      : ` ${optionalMissing.length} optional ${plural(optionalMissing.length, "connection is", "connections are")} ` +
        `missing (${optionalMissing.join(", ")}); those agents degrade gracefully.`;

  return {
    id: "integrations",
    label: "Integrations connected",
    satisfied: blockers.length === 0,
    detail:
      (blockers.length === 0
        ? `${connected} of ${required} required ${plural(required, "connection", "connections")} live.`
        : `${blockers.length} required ${plural(blockers.length, "connection", "connections")} missing.`) +
      optionalNote,
    blockers,
  };
}

/* ═══════════════════════════ The checklist ═══════════════════════════ */

interface ChecklistOutcome {
  checklist: ActivationChecklist;
  /** The verdict the sandbox gate actually read; null when there was none. */
  verdict: SandboxVerdict | null;
}

/**
 * Sequential rather than concurrent: the gates touch three different stores, so
 * there is nothing to win, and an error surfaces in the order the owner reads
 * them.
 *
 * `active` is passed in rather than fetched, so `activate` can decide about
 * supersession and render the checklist from ONE read of the deployment table
 * instead of two that could disagree.
 */
async function buildChecklist(
  plan: ApprovedPlan,
  deps: ActivationDeps,
  active: Deployment | null,
): Promise<ChecklistOutcome> {
  const packages = await packagesGate(plan, deps.packages);
  const sandbox = await sandboxGate(plan, deps.sandbox);
  const integrations = integrationsGate(plan, deps.integrations);

  const gates = [packages, sandbox.gate, integrations];

  return {
    checklist: {
      planId: plan.planId,
      planVersion: plan.version,
      ready: gates.every((gate) => gate.satisfied),
      gates,
      // "Set when THIS plan version is already live" — an older deployment is
      // reported by `activate` as `supersedes`, not here.
      activeDeployment:
        active !== null && active.planId === plan.planId && active.planVersion === plan.version
          ? active
          : null,
    },
    verdict: sandbox.verdict,
  };
}

/**
 * The three gates, re-derived from scratch. Cheap enough to call on every read
 * and deliberately not memoised anywhere — see the module header.
 */
export async function activationChecklist(
  plan: ApprovedPlan,
  deps: ActivationDeps,
): Promise<ActivationChecklist> {
  const active = await deps.scheduler.store.getActiveDeployment(plan.planId);
  return (await buildChecklist(plan, deps, active)).checklist;
}

/** Every blocker across every gate, in gate order, for a caller that wants a list. */
export function activationBlockers(checklist: ActivationChecklist): ActivationBlocker[] {
  return checklist.gates.flatMap((gate) => gate.blockers);
}

/* ═══════════════════════════ Evidence ═══════════════════════════ */

/**
 * FNV-1a, matching `checksumOf` in lib/runtime/factory.ts — same algorithm,
 * same `fnv1a-` prefix, deliberately dependency-free so no node:crypto import
 * reaches an edge runtime. It is duplicated rather than imported because the
 * factory's copy is welded to `AgentSpec`; if a shared hash helper is ever
 * extracted, both should use it.
 */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a-${hash.toString(16).padStart(8, "0")}`;
}

/**
 * The line recorded in a deployment's evidence, answering "which verdict
 * authorised this go-live?" long after the fact.
 *
 * `verdictFingerprint` carries every event of every scenario, which is exactly
 * what makes it a good identity check and a terrible thing to persist inside an
 * audit record. So this stores a digest of it, prefixed with the facts a human
 * reads without tooling: an auditor can eyeball the counts, and can recompute
 * the digest from a stored verdict to prove it is the same one byte for byte.
 */
export function sandboxEvidenceFingerprint(verdict: SandboxVerdict): string {
  const stress = verdict.stress;
  const stressPart =
    stress === null ? "stress:none" : `stress:${stress.passed}-${stress.total}`;
  return [
    `${verdict.planId}@v${verdict.planVersion}`,
    `scenarios:${verdict.passed}-${verdict.total}`,
    stressPart,
    fnv1a(verdictFingerprint(verdict)),
  ].join("/");
}

/* ═══════════════════════════ Go-live ═══════════════════════════ */

export interface ActivateOptions {
  /** User id of whoever pressed the button. Recorded on the deployment. */
  activatedBy: string;
}

export interface ActivationBlocked {
  activated: false;
  outcome: "blocked";
  /** Shows the caller exactly what is missing, gate by gate. */
  checklist: ActivationChecklist;
  blockers: ActivationBlocker[];
}

export interface ActivationSucceeded {
  activated: true;
  /**
   * `activated`  — first go-live for this plan.
   * `superseded` — a previous deployment was live and this one replaces it.
   * `unchanged`  — this exact plan version was already live; nothing was written.
   */
  outcome: "activated" | "superseded" | "unchanged";
  checklist: ActivationChecklist;
  deployment: Deployment;
  /**
   * Null on `unchanged`. Callers must show `registration.rejected`: those are
   * enabled workflows that got no trigger, and a workflow the owner believes is
   * live which nothing will ever start is the worst outcome available.
   */
  registration: TriggerRegistration | null;
  /** The runtime records written; empty on `unchanged`. */
  agents: AgentRuntimeRecord[];
  /** The deployment this one replaces, when the plan was edited. */
  supersedes: Deployment | null;
}

export type ActivationResult = ActivationBlocked | ActivationSucceeded;

/**
 * True when a deployment already covers exactly this plan — same version, same
 * agents, same agent versions.
 *
 * Agent versions are compared as well as the plan version because they can drift
 * apart: contract §3.3 bumps an agent on any change and §3.1 bumps the plan on
 * every approval, so a plan edited without a re-approval would otherwise read as
 * already live and keep firing yesterday's specs.
 */
function coversPlan(deployment: Deployment, plan: ApprovedPlan): boolean {
  if (deployment.planId !== plan.planId) return false;
  if (deployment.planVersion !== plan.version) return false;

  const live = new Map(asArray(deployment.agents).map((a) => [a.agentId, a.agentVersion]));
  const agents = asArray(plan.agents);
  if (live.size !== agents.length) return false;
  return agents.every((agent) => live.get(agent.id) === agent.version);
}

function describeGoLive(
  registered: ScheduledTrigger[],
  rejected: RejectedTrigger[],
  deploymentId: string,
  planVersion: number,
): string {
  const parts = [
    `Live in deployment ${deploymentId} (plan v${planVersion}).`,
    `${registered.length} ${plural(registered.length, "workflow", "workflows")} scheduled.`,
  ];
  if (rejected.length > 0) {
    // Said out loud on the agent's own record, not just in the activation
    // result: the roster is where someone will later ask why it never ran.
    parts.push(
      `${rejected.length} enabled ${plural(rejected.length, "workflow has", "workflows have")} ` +
        `no usable trigger and will never start: ${rejected.map((r) => r.workflowId).join(", ")}.`,
    );
  }
  return parts.join(" ");
}

/**
 * Go-live. Refuses by returning the checklist rather than throwing: "not ready"
 * is the ordinary case the deploy screen exists to render, and an exception
 * carries none of the detail it needs.
 *
 * It DOES throw on a caller bug — a blank `activatedBy` — because a deployment
 * record whose actor is unknown is not an audit record.
 */
export async function activate(
  plan: ApprovedPlan,
  deps: ActivationDeps,
  options: ActivateOptions,
): Promise<ActivationResult> {
  const activatedBy =
    typeof options.activatedBy === "string" ? options.activatedBy.trim() : "";
  if (activatedBy === "") {
    throw new Error(
      "activate: `activatedBy` is required. A deployment record exists to say who " +
        "put this workforce live, and one that cannot answer that is not evidence of anything.",
    );
  }

  const store = deps.scheduler.store;
  const active = await store.getActiveDeployment(plan.planId);
  const { checklist, verdict } = await buildChecklist(plan, deps, active);

  /* ── The gates decide, always and first — including when the plan is already
        live. Refusing to re-activate a live plan whose evidence has since gone
        red changes nothing about what is running, and it is the only answer that
        never reports success while a gate is shut. */
  if (!checklist.ready) {
    return {
      activated: false,
      outcome: "blocked",
      checklist,
      blockers: activationBlockers(checklist),
    };
  }

  /* ── Idempotence: this exact version is already live, so write nothing. See
        the module header for why re-registering would be worse than a no-op. */
  if (active !== null && coversPlan(active, plan)) {
    return {
      activated: true,
      outcome: "unchanged",
      checklist,
      deployment: active,
      registration: null,
      agents: [],
      supersedes: null,
    };
  }

  const supersedes = active;

  /* ── 1. Triggers. Ids are derived, so this overwrites the previous
        registration in place and stands down anything the edit disabled. */
  const registration = await registerPlanTriggers(plan, deps.scheduler);

  const now = deps.scheduler.clock.now().toISOString();
  const deploymentId = deps.scheduler.newId("dep");

  /* ── 2. Agent state. PLAN_CONTRACT §4.2: this is Role C's alone and is never
        written back into the plan, which is why it lives in the scheduler store
        keyed by agent id rather than on `AgentSpec`. */
  const agents: AgentRuntimeRecord[] = [];
  for (const agent of asArray(plan.agents)) {
    const record: AgentRuntimeRecord = {
      agentId: agent.id,
      agentVersion: agent.version,
      state: "active",
      detail: describeGoLive(
        registration.registered.filter((trigger) => trigger.agentId === agent.id),
        registration.rejected.filter((rejected) => rejected.agentId === agent.id),
        deploymentId,
        plan.version,
      ),
      updatedAt: now,
    };
    await store.saveAgentState(record);
    agents.push(record);
  }

  /* ── 3. The deployment, last, so a crash leaves work to finish rather than a
        record claiming work that never happened. */
  const deployment: Deployment = {
    deploymentId,
    planId: plan.planId,
    planVersion: plan.version,
    activatedAt: now,
    activatedBy,
    agents: asArray(plan.agents).map((agent) => ({
      agentId: agent.id,
      agentVersion: agent.version,
    })),
    triggerIds: registration.registered.map((trigger) => trigger.triggerId),
    evidence: {
      // Read off the gates rather than hardcoded to true: if the checklist ever
      // grows a way to be ready with a soft gate, this record must not lie.
      packagesReady: gateSatisfied(checklist, "packages"),
      sandboxReady: gateSatisfied(checklist, "sandbox"),
      // WHICH verdict authorised this go-live, not merely that one did.
      sandboxFingerprint: verdict === null ? null : sandboxEvidenceFingerprint(verdict),
      integrationsReady: gateSatisfied(checklist, "integrations"),
    },
  };
  await store.saveDeployment(deployment);

  return {
    activated: true,
    outcome: supersedes === null ? "activated" : "superseded",
    checklist,
    deployment,
    registration,
    agents,
    supersedes,
  };
}

function gateSatisfied(checklist: ActivationChecklist, id: ActivationGateId): boolean {
  return checklist.gates.find((gate) => gate.id === id)?.satisfied === true;
}

/* ═══════════════════════════ Pause and resume ═══════════════════════════ */

export interface AgentStateChange {
  agentId: string;
  /** False when the agent was already in the requested state, or was refused. */
  changed: boolean;
  /** The record as stored; null when this agent has no runtime record. */
  record: AgentRuntimeRecord | null;
  /** Triggers this call switched off or back on. */
  triggers: ScheduledTrigger[];
  /** Resume only: workflows left without a trigger, and why. */
  rejected: RejectedTrigger[];
  /** What happened, in the owner's language. */
  detail: string;
}

export interface PauseOptions {
  /** User id, recorded in the record's detail — `AgentRuntimeRecord` has no actor field. */
  pausedBy?: string;
  reason?: string;
}

/**
 * Stop one agent: disable its triggers, then mark it paused.
 *
 * THAT ORDER IS THE POINT. The invariant worth protecting is "an agent the
 * roster shows as paused has no enabled triggers", so the flags go off first; a
 * crash in between leaves an agent that displays as active and does nothing,
 * which is visible and harmless, and a second pause completes it.
 *
 * It takes no plan and refuses nothing. Stopping is always safe, so an agent
 * with no runtime record still has its triggers switched off rather than being
 * told it was never activated — the opposite of `resumeAgent`, which starts
 * things and therefore demands evidence.
 */
export async function pauseAgent(
  agentId: string,
  deps: Pick<SchedulerDeps, "store" | "clock">,
  options: PauseOptions = {},
): Promise<AgentStateChange> {
  const live = await deps.store.listTriggers({ agentId, enabled: true });
  const stoodDown: ScheduledTrigger[] = [];
  for (const trigger of live) {
    const off: ScheduledTrigger = { ...trigger, enabled: false, nextFireAt: null };
    await deps.store.saveTrigger(off);
    stoodDown.push(off);
  }

  const existing = await deps.store.getAgentState(agentId);
  const scheduleNote = `${stoodDown.length} ${plural(stoodDown.length, "trigger", "triggers")} switched off`;

  if (existing === null) {
    return {
      agentId,
      changed: stoodDown.length > 0,
      record: null,
      triggers: stoodDown,
      rejected: [],
      detail:
        `Agent "${agentId}" has no runtime record — it was never activated — so there was ` +
        `no state to pause. ${scheduleNote} anyway, because stopping is never the unsafe direction.`,
    };
  }

  if (existing.state === "paused" && stoodDown.length === 0) {
    return {
      agentId,
      changed: false,
      record: existing,
      triggers: [],
      rejected: [],
      detail: `${agentId} was already paused with no enabled triggers; nothing to do.`,
    };
  }

  const by = options.pausedBy ? ` by ${options.pausedBy}` : "";
  const why = options.reason ? ` ${options.reason}` : "";
  const record: AgentRuntimeRecord = {
    ...existing,
    state: "paused",
    detail: `Paused${by}; ${scheduleNote}. Scheduled runs will not fire until it is resumed.${why}`,
    updatedAt: deps.clock.now().toISOString(),
  };
  await deps.store.saveAgentState(record);

  return {
    agentId,
    changed: true,
    record,
    triggers: stoodDown,
    rejected: [],
    detail: record.detail,
  };
}

export interface ResumeOptions {
  resumedBy?: string;
}

/**
 * Start one agent again: mark it active, then re-register its triggers FROM THE
 * PLAN.
 *
 * Re-registering rather than flipping `enabled` back on is the whole design, and
 * it is not a detail. A stood-down trigger and a paused trigger are the same
 * record — `enabled: false` — so a resume that simply re-enabled everything it
 * found would switch on workflows the owner had disabled in the plan. Deriving
 * from the plan means only currently-enabled workflows come back, and each
 * schedule gets its `nextFireAt` recomputed.
 *
 * RUNS MISSED WHILE PAUSED ARE NOT BACKFILLED, and here that is deliberate
 * rather than merely convenient. `advanceScheduleTrigger` makes the same choice
 * after an outage; a pause is stronger still — the owner said "not now" on
 * purpose, so resuming schedules the next occurrence, never the ones they
 * declined.
 *
 * The order mirrors `pauseAgent` and protects the same invariant: the record
 * says active before any trigger can fire, so nothing ever acts while the roster
 * shows it stopped.
 */
export async function resumeAgent(
  agentId: string,
  plan: ApprovedPlan,
  deps: Pick<SchedulerDeps, "store" | "clock">,
  options: ResumeOptions = {},
): Promise<AgentStateChange> {
  const existing = await deps.store.getAgentState(agentId);

  const refuse = (detail: string): AgentStateChange => ({
    agentId,
    changed: false,
    record: existing,
    triggers: [],
    rejected: [],
    detail,
  });

  const spec = asArray(plan.agents).find((agent) => agent.id === agentId);
  if (spec === undefined) {
    return refuse(
      `Agent "${agentId}" is not in plan ${plan.planId}, so its triggers cannot be ` +
        `re-derived. Resume needs the plan the agent was activated from.`,
    );
  }

  if (existing === null) {
    return refuse(
      `Agent "${agentId}" has no runtime record, so it was never activated and there is ` +
        `nothing to resume. Activate the plan instead — that is the path with the gates on it.`,
    );
  }

  // Resume is not a way around the checklist. A spec that has moved on since
  // activation may have no built package, and flipping it live here would put an
  // agent into production that the packages gate never saw.
  if (existing.agentVersion !== spec.version) {
    return refuse(
      `${spec.name || agentId} was activated at version ${existing.agentVersion} but the plan ` +
        `now carries version ${spec.version}. Resume restarts what was proved, not what has ` +
        `changed since — re-activate the plan so the packages and sandbox gates run.`,
    );
  }

  if (existing.state !== "paused" && existing.state !== "active") {
    return refuse(
      `${spec.name || agentId} is "${existing.state}", and resume only restarts an agent that ` +
        `was paused. Re-activate the plan once whatever put it in that state is fixed.`,
    );
  }

  const record: AgentRuntimeRecord = {
    ...existing,
    state: "active",
    detail: `Resuming${options.resumedBy ? ` by ${options.resumedBy}` : ""}; re-registering triggers.`,
    updatedAt: deps.clock.now().toISOString(),
  };
  await deps.store.saveAgentState(record);

  // One agent's worth of the plan. `registerPlanTriggers` walks `plan.agents`
  // and nothing else, so this touches exactly this agent's triggers.
  const registration = await registerPlanTriggers({ ...plan, agents: [spec] }, deps);

  const rejectedNote =
    registration.rejected.length === 0
      ? ""
      : ` ${registration.rejected.length} enabled ` +
        `${plural(registration.rejected.length, "workflow has", "workflows have")} no usable ` +
        `trigger and will not start: ${registration.rejected.map((r) => r.workflowId).join(", ")}.`;

  // Written twice on purpose. The first write is what makes it safe for a
  // trigger to fire; this one is the sentence the roster shows, and it cannot be
  // composed until registration has said how many workflows came back.
  const resumed: AgentRuntimeRecord = {
    ...record,
    detail:
      `Resumed${options.resumedBy ? ` by ${options.resumedBy}` : ""}; ` +
      `${registration.registered.length} ${plural(registration.registered.length, "workflow", "workflows")} ` +
      `scheduled from the next occurrence. Runs missed while paused are not backfilled.${rejectedNote}`,
    updatedAt: record.updatedAt,
  };
  await deps.store.saveAgentState(resumed);

  return {
    agentId,
    changed: true,
    record: resumed,
    triggers: registration.registered,
    rejected: registration.rejected,
    detail: resumed.detail,
  };
}
