/**
 * components/live/deploy/api.ts — the only place an answer from
 * `/api/runtime/activation` or `/api/runtime/agents` is allowed to become
 * something the Activation screen renders.
 *
 * WHAT THIS REPLACES. Until now `/app/deploy` was a simulation: it read
 * `lib/mock/store`, animated agents switching on one at a time, and never sent a
 * request anywhere. The runtime underneath it has had three real gates and a real
 * go-live for weeks. Nothing here talks to the demo store, and nothing here
 * invents a fact the runtime did not send.
 *
 * A 409 IS A RESULT, NOT A FAILURE, and it is the most important thing in this
 * module. The route's own header says so: "a refused go-live returns 409 with the
 * whole checklist, never a 500 and never a 200", because `activate` refuses by
 * RETURNING the checklist rather than throwing. Its body carries the three gates
 * and every blocker, which is exactly what the owner needs to know which gate
 * shut. A client that treated a non-2xx as an error would throw that away and
 * print "something went wrong" over the product's central safety feature. So 409
 * lands in its own `blocked` branch carrying the checklist, and only the transport
 * failures are errors.
 *
 * PARSED, NOT CAST, for the reason `components/live/workspace/runtime-api.ts`
 * gives at length: `await res.json() as Checklist` tells TypeScript a shape
 * nothing checked, and the first field the route renames renders as a blank where
 * a blocker should be. On THIS screen the specific cost is a gate that reads as
 * satisfied because `satisfied` arrived as `undefined`, next to a button that
 * puts a workforce live.
 *
 * THREE STRINGS ARE READ AS PLAIN STRINGS ON PURPOSE, AND THAT IS A DIFFERENT
 * DECISION FROM THE ONE THE OTHER LANES MADE. The house rule is to refuse a word
 * this build does not recognise, because a word with no judgement attached lands
 * in whichever bucket a fallback picked. It holds where refusing costs nothing.
 * Here it would cost the whole answer, so each case is decided on which direction
 * the mistake runs in:
 *
 *   `gate.id` — nothing on this screen is decided by it; it selects one optional
 *   sentence of framing. A FOURTH GATE ADDED TO THE RUNTIME MUST APPEAR ON THIS
 *   SCREEN, and refusing the read would hide it — the one outcome a go-live
 *   checklist may never produce.
 *
 *   `plan.source` and `live.source` — read by EQUALITY against the value that
 *   suppresses a warning ("ingested", "deployment") rather than by membership of
 *   a union. A source this build has never heard of must therefore disclose
 *   loudly rather than quietly pass as the owner's own workforce. Refusing the
 *   union would have been the reverse of safe: it would blank the screen that was
 *   about to say "this is the demo".
 *
 *   `outcome` — arrives AFTER a write has already happened. Refusing it would
 *   leave the screen unable to report a go-live that has already occurred, which
 *   is the worst way to be strict. An unrecognised word is rendered verbatim with
 *   an admission that this build does not know what it means.
 *
 * `lifecycle` is read the same way and for the same reason: the runtime sends its
 * own `note` beside every tag, so an unfamiliar word arrives with its meaning
 * attached and needs no judgement from here.
 *
 * The readers are duplicated rather than shared with the other live lanes. Each
 * lane in components/live/** carries its own — see agents/api.ts, pipeline/api.ts
 * and workspace/runtime-api.ts — because each one's error sentences name its own
 * endpoint, and a shared `str()` that said "the response" would send whoever is
 * debugging to the wrong route.
 */

import type { AgentLifecycle } from "@/lib/runtime/active-plan";
import type { AgentRuntimeState } from "@/lib/runtime/schedule/types";

/* ═══════════════════════════ Vocabularies ═══════════════════════════ */

/**
 * The five runtime states, as values a run-time check can consult.
 *
 * Refused when unrecognised, unlike the strings in the module header, and the
 * asymmetry is deliberate: this one appears on a per-agent row where the only
 * thing the word does is tell an owner whether that agent is running. There is
 * no note beside it to carry the meaning, and the roster lane already refuses
 * the same union (components/live/agents/api.ts). Written as a keyed object so a
 * sixth state added to the runtime fails to compile here.
 */
const AGENT_STATES = Object.keys({
  building: true,
  validated: true,
  active: true,
  paused: true,
  failed: true,
} satisfies Record<AgentRuntimeState, true>) as AgentRuntimeState[];

