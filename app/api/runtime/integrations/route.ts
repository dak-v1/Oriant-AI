/**
 * app/api/runtime/integrations/route.ts — what each connection is for, who
 * depends on it, and whether the workforce can go live without it (M6).
 *
 *   GET   one row per integration THE PLAN REFERENCES, built by walking every
 *         agent's `ToolGrant[]`
 *
 * This is not a catalogue of tools that could be connected — that is Role D's
 * registry surface. It answers the two questions an owner actually has in front
 * of a live workforce: what may each agent do through this connection, and is
 * anything missing that stops the plan going live.
 *
 * ONE PLAN AND ONE ORGANIZATION, FOR BOTH HALVES OF EVERY ROW. A row here is a
 * grant walked out of the current plan set beside the status of that connection,
 * and the two are only comparable if they belong to the same business. The
 * status therefore comes from `session.toolsFor(plan.organizationId)` and never
 * from `session.tools`, which is the fixture's organization — see where the
 * provider is resolved in `GET`.
 *
 * BLOCKING IS THE ACTIVATION CHECKLIST'S ANSWER, NOT A SECOND OPINION. The rule
 * "`required: true` plus anything other than a live connection blocks go-live"
 * is written once, in `lib/runtime/schedule/activation.ts`, and the go-live
 * button consults it. So this route runs the same checklist and attributes its
 * blockers by `integrationId` rather than re-deriving the rule. Two copies would
 * agree until the day they did not, and that day this screen would tell an owner
 * "connect this and you can launch" while the button refused for a reason not
 * shown anywhere.
 *
 * WHY THE SANDBOX EVIDENCE HERE IS DELIBERATELY EMPTY. `activationChecklist`
 * derives three independent gates, and the sandbox one re-runs the entire
 * scenario library and the stress sweep on every read — the right cost for a
 * go-live decision (see /api/runtime/activation, whose header insists it stays
 * slow) and an absurd one for a connections screen an owner leaves open. So the
 * checklist is handed `FixedSandboxEvidence(null)` and ONLY its integrations
 * gate is read; the sandbox and packages gates are discarded unread. Nothing
 * about readiness leaves this route as a result — no `ready`, no other gate —
 * because a checklist assembled from evidence nobody gathered must never be
 * allowed to answer "can this go live". /api/runtime/activation is the only
 * honest answer to that question and remains the only place that gives it.
 *
 * EXPIRY AND RE-AUTHORISATION ARE REPORTED AS UNAVAILABLE, NEVER ESTIMATED.
 * ROLE_C_PLAN M6 asks for expiry / re-auth warnings. `IntegrationProvider`
 * (lib/runtime/types.ts) exposes exactly four words and not one timestamp: no
 * token expiry, no connected-at, no account identity. Those belong to D's
 * integration layer (PLAN_CONTRACT §8 Q3), which has not landed. So `unavailable`
 * below names each missing field and why, and no date is synthesised anywhere in
 * this file. `needs_approval` IS a real state the provider can return and is the
 * closest thing to a re-auth prompt that exists today, so it is reported as what
 * the checklist already treats it as: a connection the runtime may not call yet.
 *
 * READ-ONLY VERSUS SIDE-EFFECTING COMES FROM THE SHARED REGISTRY, and an
 * operation `lib/plan/operations.ts` does not know is reported as `unknown`
 * rather than assumed harmless — the same fail-closed answer `isReadOnly` gives.
 * "This connection can send email on your behalf" is the fact this screen exists
 * to state, and a missing registry entry must not soften it.
 *
 * ONE CONNECTION'S FAILURE IS NOT THE PAGE'S. `getIntegrationStatus` crosses the
 * seam into D's code; a throw or a word this build does not implement is recorded
 * on that row and every other row still renders — the posture `statusOf` already
 * takes inside the activation gate.
 *
 * GET ONLY, AND NOTHING HERE MUTATES. Connecting, disconnecting and re-authorising
 * are D's registry surface; a POST on this route would be a button that pretends,
 * which is the one thing the Operate surface must never ship.
 *
 * Unauthenticated on purpose for now, exactly as the rest of /api/runtime is:
 * this branch is Role C's development surface. It must be gated before any
 * deployment — this one reads which tools a business has connected and what its
 * agents may do with them, which is not public information.
 */
