import type { CompanyReport, Db, OnboardingAnswer } from "../contracts";

function answerValue(session: Db["onboarding"]["sessions"][string] | null, questionId: string) {
  return session?.answers[questionId]?.value ?? null;
}

function textValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function firstDiscoveryAnswer(answers: Record<string, string>, patterns: string[]) {
  return Object.entries(answers).find(([id]) => patterns.some((pattern) => id.includes(pattern)))?.[1]?.trim() ?? "";
}

function onboardingAnswerPayload(session: Db["onboarding"]["sessions"][string] | null) {
  if (!session) return {};
  return Object.fromEntries(
    Object.entries(session.answers).map(([questionId, answer]: [string, OnboardingAnswer]) => [questionId, {
      field_path: answer.fieldPath,
      value: answer.value,
      source: answer.source,
      confirmed: answer.confirmed,
      confidence: answer.confidence,
      updated_at: answer.updatedAt,
    }]),
  );
}

function orderedSteps(currentWorkflow: string, stepsAnswer: string) {
  return [stepsAnswer, currentWorkflow]
    .filter(Boolean)
    .join(". ")
    .split(/\n+|\. (?=[A-Z0-9])|, then | then | → | -> /i)
    .map((step) => step.trim())
    .filter(Boolean);
}

/**
 * Build the internal handoff from the server's hydrated Supabase snapshot.
 * This intentionally does not import demo-company fixtures or browser state.
 */
export function buildDiscoveryHandoff(db: Db) {
  const sessionId = db.onboarding.activeSessionId;
  const session = sessionId ? db.onboarding.sessions[sessionId] ?? null : null;
  const onboarding = session?.answers ?? {};
  const interviewAnswers = db.call.answers;
  const clarificationAnswers = db.call.clarificationAnswers ?? {};
  const intro = textValue(answerValue(session, "company_intro"));
  const businessArea = textValue(answerValue(session, "business_area"));
  const repetitiveTask = textValue(answerValue(session, "repetitive_task"));
  const currentWorkflow = textValue(answerValue(session, "current_workflow"));
  // Clarification answers explain or correct the interview; they should not
  // be mistaken for workflow fields just because an id contains a keyword.
  const steps = firstDiscoveryAnswer(interviewAnswers, ["steps"]);
  const trigger = firstDiscoveryAnswer(interviewAnswers, ["trigger"]);
  const inputs = firstDiscoveryAnswer(interviewAnswers, ["input", "document", "data_inputs"]);
  const outputs = firstDiscoveryAnswer(interviewAnswers, ["success", "outcome"]);
  const handoffs = firstDiscoveryAnswer(interviewAnswers, ["handoff"]);
  const decisions = firstDiscoveryAnswer(interviewAnswers, ["decision", "human"]);
  const missingInformation = [
    !businessArea && "Business area is missing.",
    !repetitiveTask && "Repetitive task is missing.",
    !currentWorkflow && "Current workflow summary is missing.",
    !trigger && "Workflow trigger is still missing.",
    !steps && "Ordered workflow steps are still incomplete.",
    !inputs && "The information needed to run this workflow is still missing.",
    !decisions && "Human approval boundaries are still missing.",
  ].filter((item): item is string => Boolean(item));
  const tools = [
    ...(Array.isArray(answerValue(session, "selected_tools")) ? answerValue(session, "selected_tools") as string[] : []),
    ...(Array.isArray(answerValue(session, "custom_tools")) ? answerValue(session, "custom_tools") as string[] : []),
  ];

  return {
    handoff_type: "discovery_findings" as const,
    generated_at: new Date().toISOString(),
    raw_inputs: {
      company_name: db.org.name,
      onboarding: {
        session_id: session?.id ?? null,
        answers: onboardingAnswerPayload(session),
        intro: intro || null,
        organization_shape: session?.organization.shape ?? null,
        employee_count: session?.organization.employeeCount ?? answerValue(session, "employee_count"),
        workflow_builder: answerValue(session, "setup_builder"),
        builder_access: answerValue(session, "setup_builder_access"),
        approval_preference: session?.organization.approvalPreference ?? null,
        onboarding_ownership: session?.organization.onboardingOwnership ?? null,
        automation_scope: answerValue(session, "automation_scope"),
        automation_mode: answerValue(session, "automation_mode"),
        business_area: businessArea || null,
        repetitive_task: repetitiveTask || null,
        current_workflow: currentWorkflow || null,
        selected_tools: tools,
        employee_emails: session?.organization.employeeEmails ?? [],
        department_approvals: session?.organization.departmentApprovals ?? [],
        ...(session?.organization.shape !== "solo" ? { approval_owner: session?.organization.approvalOwner ?? null } : {}),
      },
      interview: {
        answered_count: Object.keys(interviewAnswers).length,
        completed: Boolean(db.call.completedAt),
        answers: interviewAnswers,
        clarification_answers: clarificationAnswers,
        clarification_questions: db.call.clarificationQuestions ?? [],
        clarification_completed_at: db.call.clarificationCompletedAt ?? null,
      },
      voice: session?.voice
        ? {
            provider: session.voice.provider,
            language: session.voice.language,
            turns: session.voice.turns,
          }
        : null,
      report_meta: {
        version: db.report?.version ?? null,
        status: db.report?.status ?? "not_generated",
        server_report: db.report,
      },
    },
    structured_findings: {
      business_context: {
        company_name: db.org.name,
        company_intro: intro || null,
        organization_shape: session?.organization.shape ?? null,
        employee_count: session?.organization.employeeCount ?? null,
        focus_area: businessArea || null,
      },
      workflow_summary: {
        workflow_name: repetitiveTask || null,
        current_workflow_summary: currentWorkflow || null,
        trigger: trigger || null,
        ordered_steps: orderedSteps(currentWorkflow, steps),
        inputs: inputs ? [inputs] : [],
        outputs: outputs ? [outputs] : [],
        handoffs: handoffs ? [handoffs] : [],
        tools,
        human_only_decisions: decisions ? [decisions] : [],
      },
      missing_information: missingInformation,
      clarification_answers: clarificationAnswers,
      confidence: Math.max(0.35, Math.min(0.95, 1 - missingInformation.length * 0.08)),
    },
  };
}
