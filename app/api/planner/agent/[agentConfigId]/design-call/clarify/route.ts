import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { withPlannerErrors } from "@/lib/server/planner/http";
import { PlannerError } from "@/lib/server/planner/errors";
import { agentConfigs, agentDesignSessions, agentDesignTurns, workforcePlans } from "@/lib/server/planner/db";
import { proposeClarifyingQuestions, synthesizeAgentSpec } from "@/lib/server/planner/design-call";

interface ClarifyBody {
  sessionId: string;
}

/** Review a design call's answers so far; either ask more, or finish and synthesize the agent's spec. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentConfigId: string }> }
) {
  return withPlannerErrors(async () => {
    const { agentConfigId } = await params;
    const body = (await req.json()) as Partial<ClarifyBody>;
    if (!body.sessionId) throw new PlannerError(400, "sessionId is required.");

    const session = await agentDesignSessions.get(body.sessionId);
    if (!session) throw new PlannerError(404, "Design call session not found.");
    if (session.agent_config_id !== agentConfigId) {
      throw new PlannerError(400, "This session does not belong to this agent.");
    }

    const agent = await agentConfigs.get(agentConfigId);
    if (!agent) throw new PlannerError(404, "Agent config not found.");

    const rawTurns = await agentDesignTurns.listBySession(body.sessionId);
    if (rawTurns.length === 0) throw new PlannerError(400, "No answers submitted yet.");

    const turns = rawTurns.map((t) => ({
      questionId: t.question_id,
      answer: t.confirmed_answer ?? t.transcript ?? "",
    }));

    // Best-effort name lookup, same as /start — not required for clarification to work.
    let agentName = agent.agent_key;
    const plan = await workforcePlans.get(agent.workforce_plan_id);
    const agents = (plan?.plan as { agents?: unknown[] } | null)?.agents;
    const proposal = Array.isArray(agents)
      ? (agents.find((a) => (a as { agentKey?: string }).agentKey === agent.agent_key) as
          | { name?: string }
          | undefined)
      : undefined;
    if (proposal?.name) agentName = proposal.name;

    const questions = await proposeClarifyingQuestions({
      designSessionId: body.sessionId,
      agentName,
      turns,
    });

    if (questions.length === 0) {
      await agentDesignSessions.update(body.sessionId, {
        status: "completed",
        completed_at: new Date().toISOString(),
      });

      const spec = synthesizeAgentSpec(turns);
      const updatedAgent = await agentConfigs.update(agentConfigId, {
        config: { ...(agent.config ?? {}), spec },
        status: "needs_configuration",
      });

      return NextResponse.json({ done: true, agent: updatedAgent });
    }

    return NextResponse.json({ done: false, sessionId: body.sessionId, questions });
  });
}