import { NextResponse } from "next/server";
import { getOperation } from "@/lib/plan/operations";
import type { AgentSpec, ApprovedPlan } from "@/lib/plan/types";
import { FixedSandboxEvidence, activationChecklist } from "@/lib/runtime/schedule/activation";
import type { ActivationBlocker, AgentRuntimeState } from "@/lib/runtime/schedule/types";
import { getRuntimeSession } from "@/lib/runtime/session";
import { StubIntegrationProvider } from "@/lib/runtime/tools";
import {
  FIXTURE_ORGANIZATION_ENV,
  UnresolvedOrganizationProvider,
  resolveToolsOrganization,
} from "@/lib/runtime/tools/organization";
import type { IntegrationProvider } from "@/lib/runtime/types";

export const dynamic = "force-dynamic";

/* ═══════════════════════════ Vocabularies ═══════════════════════════ */

/** Derived from the provider so the four states are never restated by hand. */
type ConnectionStatus = ReturnType<IntegrationProvider["getIntegrationStatus"]>;

/**
 * The four states as values, because the provider answers over a seam and a
 * union is not something a run-time check can consult.
 *
 * Keyed object with `satisfies` rather than an array, matching
 * app/api/runtime/scheduler/route.ts: a fifth state added to the interface and
 * not added here is a compile error rather than a row this route silently
 * reports as unreadable.
 */
const CONNECTION_STATUSES = Object.keys({
  connected: true,
  required: true,
  optional: true,
  needs_approval: true,
} satisfies Record<ConnectionStatus, true>) as ConnectionStatus[];

/* ═══════════════════════════ Wire shapes ═══════════════════════════ */

interface BlockerView {
  message: string;
  href: string;
  agentId: string | null;
}

interface OperationView {
  id: string;
  /** "unknown" when the shared registry has no entry — never read as harmless. */
  access: "read" | "write" | "unknown";
  description: string | null;
  baselineRisk: "low" | "medium" | "high" | null;
  /** Which integration the registry says owns this operation; null when unknown. */
  belongsTo: string | null;
}

interface GrantView {
  agentId: string;
  agentName: string;
  agentVersion: number;
  /**
   * Role C's runtime state for this agent (PLAN_CONTRACT §4.2). Null means the
   * agent has no runtime record at all — it was never activated — which is a
   * different thing from paused and must not render as one.
   */
  runtimeState: AgentRuntimeState | null;
  runtimeDetail: string | null;
  purpose: string;
  /** The plan's own flag, read strictly: anything but an explicit `false`. */
  required: boolean;
  operationIds: string[];
  /**
   * Granted operations that a deny list also names, so the runtime would refuse
   * them at step 1 of §3.10 however the grant reads. Empty for a plan that
   * passed validator rule 3; not assumed empty, because this route is given a
   * plan rather than asked to trust one.
   */
  refusedOperationIds: string[];
}

interface IntegrationView {
  integrationId: string;
  /** Null when the registry threw or answered with a word this build lacks. */
  status: ConnectionStatus | null;
  statusProblem: string | null;
  /**
   * Whether the runtime can currently obtain a client for it. Reported beside
   * the status rather than derived from it: a registry that says "connected"
   * and hands out no client is a contradiction worth seeing, not smoothing over.
   */
  client: "available" | "unavailable" | "unreadable";
  clientProblem: string | null;
  /** True when ANY agent's grant marks it required. Whether that BLOCKS is the
      checklist's call below, not this flag's. */
  requiredByPlan: boolean;
  /** The activation checklist's own sentences, attributed to this integration. */
  blockers: BlockerView[];
  operations: OperationView[];
  grants: GrantView[];
}

/* ═══════════════════════════ Helpers ═══════════════════════════ */

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A collection arriving over the seam is a promise, not proof — as in policy.ts. */
function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readStatus(
  provider: IntegrationProvider,
  integrationId: string,
): Pick<IntegrationView, "status" | "statusProblem"> {
  let raw: ConnectionStatus;
  try {
    raw = provider.getIntegrationStatus(integrationId);
  } catch (error) {
    return {
      status: null,
      statusProblem:
        `The integrations registry threw when asked about this connection: ` +
        `${describeError(error)}. A connection whose state could not be read is not one ` +
        `anything may assume is live.`,
    };
  }

  const known = CONNECTION_STATUSES.find((candidate) => candidate === raw);
  if (known === undefined) {
    return {
      status: null,
      statusProblem:
        `The integrations registry answered "${String(raw)}", which this build does not ` +
        `implement. An unrecognised state is not a connection.`,
    };
  }
  return { status: known, statusProblem: null };
}

function readClient(
  provider: IntegrationProvider,
  integrationId: string,
): Pick<IntegrationView, "client" | "clientProblem"> {
  try {
    const client = provider.getToolClient(integrationId);
    return { client: client === null ? "unavailable" : "available", clientProblem: null };
  } catch (error) {
    return { client: "unreadable", clientProblem: describeError(error) };
  }
}

