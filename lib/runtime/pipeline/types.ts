/**
 * lib/runtime/pipeline/types.ts — the shape of one end-to-end pass.
 *
 * Six stages, each of which can stop the pass, and each of which says why in
 * the owner's language rather than the runtime's. The vocabulary matters more
 * than it looks:
 *
 *   ok       the stage did its work
 *   blocked  the stage refused, and a HUMAN can fix it — a stale plan, a
 *            disconnected tool, a workforce nobody has proved yet
 *   failed   the stage broke, and an ENGINEER has to look
 *
 * The distinction is the whole point. "Blocked" is the pipeline working: a gate
 * shut on purpose. Collapsing the two into "error" would train everyone to
 * treat a correctly-refused activation as a bug report.
 */

import type { ApprovedPlan } from "../../plan/types";
import type { IngestGap } from "../../plan/ingest/types";

export type StageStatus = "ok" | "blocked" | "failed" | "skipped";

export type StageId =
  | "collect"
  | "ingest"
  | "validate"
  | "build"
  | "prove"
  | "activate";

export interface StageResult {
  stage: StageId;
  status: StageStatus;
  /** One line, readable by whoever is watching the demo. */
  summary: string;
  /** Specifics: blockers, failures, counts. Never a stack trace. */
  detail: string[];
  /** Where the owner goes to fix a block. */
  href?: string;
}

export interface PipelineResult {
  /** True only when every stage reported ok. */
  completed: boolean;
  /** The stage that stopped the pass, or null when it ran to the end. */
  stoppedAt: StageId | null;
  stages: StageResult[];
  /** Present once ingest succeeded. */
  plan: ApprovedPlan | null;
  /** Everything the ingest had to assume, carried through the whole pass. */
  gaps: IngestGap[];
  /** What is live at the end, for the Operate surface to render. */
  live: {
    deploymentId: string | null;
    agents: number;
    triggersRegistered: number;
  } | null;
}

/** Where a blocked stage sends the owner. Mirrors activation's GATE_HREF. */
export const STAGE_HREF: Record<StageId, string> = {
  collect: "/app/planner",
  ingest: "/app/planner",
  validate: "/app/planner",
  build: "/app/build",
  prove: "/app/sandbox",
  activate: "/app/deploy",
};
