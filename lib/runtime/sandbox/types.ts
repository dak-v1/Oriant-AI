/**
 * lib/runtime/sandbox/types.ts — the Sandbox's vocabulary (ROLE_C_PLAN M3).
 *
 * The Sandbox proves a workforce behaves before anything reaches a real
 * customer, and Activation gates on its verdict. That single fact drives every
 * decision here:
 *
 *   A VERDICT MUST BE DECIDABLE. `OutputSpec.successCriteria` is prose written
 *   for a human, and judging it with a model would make the gate
 *   non-deterministic — the same workforce could pass on Tuesday and fail on
 *   Wednesday. So a scenario carries STRUCTURED expectations that are checked
 *   in plain code, and keeps the prose only as the description shown to the
 *   owner.
 *
 *   THE SIMULATED OWNER IS PART OF THE SCENARIO. Most interesting behaviour
 *   lives past an approval, so a scenario says what the owner does when the run
 *   pauses. That is how the approve, edit and reject paths get exercised.
 *
 *   NOTHING REACHES A REAL SYSTEM. Every tool call is served by a stub, so a
 *   scenario is safe to run repeatedly and against any data.
 *
 *   FAILURE IS PART OF THE PROOF. A workforce only ever shown a healthy world
 *   has not been proved safe. ROLE_C_PLAN M0 names three failure shapes the
 *   fixtures must force — throws mid-run, needs a disconnected tool, hangs —
 *   so a scenario can script what the world says, make a call blow up, and make
 *   a call never answer. Always declaratively: a scenario is a module-level
 *   constant re-run five times to prove the verdict repeats, so anything that
 *   remembers the previous run would break the exit criterion it is here to
 *   support.
 */

import type { AgentSpec } from "../../plan/types";
import type { StubResponder } from "../tools";
import type { RiskLevel, RunStatus } from "../types";
import type { ToolResult } from "../types";
import type { ReasonResult } from "../types";

/** What the simulated owner does each time the run pauses. */
export interface ScenarioOwner {
  decision: "approve" | "reject" | "leave_pending";
  /** Owner edits merged over the frozen invocation before it executes. */
  editedArgs?: Record<string, unknown>;
  /** Required when rejecting; recorded on the run. */
  reason?: string;
}

/**
 * Checked in code, never by a model. Every field is optional so a scenario
 * asserts only what it is actually about.
 */
export interface ScenarioExpectation {
  /** The status the run must finish in. */
  finalStatus: RunStatus;
  /** Operations that must have been invoked. */
  mustCall?: string[];
  /**
   * Operations that must NOT have been invoked. This is where a scenario
   * proves a guardrail held rather than merely that nothing crashed.
   */
  mustNotCall?: string[];
  /** Exact number of times the run paused for the owner. */
  approvals?: number;
  /**
   * Exact number of times an operation reached the tool client, retries
   * included. `mustCall` proves a call happened; this proves how many times,
   * which is the only way to assert from outside that the retry loop ran the
   * number of attempts the workflow's `onFailure` promised — and the only way
   * to say "the guardrail held" as a number rather than a hope.
   */
  callCounts?: Record<string, number>;
  /** The highest risk any raised approval carried. */
  minRisk?: RiskLevel;
  /** PolicyLimit ids that must appear on a raised approval. */
  breachedLimits?: string[];
  /** Substring that must appear in an approval reason or the run failure. */
  reasonContains?: string;
}

