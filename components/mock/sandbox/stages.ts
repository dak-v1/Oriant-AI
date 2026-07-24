/**
 * stages.ts — the five staged frames of a sandbox run (spec §14; S-01) and
 * the mapping from fixture event kinds onto them:
 *
 *   Preparing → Running trigger → Agent action → Human checkpoint → Result
 *
 * Also owns the sandbox entry metadata that does NOT exist in fixtures:
 * category tags, expected-behavior lines (written from each fixture's
 * description) and the synthetic "20-case stress test" list entry.
 */
import type { SandboxEventKind } from "@/lib/mock/types";
import { SCENARIO } from "@/lib/mock/fixtures/ids";
import { STRESS_TEST } from "@/lib/mock/fixtures/sandbox-scenarios";

/* ── Stages ── */

export type StageId = "preparing" | "trigger" | "agent" | "checkpoint" | "result";

export const STAGE_ORDER: StageId[] = ["preparing", "trigger", "agent", "checkpoint", "result"];

export const STAGE_LABEL: Record<StageId, string> = {
  preparing: "Preparing",
  trigger: "Running trigger",
  agent: "Agent action",
  checkpoint: "Human checkpoint",
  result: "Result",
};

export function stageOfKind(kind: SandboxEventKind): StageId {
  switch (kind) {
    case "trigger":
      return "trigger";
    case "approval_pause":
    case "approval_resolved":
      return "checkpoint";
    case "result":
      return "result";
    default:
      /* agent_step / message / data_request / draft */
      return "agent";
  }
}

export const stageIndex = (s: StageId): number => STAGE_ORDER.indexOf(s);

/* ── Test-list entries (3 scenarios + the stress test) ── */

/** Synthetic list-entry id for the 20-case stress test. */
export const STRESS_ENTRY_ID = "stress-test-20";

export type EntryStatus =
  | "not_run"
  | "running"
  | "needs_review"
  | "passed"
  | "failed"
  | "stopped";

/** Business-function category tag per entry (left rail + main header). */
export const ENTRY_CATEGORY: Record<string, string> = {
  [SCENARIO.complaint]: "Customer care",
  [SCENARIO.appointment]: "Scheduling",
  [SCENARIO.invoice]: "Finance",
  [STRESS_ENTRY_ID]: "Customer care",
};

/** One expected-behavior line per scenario, written from its fixture description. */
export const EXPECTED_BEHAVIOR: Record<string, string> = {
  [SCENARIO.complaint]:
    "Gathers the full case history across three systems, drafts a resolution, and pauses at a human checkpoint before any compensation is offered.",
  [SCENARIO.appointment]:
    "Finds and holds a suitable slot, drafts the confirmation for coordinator review, and completes without a human checkpoint (routine scheduling).",
  [SCENARIO.invoice]:
    "Summarises overdue invoices, drafts the reminder batch, and pauses at one human checkpoint before anything is queued for sending.",
  [STRESS_ENTRY_ID]:
    `${STRESS_TEST.passed} cases handled within policy, ${STRESS_TEST.escalated} escalated to you correctly, and ${STRESS_TEST.failed} stopped safely on missing data.`,
};
