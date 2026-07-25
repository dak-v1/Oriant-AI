"use client";
/**
 * script.ts — the ordered auto-play journey ("Do it for me").
 *
 * Each stop navigates to a route, triggers that screen's real interaction
 * (dispatching a bus command so voice / generation / build / sandbox /
 * activation animations actually play), then waits on demo-store state before
 * moving on. Every animated stop has a deterministic store-action fallback so
 * the run can never stall, ending on the Operate workspace.
 */
import type { ApStop } from "./engine";
import { atLeast } from "@/lib/mock/state-machine";
import { AGENT, SCENARIO } from "@/lib/mock/fixtures/ids";
import { REPORT_FACTS } from "@/lib/mock/fixtures/company-report";
import { DISCOVERY_QUESTIONS } from "@/lib/mock/fixtures/discovery-questions";

/** Command names dispatched to cooperating screens over the bus. */
export const AP = {
  onboarding: "ap:onboarding",
  leancanvas: "ap:leancanvas",
  discovery: "ap:discovery",
  sandbox: "ap:sandbox",
  activate: "ap:activate",
} as const;

/** Recovery agent design answers (mirrors the fast-forward fixture in store). */
const RECOVERY_ANSWERS = {
  objective: "Coordinate high-value complaint resolution without financial commitments.",
  trigger: "Complaint marked high severity, or a high-value customer requests compensation.",
  inputs: "HubSpot customer history, job record, invoice status, technician notes.",
  decisions: "Draft resolution and proposed compensation for owner review.",
  permittedActions: "Gather context, draft resolutions, request technician information.",
  escalation: "Escalate when information is missing or sentiment remains highly negative.",
  systems: "HubSpot, Gmail, QuickBooks, Slack.",
  successCriteria: "Owner receives a complete, approvable resolution within one business day.",
};

export const AUTOPILOT_STOPS: ApStop[] = [
  {
    label: "Starting a fresh demo",
    run: async (ctx) => {
      ctx.s().resetDemo();
      await ctx.delay(350);
      await ctx.go("/app/onboarding", 750);
    },
    pause: 400,
  },
  {
    label: "Onboarding: loading the demo company",
    run: async (ctx) => {
      ctx.dispatch(AP.onboarding);
      const ok = await ctx.wait((s) => s.onboarding.completed, 8000);
      if (!ok) {
        const s = ctx.s();
        s.setMode("assist");
        s.useDemoCompany();
        s.captureSection("automation-preference");
        s.acceptConsent();
        s.captureSection("consent");
        s.completeOnboarding();
      }
    },
    pause: 500,
  },
  {
    label: "Lean Canvas: the business on one page",
    route: "/app/onboarding/lean-canvas",
    run: async (ctx) => {
      ctx.dispatch(AP.leancanvas);
      const ok = await ctx.wait((s) => s.leanCanvas.completed, 8000);
      if (!ok) {
        const s = ctx.s();
        s.fillCanvasFromDemo();
        s.setCanvasSource("guided");
        s.completeCanvas();
      }
    },
    pause: 500,
  },
  {
    label: "Discovery: the voice interview",
    route: "/app/discovery",
    run: async (ctx) => {
      ctx.dispatch(AP.discovery); // plays the voice prefill, then compiles the report
      const ok = await ctx.wait((s) => atLeast(s.journey, "report_review"), 34000);
      if (!ok) {
        const s = ctx.s();
        for (const q of DISCOVERY_QUESTIONS) {
          if (!s.discovery.answers[q.id]) s.confirmAnswer(q.id, q.answer);
        }
        s.completeDiscovery();
      }
    },
    timeout: 34000,
    pause: 700,
  },
  {
    label: "Company report: approving Gate 1",
    route: "/app/discovery/report",
    run: async (ctx) => {
      await ctx.delay(1500); // let the report be read on screen
      ctx.s().confirmFacts(REPORT_FACTS.map((f) => f.id));
      await ctx.delay(1300); // facts turn confirmed
      ctx.s().approveReport();
      await ctx.wait((s) => s.report.status === "approved", 6000);
    },
    pause: 600,
  },
  {
    label: "Planner: designing the workforce",
    route: "/app/planner",
    run: async (ctx) => {
      // The planner auto-generates on mount; watch the 5 stages play.
      await ctx.wait((s) => atLeast(s.journey, "plan_review") && s.plan.agents.length > 0, 18000);
      await ctx.delay(1500);
      const s = ctx.s();
      s.markAgentConfigured(AGENT.admin);
      s.markAgentConfigured(AGENT.marketing);
      s.markAgentConfigured(AGENT.finance);
      s.submitDesignAnswers(AGENT.recovery, RECOVERY_ANSWERS);
      s.approveAgentDesign(AGENT.recovery);
      await ctx.delay(1600);
    },
    pause: 400,
  },
  {
    label: "Confirming the plan: Gate 2",
    run: async (ctx) => {
      ctx.s().approvePlan();
      await ctx.wait((s) => s.plan.status === "approved", 6000);
    },
    pause: 500,
  },
  {
    label: "Agent Factory: building the packages",
    route: "/app/build",
    run: async (ctx) => {
      // Build auto-starts and streams per-agent jobs; wait for all to finish.
      await ctx.wait((s) => atLeast(s.journey, "sandbox_ready"), 28000);
      await ctx.delay(1400);
    },
    timeout: 28000,
    pause: 400,
  },
  {
    label: "Sandbox: testing a real scenario",
    route: "/app/sandbox",
    run: async (ctx) => {
      ctx.dispatch(AP.sandbox); // runs the complaint scenario, auto-approves the pause
      const ok = await ctx.wait((s) => s.sandbox.phase === "completed", 28000);
      if (!ok) {
        const s = ctx.s();
        s.startSandboxRun(SCENARIO.complaint);
        s.completeSandboxRun();
      }
      await ctx.delay(1400);
      ctx.s().finishValidation();
      await ctx.wait((s) => atLeast(s.journey, "ready_to_activate"), 6000);
    },
    timeout: 28000,
    pause: 600,
  },
  {
    label: "Activation: bringing the workforce live",
    route: "/app/deploy",
    run: async (ctx) => {
      const s = ctx.s();
      s.setChecklistValue("warnings", true);
      s.setChecklistValue("owners", true);
      s.setChecklistValue("schedules", true);
      s.setChecklistValue("systems", true);
      s.setChecklistValue("channels", "In-app, WhatsApp, Email digest");
      await ctx.delay(1600); // show the ticked checklist
      ctx.dispatch(AP.activate); // begins the activation animation
      const ok = await ctx.wait((st) => st.journey === "active_workspace", 16000);
      if (!ok) {
        const st = ctx.s();
        st.beginActivation();
        st.completeActivation();
      }
    },
    timeout: 16000,
    pause: 800,
  },
  {
    label: "Operate: your workforce is live",
    route: "/app/workspace",
    run: async (ctx) => {
      ctx.s().setTeam("overview");
      await ctx.delay(1400);
    },
    pause: 200,
  },
];