/** The registry's answer for one operation, with unknown reported as unknown. */
function describeOperation(operationId: string): OperationView {
  const def = getOperation(operationId);
  if (def === undefined) {
    return {
      id: operationId,
      access: "unknown",
      description: null,
      baselineRisk: null,
      belongsTo: null,
    };
  }
  return {
    id: operationId,
    access: def.access,
    description: def.description,
    baselineRisk: def.baselineRisk ?? null,
    belongsTo: def.integrationId,
  };
}

/* ═══════════════════════ Walking the grants ═══════════════════════ */

/** Everything one agent contributes, before it is split across integrations. */
interface AgentFacts {
  spec: AgentSpec;
  /** Agent policy plus org-wide denials — §3.10 step 1 consults both. */
  denied: Set<string>;
  state: AgentRuntimeState | null;
  stateDetail: string | null;
}

function agentFacts(
  plan: ApprovedPlan,
  states: Map<string, { state: AgentRuntimeState; detail: string }>,
): AgentFacts[] {
  const globalDenied = asArray(plan.globalPolicy?.forbidden);
  return asArray(plan.agents).map((spec) => {
    const record = states.get(spec.id);
    return {
      spec,
      denied: new Set([...globalDenied, ...asArray(spec.policy?.forbidden)]),
      state: record?.state ?? null,
      stateDetail: record?.detail ?? null,
    };
  });
}

/** One integration under construction, in first-reference order. */
interface Draft {
  integrationId: string;
  operations: Map<string, OperationView>;
  grants: GrantView[];
  requiredByPlan: boolean;
}

interface Walked {
  drafts: Draft[];
  /**
   * Grants that name no integration at all. The activation gate blocks on the
   * required ones and ignores the rest; both are surfaced here, because a grant
   * nobody can identify is a plan defect either way and this is the screen where
   * somebody would notice it.
   */
  unattributed: GrantView[];
}

function walkGrants(agents: AgentFacts[]): Walked {
  const byIntegration = new Map<string, Draft>();
  const unattributed: GrantView[] = [];

  for (const agent of agents) {
    for (const grant of asArray(agent.spec.tools)) {
      const operationIds = asArray(grant.operations)
        .map((id) => trimmed(id))
        .filter((id) => id !== "");

      const view: GrantView = {
        agentId: agent.spec.id,
        agentName: agent.spec.name || agent.spec.id,
        agentVersion: agent.spec.version,
        runtimeState: agent.state,
        runtimeDetail: agent.stateDetail,
        purpose: trimmed(grant.purpose),
        // Anything but an explicit `false` is required — the strict reading the
        // activation gate takes, for the same reason: a malformed grant is a
        // reason to stop, not a licence.
        required: grant.required !== false,
        operationIds,
        refusedOperationIds: operationIds.filter((id) => agent.denied.has(id)),
      };

      const integrationId = trimmed(grant.integrationId);
      if (integrationId === "") {
        unattributed.push(view);
        continue;
      }

      let draft = byIntegration.get(integrationId);
      if (draft === undefined) {
        draft = {
          integrationId,
          operations: new Map<string, OperationView>(),
          grants: [],
          requiredByPlan: false,
        };
        byIntegration.set(integrationId, draft);
      }

      draft.grants.push(view);
      draft.requiredByPlan = draft.requiredByPlan || view.required;
      for (const id of operationIds) {
        if (!draft.operations.has(id)) draft.operations.set(id, describeOperation(id));
      }
    }
  }

  return { drafts: Array.from(byIntegration.values()), unattributed };
}

/* ═══════════════════ Fields this build genuinely lacks ═══════════════════ */

/**
 * Rendered as missing rather than omitted, so the screen can say what it does
 * not know instead of quietly looking complete. The scripted screen shows all
 * three; the live one cannot, and pretending otherwise would put the only
 * fabricated facts on the surface where everything else is evidenced.
 */
const UNAVAILABLE = [
  {
    field: "tokenExpiry",
    label: "Token expiry and re-authorisation deadline",
    reason:
      "No part of this build carries one. The integration provider answers with one of " +
      "four words — connected, required, optional, needs_approval — and no timestamp of " +
      "any kind, so there is nothing to count down from. Expiry belongs to Role D's " +
      "integration layer (PLAN_CONTRACT §8 Q3), which has not landed. The nearest real " +
      'signal that does exist is the "needs approval" state, which is shown wherever the ' +
      "registry reports it.",
  },
  {
    field: "connectedAt",
    label: "When the connection was made",
    reason:
      "The provider exposes no timestamp for a connection, and nothing in the runtime " +
      "records one. Arrives with D's registry.",
  },
  {
    field: "account",
    label: "Which account is connected",
    reason:
      "The provider is keyed by integration id alone and reports no account, mailbox or " +
      "workspace identity. Arrives with D's registry.",
  },
] as const;

