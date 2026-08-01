/**
 * lib/mock/state-machine.ts — the linear journey (spec §5) plus route guards.
 *
 * The journey is an ordered list; navigation may always go BACKWARD (review
 * earlier phases) but deep links FORWARD of the current state redirect to the
 * current step's route. blocked / needs_information / failed live on objects
 * (agents, jobs), not here.
 */
import type { JourneyState } from "./types";

export const JOURNEY_ORDER: JourneyState[] = [
  "not_started",
  "onboarding",
  "discovery",
  "report_review",
  "report_approved",
  "planning",
  "plan_review",
  "agent_configuration",
  "plan_approved",
  "building",
  "sandbox_ready",
  "validation_review",
  "ready_to_activate",
  "activating",
  "active_workspace",
];

export function journeyIndex(s: JourneyState): number {
  return JOURNEY_ORDER.indexOf(s);
}

/** True if `state` is at or past `min`. */
export function atLeast(state: JourneyState, min: JourneyState): boolean {
  return journeyIndex(state) >= journeyIndex(min);
}

/** The route the user should be on for a given journey state. */
export function homeRouteFor(state: JourneyState): string {
  switch (state) {
    case "not_started":
    case "onboarding":
      return "/app/onboarding";
    case "discovery":
      return "/app/discovery";
    case "report_review":
    case "report_approved":
      return "/app/discovery/report";
    case "planning":
    case "plan_review":
    case "agent_configuration":
      return "/app/planner";
    case "plan_approved":
    case "building":
      return "/app/build";
    case "sandbox_ready":
    case "validation_review":
      return "/app/sandbox";
    case "ready_to_activate":
    case "activating":
      return "/app/deploy";
    case "active_workspace":
      return "/app/workspace";
  }
}

/** Minimum journey state required to visit a route (prefix match). */
const ROUTE_GATES: { prefix: string; min: JourneyState }[] = [
  { prefix: "/app/workspace", min: "active_workspace" },
  { prefix: "/app/deploy", min: "ready_to_activate" },
  { prefix: "/app/sandbox", min: "sandbox_ready" },
  { prefix: "/app/build", min: "plan_approved" },
  { prefix: "/app/integrations", min: "report_approved" },
  { prefix: "/app/planner", min: "report_approved" },
  { prefix: "/app/discovery/report", min: "report_review" },
  { prefix: "/app/discovery/review", min: "discovery" },
  { prefix: "/app/discovery", min: "discovery" },
  { prefix: "/app/onboarding", min: "not_started" },
];

/**
 * Guard a navigation: returns null if allowed, else the route to redirect to
 * (the current step's home). Backward navigation is always allowed.
 */
export function guardRoute(pathname: string, state: JourneyState): string | null {
  const gate = ROUTE_GATES.find((g) => pathname.startsWith(g.prefix));
  if (!gate) return null;
  if (atLeast(state, gate.min)) return null;
  return homeRouteFor(state);
}

/* ── Progress tracker (spec §4): 6 top-level phases ── */

export interface ProgressPhase {
  id: string;
  label: string;
  /** State at which this phase is the ACTIVE one. */
  activeFrom: JourneyState;
  /** State at which this phase counts as complete. */
  doneAt: JourneyState;
  route: string;
}

export const PROGRESS_PHASES: ProgressPhase[] = [
  { id: "discovery", label: "Discovery", activeFrom: "not_started", doneAt: "report_review", route: "/app/discovery" },
  { id: "report", label: "Report", activeFrom: "report_review", doneAt: "report_approved", route: "/app/discovery/report" },
  { id: "plan", label: "Plan", activeFrom: "planning", doneAt: "plan_approved", route: "/app/planner" },
  { id: "configure", label: "Build", activeFrom: "plan_approved", doneAt: "sandbox_ready", route: "/app/build" },
  { id: "test", label: "Test", activeFrom: "sandbox_ready", doneAt: "ready_to_activate", route: "/app/sandbox" },
  { id: "activate", label: "Activate", activeFrom: "ready_to_activate", doneAt: "active_workspace", route: "/app/deploy" },
];

export function phaseStatus(
  phase: ProgressPhase,
  state: JourneyState,
): "done" | "active" | "upcoming" {
  if (atLeast(state, phase.doneAt)) return "done";
  if (atLeast(state, phase.activeFrom)) return "active";
  return "upcoming";
}

/* ── Left-nav sections (spec §4) ── */

export interface NavSection {
  id: string;
  label: string;
  route: string;
  min: JourneyState;
  children: { label: string; route: string; min: JourneyState }[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    id: "discovery",
    label: "Discovery",
    route: "/app/setup",
    min: "not_started",
    children: [
      { label: "Setup preference", route: "/app/setup", min: "not_started" },
      { label: "Onboarding", route: "/app/onboarding", min: "not_started" },
      { label: "Interview", route: "/app/discovery", min: "discovery" },
      { label: "Discovery Review", route: "/app/discovery/review", min: "discovery" },
      { label: "Company report", route: "/app/discovery/report", min: "report_review" },
    ],
  },
  {
    id: "plan",
    label: "Plan",
    route: "/app/planner",
    min: "planning",
    children: [
      { label: "Workforce plan", route: "/app/planner", min: "planning" },
      { label: "Integrations", route: "/app/integrations", min: "planning" },
    ],
  },
  {
    id: "build",
    label: "Build",
    route: "/app/build",
    min: "plan_approved",
    children: [
      { label: "Agent Factory", route: "/app/build", min: "plan_approved" },
      { label: "Sandbox", route: "/app/sandbox", min: "sandbox_ready" },
      { label: "Activation", route: "/app/deploy", min: "ready_to_activate" },
    ],
  },
  {
    id: "operate",
    label: "Operate",
    route: "/app/workspace",
    min: "active_workspace",
    children: [
      { label: "Workspace", route: "/app/workspace", min: "active_workspace" },
      { label: "Approvals", route: "/app/workspace/approvals", min: "active_workspace" },
      { label: "Calendar", route: "/app/workspace/calendar", min: "active_workspace" },
      { label: "Agents", route: "/app/workspace/agents", min: "active_workspace" },
      { label: "Integrations", route: "/app/workspace/integrations", min: "active_workspace" },
    ],
  },
];
