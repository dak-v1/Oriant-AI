import type {
  BusinessBlueprint,
  CompanyReport,
  DepartmentApproval,
  Db,
  OnboardingAnswer,
  OnboardingSession,
  RoleBHandoff,
  VoiceSession,
  VoiceTurn,
} from "../contracts";
import { assertSupabaseConfigured, getSupabaseAdmin, supabaseLive } from "./supabase";

function orgExternalKey(db: Db): string {
  return `mock:${db.org.name}:${db.org.owner}`.toLowerCase();
}

function approvalOwnerForOrganization(session: OnboardingSession | null, ownerName: string) {
  if (!session) return null;

  const isSolo = session.organization.shape === "solo";
  const workflowBuilder = session.answers.setup_builder?.value;
  const isInviteFlow = workflowBuilder === "invite";
  const approvalOwner = session.organization.approvalOwner?.trim();

  if (isSolo || !isInviteFlow || !approvalOwner) return null;
  return approvalOwner;
}

async function ensureOrganization(db: Db) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const externalKey = orgExternalKey(db);
  const activeSession = db.onboarding.activeSessionId
    ? db.onboarding.sessions[db.onboarding.activeSessionId] ?? null
    : null;
  const upsert = await supabase
    .from("organizations")
    .upsert({
      external_key: externalKey,
      name: db.org.name,
      approval_owner: approvalOwnerForOrganization(activeSession, db.org.owner),
      shape: activeSession
        ? activeSession.organization.shape ?? "solo"
        : "solo",
      employee_count: activeSession
        ? activeSession.organization.employeeCount ?? null
        : null,
    }, { onConflict: "external_key" })
    .select("id")
    .single();

  if (upsert.error) throw upsert.error;
  return upsert.data.id as string;
}

async function ensureSession(orgId: string, session: OnboardingSession) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const upsert = await supabase
    .from("onboarding_sessions")
    .upsert({
      external_id: session.id,
      organization_id: orgId,
      preferred_channel: session.preferredChannel,
      status: session.status,
      current_step: session.currentStep,
      progress: session.progress,
      consent_accepted: session.consentAccepted,
      transcript_review_required: session.transcriptReviewRequired,
      schema_version: session.schemaVersion,
      blueprint_version: session.blueprint?.version ?? null,
      created_at: session.startedAt,
      updated_at: session.updatedAt,
      completed_at: session.completedAt ?? null,
    }, { onConflict: "external_id" })
    .select("id")
    .single();

  if (upsert.error) throw upsert.error;
  return upsert.data.id as string;
}

async function resolveSessionRecord(db: Db): Promise<{ orgId: string; sessionId: string; externalId: string } | null> {
  if (!supabaseLive()) return null;
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const org = await supabase
    .from("organizations")
    .select("id")
    .eq("external_key", orgExternalKey(db))
    .maybeSingle();
  if (org.error || !org.data?.id) return null;

  const activeExternalId = db.onboarding.activeSessionId;
  if (activeExternalId) {
    const session = await supabase
      .from("onboarding_sessions")
      .select("id, external_id")
      .eq("organization_id", org.data.id)
      .eq("external_id", activeExternalId)
      .maybeSingle();
    if (session.error) throw session.error;
    if (session.data?.id) {
      return {
        orgId: org.data.id as string,
        sessionId: session.data.id as string,
        externalId: session.data.external_id as string,
      };
    }
  }

  const latest = await supabase
    .from("onboarding_sessions")
    .select("id, external_id")
    .eq("organization_id", org.data.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest.error || !latest.data?.id) return null;

  return {
    orgId: org.data.id as string,
    sessionId: latest.data.id as string,
    externalId: latest.data.external_id as string,
  };
}