/* ═══════════════════ Where these statuses came from ═══════════════════ */

interface ProviderView {
  kind: "stub" | "unresolved" | "external";
  detail: string;
}

/**
 * WHOSE CONNECTIONS THESE ARE, said out loud, about the object the rows above
 * were actually read through.
 *
 * ASKED OF `provider`, NEVER OF `session.tools`. This disclosure used to name a
 * different object from the one every status came from, so on a live deployment
 * it described the fixture's provider while the rows described the customer's —
 * the disclosure disagreeing with the thing it was disclosing.
 *
 * `unresolved` IS ITS OWN ANSWER AND NOT AN OUTAGE. In that case every row reads
 * "required", which on the wire is indistinguishable from a business that has
 * genuinely connected nothing — and the two have different fixes. One is "go and
 * connect Gmail"; the other is "this plan does not say which business it belongs
 * to, so nobody's Gmail was consulted". `UnresolvedOrganizationProvider` already
 * carries the sentence that tells them apart, so it is quoted rather than
 * restated here.
 *
 * AND THE LIVE ARM NAMES THE ORGANIZATION BY ASKING THE RESOLVER, not by
 * printing `plan.organizationId`. They are the same id for every ingested plan
 * and deliberately different for one case: the BrightPath fixture borrows
 * whichever organization ORIANT_ORGANIZATION_ID nominates, so a screen echoing
 * the plan's own id would attribute a real company's connected accounts to a
 * demo that has none. `resolveToolsOrganization` is the one place that decision
 * is made; this reads it rather than re-deriving it.
 */
function describeProvider(
  provider: IntegrationProvider,
  planOrganizationId: string,
): ProviderView {
  if (provider instanceof StubIntegrationProvider) {
    return {
      kind: "stub",
      detail:
        "Connection status on this screen comes from StubIntegrationProvider " +
        "(lib/runtime/tools.ts), whose connected set is a constant. It is not an OAuth " +
        "grant: it cannot expire, nobody authorised it, and it reports the same tools " +
        "connected on every machine. Real status arrives with Role D's integration " +
        "layer (PLAN_CONTRACT §8 Q3).",
    };
  }

  if (provider instanceof UnresolvedOrganizationProvider) {
    return {
      kind: "unresolved",
      detail:
        "No connection status could be read for this plan, because the runtime could not " +
        `work out whose connected accounts it acts through: ${provider.reason} Every ` +
        "connection below is therefore shown as required and the go-live gate is shut. " +
        "Nothing was read from any other organization's connections.",
    };
  }

  const resolved = resolveToolsOrganization(planOrganizationId);
  if (resolved.kind === "plan") {
    return {
      kind: "external",
      detail:
        `Connection status comes from the Composio connected accounts of organization ` +
        `${resolved.organizationId}, which is the organization this plan names as its own.`,
    };
  }
  if (resolved.kind === "fixture_fallback") {
    return {
      kind: "external",
      detail:
        `Connection status comes from the Composio connected accounts of organization ` +
        `${resolved.organizationId}, which ${FIXTURE_ORGANIZATION_ENV} nominates to stand ` +
        `in for the BrightPath demo fixture. The fixture is not a business and has no ` +
        `connections of its own, so these belong to somebody else and are being borrowed ` +
        `for the demo.`,
    };
  }

  // Reachable only if a deployment wires in a provider of its own: the runtime's
  // own resolver answers an unresolved organization with the refusing provider
  // handled above. Reported as unattributable rather than guessed at.
  return {
    kind: "external",
    detail:
      "Connection status comes from an integration provider this deployment wired into " +
      "the runtime session. This build cannot attribute it to an organization: " +
      resolved.reason,
  };
}

/* ═══════════════════════════ The read ═══════════════════════════ */

