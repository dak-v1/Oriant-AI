import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { withPlannerErrors } from "@/lib/server/planner/http";
import { PlannerError } from "@/lib/server/planner/errors";
import { agentDesignSessions, agentDesignTurns } from "@/lib/server/planner/db";

interface TurnBody {
  sessionId: string;
  questionId: string;
  answer: string;
}

/** Record one design-call answer. Fire-and-forget from the caller's side, like the discovery reference. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentConfigId: string }> }
) {
  return withPlannerErrors(async () => {
    const { agentConfigId } = await params;
    const body = (await req.json()) as Partial<TurnBody>;

    if (!body.sessionId || !body.questionId || typeof body.answer !== "string") {
      throw new PlannerError(400, "sessionId, questionId, and answer are required.");
    }

    const session = await agentDesignSessions.get(body.sessionId);
    if (!session) throw new PlannerError(404, "Design call session not found.");
    if (session.agent_config_id !== agentConfigId) {
      throw new PlannerError(400, "This session does not belong to this agent.");
    }
    if (session.status !== "in_progress") {
      throw new PlannerError(400, `Design call session is already ${session.status}.`);
    }

    const turn = await agentDesignTurns.create({
      design_session_id: body.sessionId,
      question_id: body.questionId,
      transcript: body.answer,
      confirmed_answer: body.answer,
      source: "typed",
    });

    return NextResponse.json({ ok: true, turn });
  });
}