export async function mirrorOnboardingToSupabase(db: Db): Promise<"live" | "fixture"> {
  assertSupabaseConfigured();
  const supabase = getSupabaseAdmin();
  const activeId = db.onboarding.activeSessionId;
  const session = activeId ? db.onboarding.sessions[activeId] : null;
  if (!supabase || !session) return "fixture";

  const orgId = await ensureOrganization(db);
  if (!orgId) return "fixture";
  const sessionId = await ensureSession(orgId, session);
  if (!sessionId) return "fixture";

  const answers = Object.values(session.answers).map((answer) => ({
    session_id: sessionId,
    question_id: answer.questionId,
    field_path: answer.fieldPath,
    value: answer.value,
    source: answer.source,
    confirmed: answer.confirmed,
    confidence: answer.confidence,
    updated_at: answer.updatedAt,
  }));
  if (answers.length > 0) {
    const answerResult = await supabase
      .from("onboarding_answers")
      .upsert(answers, { onConflict: "session_id,question_id" });
    if (answerResult.error) throw answerResult.error;
  }

  if (session.voice) {
    const voiceSession = await supabase
      .from("voice_sessions")
      .upsert({
        external_id: session.voice.id,
        session_id: sessionId,
        provider: session.voice.provider,
        language: session.voice.language,
        started_at: session.voice.startedAt,
        last_turn_at: session.voice.lastTurnAt,
      }, { onConflict: "external_id" })
      .select("id")
      .single();
    if (voiceSession.error) throw voiceSession.error;

    if (session.voice.turns.length > 0) {
      const turns = session.voice.turns.map((turn) => ({
        external_id: turn.id,
        voice_session_id: voiceSession.data.id,
        question_id: turn.questionId,
        transcript: turn.transcript,
        confirmed_answer: turn.confirmedAnswer ?? null,
        status: turn.status,
        created_at: turn.createdAt,
      }));
      const turnResult = await supabase
        .from("voice_turns")
        .upsert(turns, { onConflict: "external_id" });
      if (turnResult.error) throw turnResult.error;
    }
  }

  if (session.blueprint) {
    const blueprintResult = await supabase
      .from("business_blueprint_versions")
      .upsert({
        session_id: sessionId,
        version: session.blueprint.version,
        status: session.blueprint.status,
        blueprint: session.blueprint.blueprint,
        approved_at: session.blueprint.approvedAt ?? null,
        created_at: session.blueprint.createdAt,
      }, { onConflict: "session_id,version" });
    if (blueprintResult.error) throw blueprintResult.error;
  }

  if (session.handoff) {
    const handoffResult = await supabase
      .from("role_b_handoffs")
      .upsert({
        external_id: session.handoff.id,
        session_id: sessionId,
        blueprint_version: session.handoff.blueprintVersion,
        idempotency_key: session.handoff.idempotencyKey,
        occurred_at: session.handoff.occurredAt,
        status: session.handoff.status,
        payload: session.handoff.payload,
        created_at: session.handoff.createdAt,
      }, { onConflict: "external_id" });
    if (handoffResult.error) throw handoffResult.error;
  }

    const discoverySessionResult = await supabase
      .from("discovery_sessions")
      .upsert({
        session_id: sessionId,
        goals: db.call.goals,
        systems: db.call.systems,
        canvas_uploaded: db.call.canvasUploaded,
        completed_at: db.call.completedAt ?? null,
        clarification_questions: db.call.clarificationQuestions ?? [],
        clarification_answers: db.call.clarificationAnswers ?? {},
        clarification_completed_at: db.call.clarificationCompletedAt ?? null,
        updated_at: session.updatedAt,
    }, { onConflict: "session_id" });
  if (discoverySessionResult.error) throw discoverySessionResult.error;

  const existingDiscoveryAnswersResult = await supabase
    .from("discovery_answers")
    .select("question_id")
    .eq("session_id", sessionId);
  if (existingDiscoveryAnswersResult.error) throw existingDiscoveryAnswersResult.error;

  const currentQuestionIds = new Set(Object.keys(db.call.answers));
  const staleQuestionIds = (existingDiscoveryAnswersResult.data ?? [])
    .map((row) => row.question_id as string)
    .filter((questionId) => !currentQuestionIds.has(questionId));

  if (staleQuestionIds.length > 0) {
    const staleDeleteResult = await supabase
      .from("discovery_answers")
      .delete()
      .eq("session_id", sessionId)
      .in("question_id", staleQuestionIds);
    if (staleDeleteResult.error) throw staleDeleteResult.error;
  }

  const discoveryAnswers = Object.entries(db.call.answers).map(([questionId, answer]) => ({
    session_id: sessionId,
    question_id: questionId,
    answer,
    confirmed_at: db.call.completedAt ?? null,
    updated_at: session.updatedAt,
  }));
  if (discoveryAnswers.length > 0) {
    const discoveryAnswerResult = await supabase
      .from("discovery_answers")
      .upsert(discoveryAnswers, { onConflict: "session_id,question_id" });
    if (discoveryAnswerResult.error) throw discoveryAnswerResult.error;
  }

  if (db.report) {
    const reportResult = await supabase
      .from("company_reports")
      .upsert({
        session_id: sessionId,
        version: db.report.version,
        status: db.report.status,
        approved_by: db.report.approvedBy ?? null,
        approved_at: db.report.approvedAt ?? null,
        report: db.report,
        created_at: db.call.completedAt ?? session.startedAt,
        updated_at: session.updatedAt,
      }, { onConflict: "session_id,version" });
    if (reportResult.error) throw reportResult.error;
  }

  const auditRows = db.audit.slice(0, 50).map((entry) => ({
    external_id: entry.id,
    organization_id: orgId,
    session_id: sessionId,
    action: entry.action,
    subject: entry.subject,
    detail: entry.detail ?? null,
    created_at: entry.at,
  }));
  if (auditRows.length > 0) {
    const auditResult = await supabase
      .from("audit_logs")
      .upsert(auditRows, { onConflict: "external_id" });
    if (auditResult.error) throw auditResult.error;
  }

  const eventRows = db.systemEvents.slice(0, 100).map((entry) => ({
    external_id: entry.id,
    organization_id: orgId,
    session_id: sessionId,
    scope: entry.scope,
    event: entry.event,
    status: entry.status,
    detail: entry.detail ?? null,
    question_id: entry.questionId ?? null,
    created_at: entry.at,
  }));
  if (eventRows.length > 0) {
    const eventResult = await supabase
      .from("system_events")
      .upsert(eventRows, { onConflict: "external_id" });
    if (eventResult.error) throw eventResult.error;
  }

  return "live";
}