/**
 * The four lifecycle tags this build knows how to frame.
 *
 * NOT a gate on the read — see the module header. `lifecycleMeta` in ./format.ts
 * consults this list and returns null for anything else, and the row then renders
 * the runtime's own `note` with the unfamiliar word shown as it arrived.
 */
export const LIFECYCLE_TAGS = Object.keys({
  running: true,
  drifted: true,
  planned: true,
  retired: true,
} satisfies Record<AgentLifecycle, true>) as AgentLifecycle[];

/* ═══════════════════════════ Shapes ═══════════════════════════ */

export interface BlockerView {
  /** The runtime's sentence. Rendered verbatim, never paraphrased. */
  message: string;
  /** Where the owner goes to open this gate. The runtime's own route. */
  href: string;
  agentId: string | null;
  integrationId: string | null;
}

export interface GateView {
  /** "packages" | "sandbox" | "integrations" today. Read open — see the header. */
  id: string;
  label: string;
  satisfied: boolean;
  /** One line whether or not the gate is satisfied. The runtime's words. */
  detail: string;
  blockers: BlockerView[];
}

export interface DeploymentView {
  deploymentId: string;
  planId: string;
  planVersion: number;
  activatedAt: string;
  activatedBy: string;
  /** Agent versions AS ACTIVATED — what is live, not what is planned. */
  agents: { agentId: string; agentVersion: number }[];
  triggerIds: string[];
  /**
   * The gates that authorised this go-live, frozen for audit.
   *
   * NULLABLE, unlike everything above it, and that is a tolerance rather than an
   * oversight: this field is purely informational, and a deployment record
   * written before it existed would otherwise take the entire checklist read down
   * with it. `resolveActivePlan` makes the same allowance for a deployment with
   * no frozen plan, for the same reason — the Operate surface showing a record
   * with a missing field beats the Operate surface showing an error page. Null is
   * rendered as "this record carries no evidence", which is worth seeing.
   */
  evidence: {
    packagesReady: boolean;
    sandboxReady: boolean;
    /** Which sandbox verdict authorised it. Null when there was none. */
    sandboxFingerprint: string | null;
    integrationsReady: boolean;
  } | null;
}

export interface ChecklistView {
  planId: string;
  planVersion: number;
  /** True only when every gate is satisfied. Never cached by the runtime. */
  ready: boolean;
  gates: GateView[];
  /** Set only when THIS plan version is already live. */
  activeDeployment: DeploymentView | null;
}

export interface PlanSourceView {
  planId: string;
  version: number;
  /**
   * "ingested" is the owner's own workforce. Anything else — "fixture" today —
   * is disclosed, because the button on this screen puts something live.
   */
  source: string;
  /** The runtime's sentence explaining a fallback. Null on a real plan. */
  fallbackReason: string | null;
}

export interface LiveCountsView {
  /** "deployment" when a real workforce is running; anything else means none. */
  source: string;
  /** Null when nothing is deployed. */
  deploymentId: string | null;
  running: number;
  drifted: number;
  planned: number;
  retired: number;
}

export interface LifecycleRowView {
  agentId: string;
  /** running | drifted | planned | retired, read open. See the header. */
  lifecycle: string;
  /** The version actually deployed; null when it never was. */
  runningVersion: number | null;
  /** The version the current plan asks for; null once removed from it. */
  plannedVersion: number | null;
  /** One line from the runtime. Carries the meaning of an unfamiliar tag. */
  note: string;
}

/** Everything `GET /api/runtime/activation` says, in one object. */
export interface ChecklistSnapshot {
  mode: string;
  plan: PlanSourceView;
  live: LiveCountsView;
  lifecycle: LifecycleRowView[];
  checklist: ChecklistView;
  /** Every blocker in gate order — the runtime's own flattening, not ours. */
  blockers: BlockerView[];
}

export interface AgentRecordView {
  agentId: string;
  agentVersion: number;
  state: AgentRuntimeState;
  /** The runtime's sentence about this agent's go-live. Shown verbatim. */
  detail: string;
  updatedAt: string;
}

export interface RejectedTriggerView {
  agentId: string;
  workflowId: string;
  kind: string;
  /** Why nothing will ever start this workflow. The runtime's words. */
  reason: string;
}

export interface RegistrationView {
  registered: number;
  retired: number;
  /**
   * Enabled workflows that got no trigger. `activate` calls these the worst
   * outcome available — a workflow the owner believes is live which nothing will
   * ever start — and says callers MUST render every one. See `LiveState`.
   */
  rejected: RejectedTriggerView[];
}

