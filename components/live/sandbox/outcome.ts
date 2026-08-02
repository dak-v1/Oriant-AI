/**
 * components/live/sandbox/outcome.ts — which answer about a scenario this screen
 * is currently holding, and how much of it there is.
 *
 * THERE ARE TWO DOORS ONTO ONE SCENARIO AND THEY CARRY DIFFERENT AMOUNTS OF IT.
 * `POST /api/runtime/sandbox` with no body runs the whole suite and projects
 * every result down to eight fields; the same endpoint with a `scenarioId` runs
 * one and returns the full `ScenarioResult` — the event stream, the failure
 * reason, which package was proved, where it ran. Both are real results and
 * neither is a summary of the other.
 *
 * SO THE SCREEN HAS TO KNOW WHICH ONE IT IS LOOKING AT, and this type is that
 * knowledge made explicit rather than inferred from which fields happen to be
 * present. The alternative — one optional-everything shape — is how a suite row
 * with no events comes to render as a run that emitted none, which is the
 * difference between "the response does not carry the stream" and "the agent did
 * nothing". `none` is the third case and the one this codebase keeps having to
 * reintroduce: nobody has asked yet, which is not a result and must never render
 * as one.
 *
 * WHICH DOOR ANSWERED MOST RECENTLY IS DECIDED BY A SEQUENCE STAMP, not by
 * preferring one kind over the other. A suite run after a single run supersedes
 * it and a single run after a suite supersedes that row; the screen keeps one
 * counter and compares. Preferring the richer answer would leave a stale single
 * run standing over a fresher suite that has since judged the same scenario
 * differently — a green row on this page for a scenario the current verdict
 * fails.
 */

import type { ScenarioRunView, SuiteResultView } from "./api";

export type TestOutcome =
  /** Nothing has been read for this scenario in this tab. */
  | { kind: "none" }
  /** The whole-suite reply's projection: judgement, no event stream. */
  | { kind: "suite"; row: SuiteResultView }
  /** A single-scenario run: everything, including the stream. */
  | { kind: "run"; run: ScenarioRunView };

/** Null means no result, which is never the same as `false`. */
export function outcomePassed(outcome: TestOutcome): boolean | null {
  if (outcome.kind === "suite") return outcome.row.passed;
  if (outcome.kind === "run") return outcome.run.passed;
  return null;
}

/** The runner's own unmet-expectation lines. Null when there is no result. */
export function outcomeFailures(outcome: TestOutcome): string[] | null {
  if (outcome.kind === "suite") return outcome.row.failures;
  if (outcome.kind === "run") return outcome.run.failures;
  return null;
}

/** The `RunStatus` word the run ended in. Null when there is no result. */
export function outcomeFinalStatus(outcome: TestOutcome): string | null {
  if (outcome.kind === "suite") return outcome.row.finalStatus;
  if (outcome.kind === "run") return outcome.run.finalStatus;
  return null;
}

/** How many times the run stopped for a person. Null when there is no result. */
export function outcomeApprovals(outcome: TestOutcome): number | null {
  if (outcome.kind === "suite") return outcome.row.approvalsRaised;
  if (outcome.kind === "run") return outcome.run.approvalsRaised;
  return null;
}

/**
 * Every operation the run invoked, in order, retries included.
 *
 * Carried by both doors, and worth surfacing from either: it is the only way to
 * read "the guardrail held" as a fact — the operation that must never have been
 * called is either in this list or it is not.
 */
export function outcomeOperations(outcome: TestOutcome): string[] | null {
  if (outcome.kind === "suite") return outcome.row.operationsCalled;
  if (outcome.kind === "run") return outcome.run.operationsCalled;
  return null;
}
