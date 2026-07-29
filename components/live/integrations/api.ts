/**
 * components/live/integrations/api.ts — the only place a response from
 * `/api/runtime/integrations` is allowed to become a fact.
 *
 * PARSED, NOT CAST. `await response.json() as ConnectionsView` is shorter and is
 * a lie: it tells TypeScript a shape nothing checked, and the first field the
 * route renames becomes `undefined` rendered as a blank where a warning should
 * be. On this screen the specific cost is legible — a dropped `blockers` array
 * turns a connection that is stopping go-live into a card that looks fine.
 *
 * THE WHOLE READ IS REFUSED RATHER THAN PARTIALLY RENDERED. One integration that
 * cannot be read does not get skipped so the others can draw. The question this
 * screen answers is "is anything missing?", and a list with a silent hole in it
 * answers that question wrongly in the reassuring direction. The screen shows the
 * error and the field that caused it; nothing here invents a default.
 *
 * THE STRING UNIONS ARE REFUSED RATHER THAN DEFAULTED, for the same reason
 * components/live/workspace/runtime-api.ts refuses a job status it does not
 * recognise: every judgement this screen makes is keyed on one of those words —
 * which group a connection belongs in, whether an operation can act on the
 * owner's behalf — and a word with no judgement attached would land in whichever
 * bucket a fallback happened to pick. Note that "the registry said something we
 * do not implement" is NOT such a case: the route has already turned that into
 * `status: null` plus a sentence, so it arrives here as data rather than as a
 * surprise.
 *
 * There is no writer in this module, deliberately. Connecting, disconnecting and
 * re-authorising belong to Role D's registry; this lane reads.
 */

import type { AgentRuntimeState } from "@/lib/runtime/schedule/types";

/* ═══════════════════════════ Vocabularies ═══════════════════════════ */

export type ConnectionStatus = "connected" | "required" | "optional" | "needs_approval";
export type OperationAccess = "read" | "write" | "unknown";
export type ClientAvailability = "available" | "unavailable" | "unreadable";
export type ProviderKind = "stub" | "external";
export type RuntimeMode = "fixture" | "live";

const CONNECTION_STATUSES: ConnectionStatus[] = [
  "connected",
  "required",
  "optional",
  "needs_approval",
];

const OPERATION_ACCESS: OperationAccess[] = ["read", "write", "unknown"];

const CLIENT_AVAILABILITY: ClientAvailability[] = ["available", "unavailable", "unreadable"];

/**
 * Built with `satisfies` against the runtime's own union so the two cannot
 * drift: a sixth `AgentRuntimeState` that this list has not learned is a compile
 * error here rather than a roster row this screen refuses at run time.
 */
const RUNTIME_STATES = Object.keys({
  building: true,
  validated: true,
  active: true,
  paused: true,
  failed: true,
} satisfies Record<AgentRuntimeState, true>) as AgentRuntimeState[];

/* ═══════════════════════════ Shapes ═══════════════════════════ */

export interface BlockerView {
  message: string;
  href: string;
  agentId: string | null;
}

export interface OperationView {
  id: string;
  access: OperationAccess;
  description: string | null;
  baselineRisk: "low" | "medium" | "high" | null;
  belongsTo: string | null;
}

export interface GrantView {
  agentId: string;
  agentName: string;
  agentVersion: number;
  /** Null when the agent has no runtime record — never activated, not paused. */
  runtimeState: AgentRuntimeState | null;
  runtimeDetail: string | null;
  purpose: string;
  required: boolean;
  operationIds: string[];
  refusedOperationIds: string[];
}

export interface IntegrationView {
  integrationId: string;
  /** Null when the registry threw or answered with a state this build lacks. */
  status: ConnectionStatus | null;
  statusProblem: string | null;
  client: ClientAvailability;
  clientProblem: string | null;
  requiredByPlan: boolean;
  /** The activation checklist's sentences. Non-empty means go-live is blocked. */
  blockers: BlockerView[];
  operations: OperationView[];
  grants: GrantView[];
}

export interface GateView {
  id: string;
  label: string;
  /** About integrations alone — never about whether the plan can go live. */
  satisfied: boolean;
  detail: string;
}