export interface ActivatedView {
  /**
   * "activated" | "superseded" | "unchanged" from the runtime, read open.
   * `unchanged` means this exact plan version was already live and NOTHING WAS
   * WRITTEN, which the screen must not report as a second go-live.
   */
  outcome: string;
  checklist: ChecklistView;
  deployment: DeploymentView;
  /** The deployment this one replaces, when the plan was edited. */
  supersedes: DeploymentView | null;
  /** The runtime records written. Empty on `unchanged`. */
  agents: AgentRecordView[];
  /** Null on `unchanged` — nothing was registered because nothing changed. */
  registration: RegistrationView | null;
}

/**
 * The organization allowlist's refusal, kept whole.
 *
 * WHY IT IS HANDLED HERE AT ALL, stated honestly, because a comment claiming a
 * property the code does not have is worse than no comment. `/api/runtime/
 * activation` does not call `organizationGate` today: the allowlist reaches this
 * path through `liveIntegrationProviderFor`, which hands back a provider that
 * refuses every call, and the integrations gate reports that as ONE blocker in
 * the provider's own words (`wholesaleRefusal`, lib/runtime/schedule/
 * activation.ts). So a 403 is not on this route's ordinary path today.
 *
 * It is read anyway because the body is the SHARED refusal — lib/runtime/pipeline/
 * organization-gate.ts is explicit that every door answers byte for byte, and this
 * is a door that starts an activation; the day it grows the early gate, a screen
 * that printed "403" instead of the body would drop the only sentence saying which
 * id was refused and what to add. `error` and `hint` are written to be actionable
 * and are rendered verbatim; the count in `allowlist` is deliberately a count and
 * never a list, and this screen does not go looking for ids it was not sent.
 */
export interface OrganizationRefusalView {
  error: string;
  hint: string;
  /** "organization_not_allowlisted" when the body carried the discriminant. */
  code: string | null;
  /** The caller's own input, echoed back. Null when the payload named none. */
  organizationId: string | null;
  allowlist: { variable: string; configured: boolean; permitted: number } | null;
  /** The standing note that this allowlist is a stopgap. */
  stopgap: string | null;
}

/* ═══════════════════════ The roster, narrowly ═══════════════════════ */

/**
 * One agent as the roster describes it — the lookup half, not the list.
 *
 * Deliberately does NOT carry the lifecycle tag, even though the route puts one
 * on every row here too. The tags this screen renders come from the
 * reconciliation array, which is the complete one; reading them here as well
 * would be a second copy of the same fact, and the day the two disagreed this
 * screen would show whichever it happened to reach for.
 */
export interface RosterAgentView {
  agentId: string;
  name: string;
  /** The plan's version. `runtimeState` belongs to what was activated. */
  version: number;
  /** Null when no runtime record exists — never activated. Not a state. */
  runtimeState: AgentRuntimeState | null;
  /** Null with the state, for the same reason. The runtime's own sentence. */
  runtimeDetail: string | null;
  enabledTriggers: number;
  registeredTriggers: number;
}

/**
 * What this screen takes from `/api/runtime/agents`, and nothing else.
 *
 * Narrow ON PURPOSE. The roster answers with policy, runs, approvals, quiet hours
 * and every workflow, all of which belong to `/app/workspace/agents` and none of
 * which this screen renders. A parser that read them would be a second copy of
 * that screen's contract, kept in step by nobody, and would refuse this screen's
 * read over a field it never shows.
 *
 * It is a SECOND read rather than a second use of the checklist's own `lifecycle`
 * array because that array carries agent ids and no names, and "brightpath-finance
 * v2 is drifted" is not a sentence an owner should have to decode. It is also the
 * CHEAP read: the checklist re-proves the workforce to answer, so the roster is
 * what the change stream is allowed to refresh.
 *
 * `lifecycle` AND `agents` ARE BOTH READ, AND THEY ARE NOT THE SAME LIST. `agents`
 * is one row per agent in the CURRENT plan; `lifecycle` is the reconciliation and
 * carries every agent from EITHER plan. The difference is exactly the `retired`
 * rows — deployed once, since removed from the plan, still running because
 * triggers are frozen at go-live — and they appear only in the second. Building
 * this screen's list out of `agents` would have silently dropped the one category
 * of agent nobody expects and which this button abandons. So the rows come from
 * `lifecycle` and `agents` is used as a lookup for names and runtime records.
 */
