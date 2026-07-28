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
 */

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
  /** Per-operation stub overrides, so a scenario controls what the world says. */
  toolResponses?: Record<string, (args: Record<string, unknown>) => ToolResult>;
  /** Scripted reasoning, keyed by step instruction or "__default". */
  reasonScript?: Record<string, ReasonResult>;
  /** Integrations to present as not connected. */
  disconnected?: string[];
  owner: ScenarioOwner;
  expect: ScenarioExpectation;
}

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
  operationsCalled: string[];
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
  /** True only when every scenario passed; this is what Activation gates on. */
  ready: boolean;
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
