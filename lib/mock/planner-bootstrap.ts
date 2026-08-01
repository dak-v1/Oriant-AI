/**
 * Step 9 Pass 1 shared bootstrap: fetch GET /api/planner/context, hydrate
 * the store from an existing plan, or generate one if none exists yet.
 * Used by both PlannerExperience (on arrival) and AgentConfigPage (on a
 * direct/hard navigation to an agent's config URL, where the global Zustand
 * store hasn't been populated by a prior visit to /app/planner).
 */
import { useDemoStore } from "./store";
import type { AgentConfigExt, AgentTemplate, WorkforcePlanRow } from "@/lib/server/planner/types";

interface ContextResponse {
  organizationId: string;
  sessionId: string;
  roleBHandoffId: string | null;
  plan: WorkforcePlanRow | null;
  agents: AgentConfigExt[] | null;
  templates: AgentTemplate[];
}

export async function ensurePlanLoaded(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const ctxRes = await fetch("/api/planner/context", { cache: "no-store" });
    if (!ctxRes.ok) {
      const body = (await ctxRes.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "Could not load your plan context.");
    }
    const ctx = (await ctxRes.json()) as ContextResponse;

    if (ctx.plan && ctx.agents) {
      useDemoStore.getState().syncPlanFromServer({
        organizationId: ctx.organizationId,
        plan: ctx.plan,
        agents: ctx.agents,
        templates: ctx.templates,
      });
      return { ok: true };
    }

    if (!ctx.roleBHandoffId) {
      throw new Error("No approved company report handoff found yet for this session.");
    }

    const genRes = await fetch("/api/planner/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: ctx.sessionId }),
    });
    if (!genRes.ok) {
      const body = (await genRes.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "Could not generate a workforce plan.");
    }
    const generated = (await genRes.json()) as { plan: WorkforcePlanRow | null; agents: AgentConfigExt[] | null };
    if (!generated.plan || !generated.agents) throw new Error("The generated plan came back empty.");

    useDemoStore.getState().syncPlanFromServer({
      organizationId: ctx.organizationId,
      plan: generated.plan,
      agents: generated.agents,
      templates: ctx.templates,
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Something went wrong loading the plan.",
    };
  }
}