export interface RosterSnapshot {
  /** The server's instant, so nothing here is judged against a browser clock. */
  now: string;
  /** Triggers exist — the cheapest sound evidence that a go-live happened. */
  activated: boolean;
  plan: PlanSourceView;
  live: LiveCountsView;
  deployment: {
    deploymentId: string;
    planVersion: number;
    activatedAt: string;
    activatedBy: string;
  } | null;
  /** Every agent in either plan, tagged. The complete list — see above. */
  lifecycle: LifecycleRowView[];
  /** One row per agent in the current plan. A lookup, never the list. */
  agents: RosterAgentView[];
}

/* ═══════════════════════════ Outcomes ═══════════════════════════ */

/**
 * Why an attempt produced no answer, kept apart because the three ask three
 * different things of the reader.
 *
 *   refused      the runtime answered and declined the REQUEST. Nothing ran.
 *   unreachable  the browser never got an answer. Nothing at all is known.
 *   malformed    the runtime answered in a shape this screen cannot read — a
 *                contract break, not a workforce problem.
 */
export type FailureKind = "refused" | "unreachable" | "malformed";

export interface Failure {
  kind: FailureKind;
  message: string;
  /** The route's own `hint`, when it sent one. Never invented. */
  hint: string | null;
  /** Null on a transport failure — there was no response to have a status. */
  status: number | null;
}

export type ChecklistOutcome =
  | { kind: "checklist"; snapshot: ChecklistSnapshot }
  | { kind: "forbidden"; refusal: OrganizationRefusalView }
  | { kind: "failed"; failure: Failure };

export type RosterOutcome =
  | { kind: "roster"; snapshot: RosterSnapshot }
  | { kind: "forbidden"; refusal: OrganizationRefusalView }
  | { kind: "failed"; failure: Failure };

/**
 * What a press of the go-live button can produce.
 *
 * `blocked` is not in the failure branch and that is the whole point: it is a 409
 * carrying the complete checklist, which is the runtime refusing on purpose and
 * saying which gate shut. See the module header.
 */
export type GoLiveOutcome =
  | { kind: "activated"; result: ActivatedView }
  | { kind: "blocked"; outcome: string; checklist: ChecklistView; blockers: BlockerView[] }
  | { kind: "forbidden"; refusal: OrganizationRefusalView }
  | { kind: "failed"; failure: Failure };

/* ═══════════════════════════ Strict readers ═══════════════════════════ */

export class DeployShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeployShapeError";
  }
}

/** Every reader names the field it rejected, so the screen can show it verbatim. */
function fail(where: string, why: string): never {
  throw new DeployShapeError(`${where} ${why}`);
}

function obj(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(where, "is not a JSON object.");
  }
  return value as Record<string, unknown>;
}

function arr(value: unknown, where: string): unknown[] {
  if (!Array.isArray(value)) fail(where, "is missing or not an array.");
  return value;
}

function str(source: Record<string, unknown>, key: string, where: string): string {
  const value = source[key];
  if (typeof value !== "string") fail(`${where}.${key}`, "is missing or not a string.");
  return value;
}

function strOrNull(
  source: Record<string, unknown>,
  key: string,
  where: string,
): string | null {
  const value = source[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") fail(`${where}.${key}`, "is not a string or null.");
  return value;
}

function num(source: Record<string, unknown>, key: string, where: string): number {
  const value = source[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${where}.${key}`, "is missing or not a finite number.");
  }
  return value;
}

function numOrNull(
  source: Record<string, unknown>,
  key: string,
  where: string,
): number | null {
  const value = source[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${where}.${key}`, "is not a finite number or null.");
  }
  return value;
}

function flag(source: Record<string, unknown>, key: string, where: string): boolean {
  const value = source[key];
  if (typeof value !== "boolean") fail(`${where}.${key}`, "is missing or not true/false.");
  return value;
}

function strList(source: Record<string, unknown>, key: string, where: string): string[] {
  return arr(source[key], `${where}.${key}`).map((item, index) => {
    if (typeof item !== "string") fail(`${where}.${key}[${index}]`, "is not a string.");
    return item;
  });
}

function member<T extends string>(
  source: Record<string, unknown>,
  key: string,
  where: string,
  allowed: readonly T[],
): T {
  const value = source[key];
  const match = allowed.find((candidate) => candidate === value);
  if (match === undefined) {
    fail(
      `${where}.${key}`,
      `is ${JSON.stringify(value)}, which this build does not recognise. ` +
        `Expected one of: ${allowed.join(", ")}.`,
    );
  }
  return match;
}