export interface DeploymentView {
  deploymentId: string;
  planVersion: number;
  activatedAt: string;
  activatedBy: string;
  integrationsReady: boolean;
}

export interface UnavailableField {
  field: string;
  label: string;
  reason: string;
}

export interface ConnectionsView {
  /** Null when the route reported a mode this build does not recognise. */
  mode: RuntimeMode | null;
  now: string;
  plan: { planId: string; version: number };
  provider: { kind: ProviderKind | null; detail: string };
  gate: GateView | null;
  unattributedBlockers: BlockerView[];
  deployment: DeploymentView | null;
  integrations: IntegrationView[];
  grantsWithoutIntegration: GrantView[];
  unavailable: UnavailableField[];
}

/* ═══════════════════════════ Errors ═══════════════════════════ */

export type ApiFailureKind = "transport" | "http" | "malformed";

export class IntegrationsApiError extends Error {
  readonly kind: ApiFailureKind;
  /** Null for a transport failure — there was no response to have a status. */
  readonly status: number | null;

  constructor(kind: ApiFailureKind, message: string, status: number | null = null) {
    super(message);
    this.name = "IntegrationsApiError";
    this.kind = kind;
    this.status = status;
  }
}

/* ═══════════════════════════ Strict readers ═══════════════════════════ */