export async function GET() {
  const session = getRuntimeSession();
  // The plan the owner currently intends, not the construction-time seed. Every
  // row below is a grant walked out of this plan and a blocker attributed back to
  // it, so a fixture here would tell an owner which connections BrightPath needs
  // and stay silent about the ones their own workforce cannot go live without.
  // One read, reused for the walk and for the checklist: two could not be shown
  // to be about the same set of grants.
  const plan = await session.currentPlan();
  /* ── The same plan's organization, so the two halves of every row agree ──
     The grants below are walked out of THIS plan and the connection status
     beside each one is read from this provider, so they have to be about one
     business or the screen is a fabrication: it was `session.tools`, the
     BrightPath fixture's organization, which meant a row read "gmail — the plan
     requires it — not connected" where the plan was the customer's and the
     "not connected" was the demo's. One screen, two organizations, and nothing
     on it said so.

     `toolsFor` fails closed by itself when the organization cannot be resolved;
     the refusing provider it returns reports every connection as "required" and
     is reported below by name rather than as a mystery outage. */
  const provider = session.toolsFor(plan.organizationId);

  /* ── The blocking rule, borrowed rather than restated ──
     Only the integrations gate is read; see the module header for why the
     sandbox evidence is deliberately empty and why nothing about readiness
     leaves this route. */
  const checklist = await activationChecklist(plan, {
    scheduler: session.scheduler,
    packages: session.build,
    integrations: provider,
    sandbox: new FixedSandboxEvidence(null),
  });
  const gate = checklist.gates.find((candidate) => candidate.id === "integrations") ?? null;

  const toBlocker = (blocker: ActivationBlocker): BlockerView => ({
    message: blocker.message,
    href: blocker.href,
    agentId: blocker.agentId ?? null,
  });
  const gateBlockers = asArray(gate?.blockers);

  /* ── Runtime state per agent (PLAN_CONTRACT §4.2) ──
     So "gmail is not connected" can say whether anything live depends on it. */
  const states = new Map<string, { state: AgentRuntimeState; detail: string }>();
  for (const record of await session.schedulerStore.listAgentStates()) {
    states.set(record.agentId, { state: record.state, detail: record.detail });
  }

  const walked = walkGrants(agentFacts(plan, states));

  const integrations: IntegrationView[] = walked.drafts.map((draft) => ({
    integrationId: draft.integrationId,
    ...readStatus(provider, draft.integrationId),
    ...readClient(provider, draft.integrationId),
    requiredByPlan: draft.requiredByPlan,
    blockers: gateBlockers
      .filter((blocker) => blocker.integrationId === draft.integrationId)
      .map(toBlocker),
    operations: Array.from(draft.operations.values()),
    grants: draft.grants,
  }));

  /* Every blocker has to be rendered somewhere. These are the ones no card can
     carry — a required grant naming no integration at all, and, defensively, any
     blocker naming an id that did not survive the walk above. A blocking sentence
     that appears on no screen is the worst outcome this route has available. */
  const attributed = new Set(integrations.map((row) => row.integrationId));
  const unattributedBlockers = gateBlockers
    .filter(
      (blocker) =>
        blocker.integrationId === undefined || !attributed.has(blocker.integrationId),
    )
    .map(toBlocker);

  const deployment = checklist.activeDeployment;

  return NextResponse.json({
    mode: session.mode,
    // The instant this reading was taken, so the screen never has to trust that
    // its own clock agrees with the server's.
    now: session.scheduler.clock.now().toISOString(),
    plan: { planId: plan.planId, version: plan.version },
    /**
     * WHERE THESE STATUSES CAME FROM, said out loud. Until D's layer lands the
     * runtime is wired to a stub whose connected set is a constant, and a screen
     * reporting eight live connections on a machine where nothing was ever
     * authorised has to admit that or it is the most convincing lie in the
     * product. `describeProvider` above says which of the three cases this is
     * and, when there is one to name, whose organization answered.
     */
    provider: describeProvider(provider, plan.organizationId),
    activation: {
      // The gate as the checklist derived it. `satisfied` here is about
      // integrations alone and says nothing about whether the plan can go live.
      gate:
        gate === null
          ? null
          : { id: gate.id, label: gate.label, satisfied: gate.satisfied, detail: gate.detail },
      /** Blockers no card above can carry; see where they are collected. */
      unattributedBlockers,
    },
    /**
     * Set only when THIS plan version is already live. It carries the evidence
     * frozen at go-live, which is how an owner tells "never connected" apart
     * from "connected then, gone now" — the failure this screen exists to catch.
     */
    deployment:
      deployment === null
        ? null
        : {
            deploymentId: deployment.deploymentId,
            planVersion: deployment.planVersion,
            activatedAt: deployment.activatedAt,
            activatedBy: deployment.activatedBy,
            integrationsReady: deployment.evidence.integrationsReady,
          },
    integrations,
    grantsWithoutIntegration: walked.unattributed,
    unavailable: UNAVAILABLE,
  });
}