export interface SandboxScenario {
  id: string;
  name: string;
  /** Shown to the owner; explains the situation in business terms. */
  description: string;
  /** Grouping for the scenario rail: "Customer care", "Finance", ... */
  category: string;
  agentId: string;
  /** Defaults to the agent's first enabled workflow. */
  workflowId?: string;
  triggerPayload?: Record<string, unknown>;
  /**
   * Per-operation stub overrides, so a scenario controls what the world says.
   * The type is `StubResponder` itself rather than a restatement of its shape,
   * because the two were duplicated and would eventually drift.
   *
   * A responder must be PURE. Scenarios are module-level constants shared
   * across the five determinism runs, so one that counted its calls would
   * answer differently on the second pass and the verdict would stop
   * repeating. Use `toolScript` when the answer has to change. THROWING is
   * legal and is how a scenario models a tool that blows up rather than one
   * that politely answers "no".
   */
  toolResponses?: Record<string, StubResponder>;
  /**
   * Ordered replies per operation: the Nth call gets the Nth entry and the last
   * entry repeats. The cursor is created per execution, which is what makes a
   * retry-then-recover case deterministic where a closure over a counter
   * declared beside the scenario would not be.
   */
  toolScript?: Record<string, ToolResult[]>;
  /**
   * Operations whose call never answers. This cannot be expressed through
   * `toolResponses` — a responder returns a value — and a hang is the third of
   * M0's failure shapes. Pair it with `stepTimeoutMs`, or the executor's 60s
   * default stalls the suite instead of asserting a timeout.
   */
  hangOn?: string[];
  /**
   * Overrides the executor's 60s per-step ceiling. Set it ONLY on a scenario
   * that is ABOUT a timeout: a short ceiling applied to every scenario would
   * make the whole suite race a wall clock, which is exactly the flakiness the
   * determinism criterion exists to remove.
   */
  stepTimeoutMs?: number;
  /**
   * Mutates a clone of the agent spec before it is compiled, so a scenario can
   * drive the agent at a guardrail the approved plan cannot legally express.
   * BRIGHTPATH_PLAN has to keep validating clean (M0's exit criterion), so it
   * can never contain a step that attempts a forbidden or ungranted operation
   * — which is precisely why those branches of contract section 3.10 had no
   * coverage and their assertions could not fail.
   *
   * Must be pure: it is re-applied to a fresh clone on every run. A patched
   * scenario always runs a freshly compiled package, because no package the
   * Factory stored corresponds to a spec that exists only for one run.
   */
  specPatch?: (spec: AgentSpec) => void;
  /** Scripted reasoning, keyed by step instruction or "__default". */
  reasonScript?: Record<string, ReasonResult>;
  /** Integrations to present as not connected. */
  disconnected?: string[];
  owner: ScenarioOwner;
  expect: ScenarioExpectation;
}

/**
 * Which artefact a scenario actually proved. `stored` is the package M2 built
 * and the one Activation will deploy; `compiled` is a fresh compile of the same
 * spec, which only proves an equivalent; `none` means the run never got as far
 * as a package. A verdict that cannot say which of these it earned is not
 * evidence about anything in particular.
 */
export type PackageSource = "stored" | "compiled" | "none";

export interface ScenarioResult {
  scenarioId: string;
  name: string;
  category: string;
  agentId: string;
  passed: boolean;
  /** One line per unmet expectation; empty when passed. */
  failures: string[];
  finalStatus: RunStatus;
  approvalsRaised: number;
  /** Every invocation in order, retries included, so attempts are countable. */
  operationsCalled: string[];
  /**
   * `RunState.failure` verbatim — the refusal or error an owner would be shown.
   * Carried out of the run because status alone cannot tell a guardrail firing
   * apart from a human saying no: both end the run `refused`.
   */
  failureReason: string | null;
  packageSource: PackageSource;
  /** The full event stream, for the timeline UI. */
  events: unknown[];
  runId: string;
}

export interface AgentVerdict {
  agentId: string;
  total: number;
  passed: number;
  failed: number;
  ready: boolean;
}

export interface SandboxVerdict {
  planId: string;
  planVersion: number;
  total: number;
  passed: number;
  failed: number;
  /**
   * True only when every scenario passed, every agent had coverage, AND the
   * stress sweep ran and passed in full. This is what Activation gates on.
   *
   * A sweep that did not run is absent evidence, not a pass. The caller chooses
   * whether to run it, so treating "not run" as satisfied would let a caller
   * ask for a green verdict and be handed one.
   */
  ready: boolean;
  /**
   * Why the gate is shut, one line per reason; empty exactly when `ready`.
   * A boolean cannot distinguish "a scenario failed" from "the sweep never
   * ran", and Activation has to tell a red gate from an incomplete one — the
   * first is a bug to fix, the second is work not yet done.
   */
  blockers: string[];
  byAgent: AgentVerdict[];
  results: ScenarioResult[];
  stress: StressResult | null;
}

/* ═══════════════════════════ Stress ═══════════════════════════ */

export interface StressCaseResult {
  caseId: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface StressResult {
  total: number;
  passed: number;
  /** 0-100, rounded. */
  passRate: number;
  cases: StressCaseResult[];
}

/* ═══════════════════════════ Isolation ═══════════════════════════ */

/**
 * The seam where Daytona plugs in. The default runs in process, which is
 * sufficient because every tool is already stubbed and no scenario can reach
 * an external system. A remote isolate buys defence against a future generator
 * that emits executable code, and costs a network round trip per scenario.
 */
export interface SandboxIsolation {
  readonly name: string;
  run<T>(label: string, fn: () => Promise<T>): Promise<T>;
}

export class InProcessIsolation implements SandboxIsolation {
  readonly name = "in-process";
  async run<T>(_label: string, fn: () => Promise<T>): Promise<T> {
    return fn();
  }
}
