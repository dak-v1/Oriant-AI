/**
 * components/live/sandbox/ui/stages.ts — the five staged frames of the mock's
 * step rail, mapped onto the events the runtime actually emitted:
 *
 *   Preparing → Running trigger → Agent action → Human checkpoint → Result
 *
 * ADAPTED FROM components/mock/sandbox/stages.ts. The five stages and their
 * labels are the mock's, unchanged, because the owner asked for the mock's look.
 * What changed is the input: the mock mapped `SandboxEventKind` — a fixture
 * vocabulary of eight authored words — and this maps `RunEvent.kind` from
 * lib/runtime/types.ts, which is what the executor writes.
 *
 * ── THE ONE THING THIS FILE EXISTS TO REFUSE ──
 *
 * THERE IS NO "IN PROGRESS" STATE, ANYWHERE, AND THERE CANNOT BE. The mock's
 * rail had one because a fixture timeline was being played out over four
 * seconds; this rail is derived from a run that has ALREADY FINISHED by the
 * time the screen sees it. `POST /api/runtime/sandbox` executes the scenario
 * inside the request and answers once, with the whole event stream attached.
 * There is no progress to subscribe to, so a rail that lit stages one after
 * another would be an animation of a thing that already happened — which is
 * precisely the defect this whole effort has been removing, and which
 * components/live/build/ui/stage.ts refused in the same words for the Factory's
 * progress bar.
 *
 * So the states below are `done`, `skipped`, `unreached` and `none`, and every
 * one of them is a claim about evidence in hand:
 *
 *   done       the run emitted at least one event belonging to this stage.
 *   skipped    it emitted none, but it emitted events belonging to a LATER
 *              stage — so the run passed this frame by. A workflow that needed
 *              no approval is the ordinary case, and the mock's own wording for
 *              it ("Not needed here") is kept.
 *   unreached  it emitted none, and none later either. The run ended before
 *              here. NOT the same as skipped, and conflating them is how a
 *              failed run comes to look like a tidy one that simply had less to
 *              do: three grey stages reading "not needed" under a red verdict.
 *   none       no run has been read for this scenario at all. Distinct from
 *              `unreached` for the same reason `unheard` is distinct from empty
 *              everywhere else in this lane — nobody asked is not an answer.
 *
 * ── WHY A KIND CAN MAP TO NOTHING ──
 *
 * `stageOfEventKind` returns null for a kind this build has not learned.
 * `RunEvent` is an open union — `batch_empty` was added after the first readers
 * shipped — and forcing an unknown kind into "Agent action" would silently
 * light a frame on evidence that says nothing about it. The event still renders
 * in the timeline with whatever sentence it carried; it just does not vote on
 * the rail. Under-claiming is the safe direction here and over-claiming is not.
 */

import type { RunEventView } from "../api";

export type StageId = "preparing" | "trigger" | "agent" | "checkpoint" | "result";

export const STAGE_ORDER: StageId[] = ["preparing", "trigger", "agent", "checkpoint", "result"];

export const STAGE_LABEL: Record<StageId, string> = {
  preparing: "Preparing",
  trigger: "Running trigger",
  agent: "Agent action",
  checkpoint: "Human checkpoint",
  result: "Result",
};

export type StageState = "done" | "skipped" | "unreached" | "none";

/**
 * Which frame an event belongs to, or null when this build has no reading for
 * its kind.
 *
 * The two mappings worth arguing over:
 *
 *   `refused` → result, not checkpoint. A refusal is a guardrail or the
 *   simulated owner ending the run, and it is the run's OUTCOME. Filing it under
 *   "Human checkpoint" would light the approval frame for a run where no
 *   approval was ever raised.
 *
 *   `error` → agent, not result. An error carries a `stepId` and the executor
 *   retries past it; a run can log several and still complete. It is something
 *   that happened DURING the agent's work, and marking it as the result would
 *   claim a run ended at the first thing that went wrong.
 *
 * "Preparing" is deliberately absent: no event means "preparing". It is the
 * frame for the run existing at all, and `stageStates` reads that off the runId.
 */
export function stageOfEventKind(kind: string): StageId | null {
  switch (kind) {
    case "run_started":
      return "trigger";
    case "step_started":
    case "reasoning":
    case "tool_call":
    case "batch_empty":
    case "output":
    case "error":
      return "agent";
    case "needs_approval":
    case "approval_resolved":
      return "checkpoint";
    case "refused":
    case "run_finished":
      return "result";
    default:
      return null;
  }
}

export const stageIndex = (stage: StageId): number => STAGE_ORDER.indexOf(stage);

/**
 * The five frames' states for one finished run, or for no run at all.
 *
 * `runId` is what "Preparing" is derived from, and it is a real signal rather
 * than a proxy: `lib/runtime/sandbox/runner.ts` returns an empty `runId` from
 * its `failure` helper — the path taken when the agent is not in the plan, when
 * no workflow is enabled, when the spec patch threw, or when the agent has no
 * built package. Those results exist and are red, and NOTHING about the run ever
 * happened. Reading them as a rail with a green first frame would say the
 * sandbox got as far as preparing when it never started.
 */
export function stageStates(
  run: { runId: string; events: RunEventView[] } | null,
): Record<StageId, StageState> {
  if (run === null) {
    return {
      preparing: "none",
      trigger: "none",
      agent: "none",
      checkpoint: "none",
      result: "none",
    };
  }

  const seen = new Set<StageId>();
  for (const event of run.events) {
    const stage = stageOfEventKind(event.kind);
    if (stage !== null) seen.add(stage);
  }
  // The run existed as a run. Everything else is evidence from the stream.
  if (run.runId !== "") seen.add("preparing");

  const lastSeen = STAGE_ORDER.reduce(
    (highest, stage) => (seen.has(stage) ? stageIndex(stage) : highest),
    -1,
  );

  const states: Record<StageId, StageState> = {
    preparing: "unreached",
    trigger: "unreached",
    agent: "unreached",
    checkpoint: "unreached",
    result: "unreached",
  };
  for (const stage of STAGE_ORDER) {
    if (seen.has(stage)) states[stage] = "done";
    else if (stageIndex(stage) < lastSeen) states[stage] = "skipped";
  }
  return states;
}