function parseAnswerRow(row: {
  question_id: string;
  field_path: string;
  value: string | string[] | boolean | number | DepartmentApproval[];
  source: "typed" | "voice" | "transcript_review" | "system_extract";
  confirmed: boolean;
  confidence: number;
  updated_at: string;
}): OnboardingAnswer {
  return {
    questionId: row.question_id,
    fieldPath: row.field_path,
    value: row.value,
    source: row.source,
    confirmed: row.confirmed,
    confidence: row.confidence,
    updatedAt: row.updated_at,
  };
}

export async function hydrateOnboardingFromSupabase(db: Db): Promise<"live" | "fixture"> {
  assertSupabaseConfigured();

  const supabase = getSupabaseAdmin();
  if (!supabase) return "fixture";

  const org = await supabase
    .from("organizations")
    .select("id")
    .eq("external_key", orgExternalKey(db))
    .maybeSingle();
  if (org.error || !org.data?.id) return "fixture";

  const sessionRow = await supabase
    .from("onboarding_sessions")
    .select("*")
    .eq("organization_id", org.data.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (sessionRow.error || !sessionRow.data) return "fixture";

  const sessionId = sessionRow.data.id as string;
  const externalId = sessionRow.data.external_id as string;

  const [answersRow, blueprintRow, handoffRow, voiceSessionRow] = await Promise.all([
    supabase
      .from("onboarding_answers")
      .select("*")
      .eq("session_id", sessionId),
    supabase
      .from("business_blueprint_versions")
      .select("*")
      .eq("session_id", sessionId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("role_b_handoffs")
      .select("*")
      .eq("session_id", sessionId)
      .maybeSingle(),
    supabase
      .from("voice_sessions")
      .select("*")
      .eq("session_id", sessionId)
      .order("last_turn_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (answersRow.error) throw answersRow.error;
  if (blueprintRow.error) throw blueprintRow.error;
  if (handoffRow.error) throw handoffRow.error;
  if (voiceSessionRow.error) throw voiceSessionRow.error;

  let voice: VoiceSession | undefined;
  if (voiceSessionRow.data?.id) {
    const turnsRow = await supabase
      .from("voice_turns")
      .select("*")
      .eq("voice_session_id", voiceSessionRow.data.id)
      .order("created_at", { ascending: false });
    if (turnsRow.error) throw turnsRow.error;

    const turns: VoiceTurn[] = (turnsRow.data ?? []).map((turn) => ({
      id: turn.external_id as string,
      questionId: turn.question_id as string,
      transcript: turn.transcript as string,
      confirmedAnswer: (turn.confirmed_answer as string | null) ?? undefined,
      status: turn.status as "captured" | "confirmed",
      createdAt: turn.created_at as string,
    }));

    voice = {
      id: voiceSessionRow.data.external_id as string,
      provider: voiceSessionRow.data.provider as "elevenlabs" | "nosana" | "fixture",
      language: voiceSessionRow.data.language as string,
      startedAt: voiceSessionRow.data.started_at as string,
      lastTurnAt: voiceSessionRow.data.last_turn_at as string,
      turns,
    };
  }

  const answers = Object.fromEntries(
    (answersRow.data ?? []).map((row) => [row.question_id as string, parseAnswerRow({
      question_id: row.question_id as string,
      field_path: row.field_path as string,
      value: row.value as string | string[] | boolean | number | DepartmentApproval[],
      source: row.source as "typed" | "voice" | "transcript_review" | "system_extract",
      confirmed: row.confirmed as boolean,
      confidence: Number(row.confidence),
      updated_at: row.updated_at as string,
    })]),
  );

  const handoff: RoleBHandoff | undefined = handoffRow.data
    ? {
        id: handoffRow.data.external_id as string,
        idempotencyKey: handoffRow.data.idempotency_key as string,
        occurredAt: handoffRow.data.occurred_at as string,
        blueprintVersion: handoffRow.data.blueprint_version as number,
        status: handoffRow.data.status as "pending" | "ready",
        createdAt: handoffRow.data.created_at as string,
        payload: handoffRow.data.payload as RoleBHandoff["payload"],
      }
    : undefined;

  db.onboarding.activeSessionId = externalId;
  db.onboarding.sessions[externalId] = {
    id: externalId,
    schemaVersion: sessionRow.data.schema_version as string,
    status: sessionRow.data.status as OnboardingSession["status"],
    preferredChannel: sessionRow.data.preferred_channel as OnboardingSession["preferredChannel"],
    currentStep: sessionRow.data.current_step as OnboardingSession["currentStep"],
    progress: sessionRow.data.progress as number,
    organization: {
      shape: (sessionRow.data.status === "not_started"
        ? "solo"
        : (answers.organization_shape?.value as OnboardingSession["organization"]["shape"] | undefined)) ?? "solo",
      employeeCount: typeof answers.employee_count?.value === "number"
        ? answers.employee_count.value
        : undefined,
      approvalOwner: typeof answers.approval_owner?.value === "string"
        ? answers.approval_owner.value
        : undefined,
      approvalPreference: typeof answers.approval_preference?.value === "string"
        ? answers.approval_preference.value as OnboardingSession["organization"]["approvalPreference"]
        : "owner_all",
      onboardingOwnership: typeof answers.onboarding_owner_mode?.value === "string"
        ? answers.onboarding_owner_mode.value as OnboardingSession["organization"]["onboardingOwnership"]
        : "owner_only",
      employeeEmails: Array.isArray(answers.employee_emails?.value)
        ? answers.employee_emails.value.filter((item): item is string => typeof item === "string")
        : [],
      departmentApprovals: Array.isArray(answers.department_approvals?.value)
        ? answers.department_approvals.value as DepartmentApproval[]
        : [],
    },
    answers,
    selectedToolIds: Array.isArray(answers.selected_tools?.value)
      ? answers.selected_tools.value as string[]
      : [],
    consentAccepted: answers.consent_accepted?.value === true,
    transcriptReviewRequired: sessionRow.data.transcript_review_required as boolean,
    startedAt: sessionRow.data.created_at as string,
    updatedAt: sessionRow.data.updated_at as string,
    completedAt: (sessionRow.data.completed_at as string | null) ?? undefined,
    voice,
    blueprint: blueprintRow.data
      ? {
          version: blueprintRow.data.version as number,
          status: blueprintRow.data.status as "draft" | "approved",
          createdAt: blueprintRow.data.created_at as string,
          approvedAt: (blueprintRow.data.approved_at as string | null) ?? undefined,
          blueprint: blueprintRow.data.blueprint as BusinessBlueprint,
        }
      : undefined,
    handoff,
  };

  return "live";
}

export async function hydrateDiscoveryFromSupabase(db: Db): Promise<"live" | "fixture"> {
  assertSupabaseConfigured();

  const supabase = getSupabaseAdmin();
  if (!supabase) return "fixture";

  const session = await resolveSessionRecord(db);
  if (!session) return "fixture";

  const [discoverySessionRow, discoveryAnswersRow, reportRow] = await Promise.all([
    supabase
      .from("discovery_sessions")
      .select("*")
      .eq("session_id", session.sessionId)
      .maybeSingle(),
    supabase
      .from("discovery_answers")
      .select("*")
      .eq("session_id", session.sessionId),
    supabase
      .from("company_reports")
      .select("*")
      .eq("session_id", session.sessionId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (discoverySessionRow.error) throw discoverySessionRow.error;
  if (discoveryAnswersRow.error) throw discoveryAnswersRow.error;
  if (reportRow.error) throw reportRow.error;

  db.call = {
    answers: Object.fromEntries(
      (discoveryAnswersRow.data ?? []).map((row) => [row.question_id as string, row.answer as string]),
    ),
    goals: (discoverySessionRow.data?.goals as Record<string, boolean> | null) ?? {},
    systems: (discoverySessionRow.data?.systems as Record<string, boolean> | null) ?? {},
    canvasUploaded: (discoverySessionRow.data?.canvas_uploaded as boolean | null) ?? false,
    completedAt: (discoverySessionRow.data?.completed_at as string | null) ?? undefined,
    clarificationQuestions: (discoverySessionRow.data?.clarification_questions as Db["call"]["clarificationQuestions"] | null) ?? [],
    clarificationAnswers: (discoverySessionRow.data?.clarification_answers as Record<string, string> | null) ?? {},
    clarificationCompletedAt: (discoverySessionRow.data?.clarification_completed_at as string | null) ?? undefined,
  };

  if (reportRow.data?.report) {
    const report = reportRow.data.report as CompanyReport;
    db.report = {
      ...report,
      version: reportRow.data.version as number,
      status: reportRow.data.status as CompanyReport["status"],
      approvedBy: (reportRow.data.approved_by as string | null) ?? report.approvedBy,
      approvedAt: (reportRow.data.approved_at as string | null) ?? report.approvedAt,
    };
    db.phase = db.report.status === "approved" ? "report_approved" : "report_draft";
  }

  return "live";
}