/* ═══════════════════════════ The checklist ═══════════════════════════ */

function blockerView(value: unknown, where: string): BlockerView {
  const raw = obj(value, where);
  return {
    message: str(raw, "message", where),
    href: str(raw, "href", where),
    agentId: strOrNull(raw, "agentId", where),
    integrationId: strOrNull(raw, "integrationId", where),
  };
}

function gateView(value: unknown, where: string): GateView {
  const raw = obj(value, where);
  return {
    id: str(raw, "id", where),
    label: str(raw, "label", where),
    satisfied: flag(raw, "satisfied", where),
    detail: str(raw, "detail", where),
    blockers: arr(raw.blockers, `${where}.blockers`).map((item, index) =>
      blockerView(item, `${where}.blockers[${index}]`),
    ),
  };
}

/**
 * A deployment record.
 *
 * `plan` is on the wire — a whole frozen `ApprovedPlan` — and is deliberately not
 * read. This screen shows what went live and who authorised it; the workforce
 * itself is `/app/workspace/agents`, and parsing a plan here would make an
 * activation report refuse to render over a field it never puts on screen.
 */
function deploymentView(value: unknown, where: string): DeploymentView {
  const raw = obj(value, where);
  const evidenceAt = `${where}.evidence`;
  const evidence =
    raw.evidence === null || raw.evidence === undefined ? null : obj(raw.evidence, evidenceAt);

  return {
    deploymentId: str(raw, "deploymentId", where),
    planId: str(raw, "planId", where),
    planVersion: num(raw, "planVersion", where),
    activatedAt: str(raw, "activatedAt", where),
    activatedBy: str(raw, "activatedBy", where),
    agents: arr(raw.agents, `${where}.agents`).map((item, index) => {
      const at = `${where}.agents[${index}]`;
      const agent = obj(item, at);
      return { agentId: str(agent, "agentId", at), agentVersion: num(agent, "agentVersion", at) };
    }),
    triggerIds: strList(raw, "triggerIds", where),
    evidence:
      evidence === null
        ? null
        : {
            packagesReady: flag(evidence, "packagesReady", evidenceAt),
            sandboxReady: flag(evidence, "sandboxReady", evidenceAt),
            sandboxFingerprint: strOrNull(evidence, "sandboxFingerprint", evidenceAt),
            integrationsReady: flag(evidence, "integrationsReady", evidenceAt),
          },
  };
}

function deploymentOrNull(value: unknown, where: string): DeploymentView | null {
  if (value === null || value === undefined) return null;
  return deploymentView(value, where);
}

/**
 * The checklist itself.
 *
 * `where` is passed in because the same shape arrives from three places — the
 * GET, the 409 and the success body — and a reader that named the wrong one sends
 * whoever is debugging to the wrong request.
 */
function checklistView(value: unknown, where: string): ChecklistView {
  const raw = obj(value, where);
  return {
    planId: str(raw, "planId", where),
    planVersion: num(raw, "planVersion", where),
    ready: flag(raw, "ready", where),
    gates: arr(raw.gates, `${where}.gates`).map((item, index) =>
      gateView(item, `${where}.gates[${index}]`),
    ),
    activeDeployment: deploymentOrNull(raw.activeDeployment, `${where}.activeDeployment`),
  };
}

function planSourceView(value: unknown, where: string): PlanSourceView {
  const raw = obj(value, where);
  return {
    planId: str(raw, "planId", where),
    // The activation route calls it `version`; the roster calls it `planVersion`.
    // Read where each one puts it rather than guessing, so neither read silently
    // reports version 0 for a plan that is on v7.
    version: raw.version === undefined ? num(raw, "planVersion", where) : num(raw, "version", where),
    source: str(raw, "source", where),
    fallbackReason: strOrNull(raw, "fallbackReason", where),
  };
}

function liveCountsView(value: unknown, where: string): LiveCountsView {
  const raw = obj(value, where);
  return {
    source: str(raw, "source", where),
    deploymentId: strOrNull(raw, "deploymentId", where),
    running: num(raw, "running", where),
    drifted: num(raw, "drifted", where),
    planned: num(raw, "planned", where),
    retired: num(raw, "retired", where),
  };
}

