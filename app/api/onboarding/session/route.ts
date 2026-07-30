import { NextResponse, type NextRequest } from "next/server";
import { withDb } from "@/lib/server/store";
import { mutate } from "@/lib/server/api";
import type { DepartmentApproval } from "@/lib/contracts";
import { hydrateOnboardingFromSupabase, mirrorOnboardingToSupabase } from "@/lib/server/onboarding-supabase";
import { getOnboardingState, updateOnboardingSession } from "@/lib/server/onboarding";

export const dynamic = "force-dynamic";

export async function GET() {
  const payload = await withDb(async (db) => {
    await hydrateOnboardingFromSupabase(db);
    return getOnboardingState(db);
  });
  return NextResponse.json(payload);
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    preferredChannel?: "typed" | "voice";
  };
  return mutate((db) => {
    updateOnboardingSession(db, { preferredChannel: body.preferredChannel ?? "typed" });
    return mirrorOnboardingToSupabase(db).then(() => {});
  });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json()) as {
    preferredChannel?: "typed" | "voice";
    currentStep?: "welcome" | "intro" | "focus" | "tools" | "review";
    mode?: string;
    intro?: string;
    organizationShape?: "solo" | "owner_with_team" | "multi_role_team" | "manager_led";
    workflowBuilder?: "self" | "invite";
    builderAccess?: "workflows_only" | "account_manager" | null;
    automationScope?: "start_small" | "focus_area" | "whole_business";
    businessArea?: string;
    repetitiveTask?: string;
    currentWorkflow?: string;
    approvalPreference?: "owner_all" | "department_leads" | "mixed" | "recommend";
    onboardingOwnership?: "owner_only" | "invite_contributors";
    employeeCount?: number | null;
    approvalOwner?: string;
    employeeEmails?: string[];
    departmentApprovals?: DepartmentApproval[];
    selectedToolIds?: string[];
    consentAccepted?: boolean;
  };
  return mutate((db) => {
    updateOnboardingSession(db, body);
    return mirrorOnboardingToSupabase(db).then(() => {});
  });
}