/** Every reader names the field it rejected, so the screen can show it verbatim. */
function fail(where: string, why: string): never {
  throw new IntegrationsApiError("malformed", `${where} ${why}`);
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

function strOrNull(source: Record<string, unknown>, key: string, where: string): string | null {
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

/** Null passes through; anything present must be one of the known words. */
function memberOrNull<T extends string>(
  source: Record<string, unknown>,
  key: string,
  where: string,
  allowed: readonly T[],
): T | null {
  const value = source[key];
  if (value === null || value === undefined) return null;
  return member(source, key, where, allowed);
}

const RISKS = ["low", "medium", "high"] as const;

function riskOrNull(
  source: Record<string, unknown>,
  where: string,
): "low" | "medium" | "high" | null {
  return memberOrNull(source, "baselineRisk", where, RISKS);
}

function blocker(value: unknown, where: string): BlockerView {
  const raw = obj(value, where);
  return {
    message: str(raw, "message", where),
    href: str(raw, "href", where),
    agentId: strOrNull(raw, "agentId", where),
  };
}

function grant(value: unknown, where: string): GrantView {
  const raw = obj(value, where);
  return {
    agentId: str(raw, "agentId", where),
    agentName: str(raw, "agentName", where),
    agentVersion: num(raw, "agentVersion", where),
    runtimeState: memberOrNull(raw, "runtimeState", where, RUNTIME_STATES),
    runtimeDetail: strOrNull(raw, "runtimeDetail", where),
    purpose: str(raw, "purpose", where),
    required: flag(raw, "required", where),
    operationIds: strList(raw, "operationIds", where),
    refusedOperationIds: strList(raw, "refusedOperationIds", where),
  };
}

function integration(value: unknown, where: string): IntegrationView {
  const raw = obj(value, where);
  return {
    integrationId: str(raw, "integrationId", where),
    status: memberOrNull(raw, "status", where, CONNECTION_STATUSES),
    statusProblem: strOrNull(raw, "statusProblem", where),
    client: member(raw, "client", where, CLIENT_AVAILABILITY),
    clientProblem: strOrNull(raw, "clientProblem", where),
    requiredByPlan: flag(raw, "requiredByPlan", where),
    blockers: arr(raw.blockers, `${where}.blockers`).map((item, index) =>
      blocker(item, `${where}.blockers[${index}]`),
    ),
    operations: arr(raw.operations, `${where}.operations`).map((item, index) => {
      const at = `${where}.operations[${index}]`;
      const op = obj(item, at);
      return {
        id: str(op, "id", at),
        access: member(op, "access", at, OPERATION_ACCESS),
        description: strOrNull(op, "description", at),
        baselineRisk: riskOrNull(op, at),
        belongsTo: strOrNull(op, "belongsTo", at),
      };
    }),
    grants: arr(raw.grants, `${where}.grants`).map((item, index) =>
      grant(item, `${where}.grants[${index}]`),
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

/** The route's own `{ error }` sentence when there is one; a generic line if not. */
function errorMessage(body: unknown, response: Response): string {
  if (typeof body === "object" && body !== null && !Array.isArray(body)) {
    const error = (body as Record<string, unknown>).error;
    if (typeof error === "string" && error.trim() !== "") return error;
  }
  if (typeof body === "string" && body.trim() !== "") return body.slice(0, 400);
  return `The runtime answered ${response.status} ${response.statusText}.`;
}

/* ═══════════════════════════ The read ═══════════════════════════ */

export async function fetchConnections(signal?: AbortSignal): Promise<ConnectionsView> {
  const url = "/api/runtime/integrations";

  let response: Response;
  try {
    response = await fetch(url, {
      signal,
      // The registry and the runtime stores change underneath this page; a cached
      // answer is a screen reporting a connection that was removed an hour ago.
      cache: "no-store",
      headers: { accept: "application/json" },
    });
  } catch (err) {
    throw new IntegrationsApiError(
      "transport",
      `Could not reach ${url}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const body = await readBody(response);
  if (!response.ok) {
    throw new IntegrationsApiError("http", errorMessage(body, response), response.status);
  }

  const root = obj(body, "The connections response");
  const provider = obj(root.provider, "The connections response.provider");
  const plan = obj(root.plan, "The connections response.plan");
  const activation = obj(root.activation, "The connections response.activation");
  const gateRaw = activation.gate;
  const deploymentRaw = root.deployment;

  return {
    // Degrades to null rather than refusing: an unrecognised mode is rendered as
    // "unknown", which is the honest reading and the one that does not claim the
    // safe answer. Every other union here is refused — see the header.
    mode:
      root.mode === "fixture" || root.mode === "live" ? (root.mode as RuntimeMode) : null,
    now: str(root, "now", "The connections response"),
    plan: {
      planId: str(plan, "planId", "The connections response.plan"),
      version: num(plan, "version", "The connections response.plan"),
    },
    provider: {
      kind:
        provider.kind === "stub" || provider.kind === "external"
          ? (provider.kind as ProviderKind)
          : null,
      detail: str(provider, "detail", "The connections response.provider"),
    },
    gate:
      gateRaw === null || gateRaw === undefined
        ? null
        : (() => {
            const at = "The connections response.activation.gate";
            const raw = obj(gateRaw, at);
            return {
              id: str(raw, "id", at),
              label: str(raw, "label", at),
              satisfied: flag(raw, "satisfied", at),
              detail: str(raw, "detail", at),
            };
          })(),
    unattributedBlockers: arr(
      activation.unattributedBlockers,
      "The connections response.activation.unattributedBlockers",
    ).map((item, index) =>
      blocker(item, `The connections response.activation.unattributedBlockers[${index}]`),
    ),
    deployment:
      deploymentRaw === null || deploymentRaw === undefined
        ? null
        : (() => {
            const at = "The connections response.deployment";
            const raw = obj(deploymentRaw, at);
            return {
              deploymentId: str(raw, "deploymentId", at),
              planVersion: num(raw, "planVersion", at),
              activatedAt: str(raw, "activatedAt", at),
              activatedBy: str(raw, "activatedBy", at),
              integrationsReady: flag(raw, "integrationsReady", at),
            };
          })(),
    integrations: arr(root.integrations, "The connections response.integrations").map(
      (item, index) => integration(item, `integrations[${index}]`),
    ),
    grantsWithoutIntegration: arr(
      root.grantsWithoutIntegration,
      "The connections response.grantsWithoutIntegration",
    ).map((item, index) => grant(item, `grantsWithoutIntegration[${index}]`)),
    unavailable: arr(root.unavailable, "The connections response.unavailable").map(
      (item, index) => {
        const at = `The connections response.unavailable[${index}]`;
        const raw = obj(item, at);
        return {
          field: str(raw, "field", at),
          label: str(raw, "label", at),
          reason: str(raw, "reason", at),
        };
      },
    ),
  };
}