function lifecycleRowView(value: unknown, where: string): LifecycleRowView {
  const raw = obj(value, where);
  return {
    agentId: str(raw, "agentId", where),
    lifecycle: str(raw, "lifecycle", where),
    runningVersion: numOrNull(raw, "runningVersion", where),
    plannedVersion: numOrNull(raw, "plannedVersion", where),
    note: str(raw, "note", where),
  };
}

function checklistSnapshot(value: unknown): ChecklistSnapshot {
  const where = "The activation details";
  const root = obj(value, where);
  return {
    mode: str(root, "mode", where),
    plan: planSourceView(root.plan, `${where}.plan`),
    live: liveCountsView(root.live, `${where}.live`),
    lifecycle: arr(root.lifecycle, `${where}.lifecycle`).map((item, index) =>
      lifecycleRowView(item, `${where}.lifecycle[${index}]`),
    ),
    checklist: checklistView(root.checklist, `${where}.checklist`),
    blockers: arr(root.blockers, `${where}.blockers`).map((item, index) =>
      blockerView(item, `${where}.blockers[${index}]`),
    ),
  };
}

/* ═══════════════════════════ The go-live body ═══════════════════════════ */

function agentRecordView(value: unknown, where: string): AgentRecordView {
  const raw = obj(value, where);
  return {
    agentId: str(raw, "agentId", where),
    agentVersion: num(raw, "agentVersion", where),
    state: member(raw, "state", where, AGENT_STATES),
    detail: str(raw, "detail", where),
    updatedAt: str(raw, "updatedAt", where),
  };
}

function registrationView(value: unknown, where: string): RegistrationView | null {
  if (value === null || value === undefined) return null;
  const raw = obj(value, where);
  return {
    // Counted, not read row by row: this screen reports how many workflows are
    // scheduled, and the schedule itself is /app/workspace/calendar's subject.
    registered: arr(raw.registered, `${where}.registered`).length,
    retired: arr(raw.retired, `${where}.retired`).length,
    // Read in full, because every one of these is a workflow that will never
    // start. See `RegistrationView`.
    rejected: arr(raw.rejected, `${where}.rejected`).map((item, index) => {
      const at = `${where}.rejected[${index}]`;
      const row = obj(item, at);
      return {
        agentId: str(row, "agentId", at),
        workflowId: str(row, "workflowId", at),
        kind: str(row, "kind", at),
        reason: str(row, "reason", at),
      };
    }),
  };
}

function activatedView(value: unknown): ActivatedView {
  const where = "The go-live details";
  const root = obj(value, where);
  return {
    outcome: str(root, "outcome", where),
    checklist: checklistView(root.checklist, `${where}.checklist`),
    deployment: deploymentView(root.deployment, `${where}.deployment`),
    supersedes: deploymentOrNull(root.supersedes, `${where}.supersedes`),
    agents: arr(root.agents, `${where}.agents`).map((item, index) =>
      agentRecordView(item, `${where}.agents[${index}]`),
    ),
    registration: registrationView(root.registration, `${where}.registration`),
  };
}

/* ═══════════════════════════ The roster ═══════════════════════════ */

function rosterAgentView(value: unknown, where: string): RosterAgentView {
  const raw = obj(value, where);
  const runtimeRaw = raw.runtime;
  const runtime =
    runtimeRaw === null || runtimeRaw === undefined ? null : obj(runtimeRaw, `${where}.runtime`);
  const countsAt = `${where}.counts`;
  const counts = obj(raw.counts, countsAt);

  return {
    agentId: str(raw, "agentId", where),
    name: str(raw, "name", where),
    version: num(raw, "version", where),
    /* Null is a state of its own and is NOT one of the five words: it means no
       runtime record exists, so this agent has never been through activation.
       Collapsing it into any of them would report an agent that was never
       activated as one that is sitting there in some state. */
    runtimeState:
      runtime === null ? null : member(runtime, "state", `${where}.runtime`, AGENT_STATES),
    runtimeDetail: runtime === null ? null : str(runtime, "detail", `${where}.runtime`),
    enabledTriggers: num(counts, "enabledTriggers", countsAt),
    registeredTriggers: num(counts, "registeredTriggers", countsAt),
  };
}

function rosterSnapshot(value: unknown): RosterSnapshot {
  const where = "The agent list";
  const root = obj(value, where);
  const deploymentRaw = root.deployment;

  return {
    now: str(root, "now", where),
    activated: flag(root, "activated", where),
    plan: planSourceView(root.plan, `${where}.plan`),
    live: liveCountsView(root.live, `${where}.live`),
    deployment:
      deploymentRaw === null || deploymentRaw === undefined
        ? null
        : (() => {
            const at = `${where}.deployment`;
            const row = obj(deploymentRaw, at);
            return {
              deploymentId: str(row, "deploymentId", at),
              planVersion: num(row, "planVersion", at),
              activatedAt: str(row, "activatedAt", at),
              activatedBy: str(row, "activatedBy", at),
            };
          })(),
    lifecycle: arr(root.lifecycle, `${where}.lifecycle`).map((item, index) =>
      lifecycleRowView(item, `${where}.lifecycle[${index}]`),
    ),
    agents: arr(root.agents, `${where}.agents`).map((item, index) =>
      rosterAgentView(item, `${where}.agents[${index}]`),
    ),
  };
}

/* ═══════════════════════════ Transport ═══════════════════════════ */

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (text.trim() === "") return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // Kept as text so an HTML error page from a proxy is still legible.
    return text;
  }
}

function record(body: unknown): Record<string, unknown> | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

function text(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** The route's own `{ error }` sentence when there is one; the status if not. */
function errorMessage(body: unknown, response: Response): string {
  const root = record(body);
  if (root !== null) {
    const stated = text(root, "error");
    if (stated !== null) return stated;
  }
  if (typeof body === "string" && body.trim() !== "") return body.slice(0, 400);
  return `The request came back as ${response.status} ${response.statusText}.`;
}

function errorHint(body: unknown): string | null {
  const root = record(body);
  return root === null ? null : text(root, "hint");
}

/**
 * The organization refusal, or null when this is an ordinary error body.
 *
 * Recognised by its `code` discriminant OR by a 403 carrying both `error` and
 * `hint`, and it needs both of those to qualify: the whole reason this shape gets
 * its own branch is that those two fields are written to be actionable, and a
 * body missing one of them has nothing to add over the ordinary error rendering.
 * The rest of the fields are optional here — an id, an allowlist summary or a
 * stopgap note that did not arrive is one line the screen leaves out, not a
 * reason to fall back to printing a status code.
 */
function organizationRefusal(
  body: unknown,
  response: Response,
): OrganizationRefusalView | null {
  const root = record(body);
  if (root === null) return null;

  const code = text(root, "code");
  const looksLikeOne = code === "organization_not_allowlisted" || response.status === 403;
  if (!looksLikeOne) return null;

  const error = text(root, "error");
  const hint = text(root, "hint");
  if (error === null || hint === null) return null;

  const allowlistRaw = record(root.allowlist);
  const variable = allowlistRaw === null ? null : text(allowlistRaw, "variable");
  const permitted = allowlistRaw === null ? undefined : allowlistRaw.permitted;
  const configured = allowlistRaw === null ? undefined : allowlistRaw.configured;

  return {
    error,
    hint,
    code,
    organizationId: text(root, "organizationId"),
    allowlist:
      variable === null || typeof permitted !== "number" || typeof configured !== "boolean"
        ? null
        : { variable, configured, permitted },
    stopgap: text(root, "stopgap"),
  };
}

/**
 * The browser never got an answer.
 *
 * The endpoint is deliberately NOT named in the sentence: the screen has one
 * banner per request and already says which one failed, and a URL in the copy
 * is the kind of thing an owner cannot act on. The underlying error is kept —
 * it is the only clue there is about why nothing came back.
 */
function transportFailure(err: unknown): Failure {
  return {
    kind: "unreachable",
    message: `Your workspace could not be reached: ${
      err instanceof Error ? err.message : String(err)
    }`,
    hint: null,
    status: null,
  };
}

function shapeFailure(err: unknown): Failure {
  return {
    kind: "malformed",
    message: err instanceof Error ? err.message : String(err),
    hint: null,
    status: null,
  };
}

const URL_ACTIVATION = "/api/runtime/activation";
const URL_AGENTS = "/api/runtime/agents";

/* ═══════════════════════════ The reads ═══════════════════════════ */

/**
 * The three gates, the plan behind them and what is live.
 *
 * DELIBERATELY SLOW, and the screen says so while it waits. `GET
 * /api/runtime/activation` re-derives every gate on every request — the sandbox
 * gate runs the whole scenario library and the stress sweep before it can answer —
 * and its own header states that this is the price of never shipping a workforce
 * on evidence gathered before the plan changed. Nothing here caches it, nothing
 * polls it, and nothing on this screen may learn to.
 */
export async function readChecklist(signal?: AbortSignal): Promise<ChecklistOutcome> {
  let response: Response;
  try {
    response = await fetch(URL_ACTIVATION, {
      signal,
      // The gates are re-derived per request precisely so they are current; a
      // cached checklist would put a stale "ready" behind the go-live button.
      cache: "no-store",
      headers: { accept: "application/json" },
    });
  } catch (err) {
    return { kind: "failed", failure: transportFailure(err) };
  }

  const body = await readBody(response);

  if (!response.ok) {
    const refusal = organizationRefusal(body, response);
    if (refusal !== null) return { kind: "forbidden", refusal };
    return {
      kind: "failed",
      failure: {
        kind: "refused",
        message: errorMessage(body, response),
        hint: errorHint(body),
        status: response.status,
      },
    };
  }

  try {
    return { kind: "checklist", snapshot: checklistSnapshot(body) };
  } catch (err) {
    return { kind: "failed", failure: shapeFailure(err) };
  }
}

/** The roster, for the agent names and lifecycle tags. Cheap; safe to refresh. */
export async function readRoster(signal?: AbortSignal): Promise<RosterOutcome> {
  let response: Response;
  try {
    response = await fetch(URL_AGENTS, {
      signal,
      cache: "no-store",
      headers: { accept: "application/json" },
    });
  } catch (err) {
    return { kind: "failed", failure: transportFailure(err) };
  }

  const body = await readBody(response);

  if (!response.ok) {
    const refusal = organizationRefusal(body, response);
    if (refusal !== null) return { kind: "forbidden", refusal };
    return {
      kind: "failed",
      failure: {
        kind: "refused",
        message: errorMessage(body, response),
        hint: errorHint(body),
        status: response.status,
      },
    };
  }

  try {
    return { kind: "roster", snapshot: rosterSnapshot(body) };
  } catch (err) {
    return { kind: "failed", failure: shapeFailure(err) };
  }
}

/* ═══════════════════════════ The write ═══════════════════════════ */

/**
 * Go live.
 *
 * THIS IS THE WRITE. It registers triggers, marks every agent active and puts a
 * deployment on record, so it is never retried automatically anywhere in this
 * lane and is never sent on mount — every attempt is a press of a button by
 * somebody who meant it, and the screen guards against a double press on a ref
 * rather than on a render.
 *
 * `activatedBy` is required by the route and is not defaulted here. A deployment
 * record exists to say who authorised the go-live; inventing a plausible actor —
 * "operator", the browser's locale, anything — would put a name on an audit
 * record that nobody typed. The screen asks for it and refuses to send without
 * one, which is the same refusal `activate` makes, one layer earlier and with a
 * better place to put the answer.
 */
export async function goLive(
  activatedBy: string,
  signal?: AbortSignal,
): Promise<GoLiveOutcome> {
  let response: Response;
  try {
    response = await fetch(URL_ACTIVATION, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ activatedBy }),
    });
  } catch (err) {
    return { kind: "failed", failure: transportFailure(err) };
  }

  const body = await readBody(response);

  /* ── 409: the gates refused, which is this endpoint working ──
     Read BEFORE the generic non-2xx branch and parsed as a result rather than an
     error. The body is the whole checklist and names the gate that shut; a screen
     that reported it as a failed request would be teaching an owner to read their
     own safety gate as a bug. */
  if (response.status === 409) {
    try {
      const root = obj(body, "The go-live details");
      return {
        kind: "blocked",
        outcome: str(root, "outcome", "The go-live details"),
        checklist: checklistView(root.checklist, "The go-live details.checklist"),
        blockers: arr(root.blockers, "The go-live details.blockers").map(
          (item, index) =>
            blockerView(item, `The go-live details.blockers[${index}]`),
        ),
      };
    } catch (err) {
      // A 409 this screen cannot read is still a refusal — nothing was
      // activated — but it can no longer say which gate shut, and it must not
      // pretend otherwise.
      return { kind: "failed", failure: shapeFailure(err) };
    }
  }

  if (!response.ok) {
    const refusal = organizationRefusal(body, response);
    if (refusal !== null) return { kind: "forbidden", refusal };
    return {
      kind: "failed",
      failure: {
        kind: "refused",
        message: errorMessage(body, response),
        hint: errorHint(body),
        status: response.status,
      },
    };
  }

  try {
    return { kind: "activated", result: activatedView(body) };
  } catch (err) {
    return { kind: "failed", failure: shapeFailure(err) };
  }
}
