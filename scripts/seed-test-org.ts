/**
 * One-off dev seed script. NOT part of the app — nothing imports this file,
 * and it does not import from app/api/plan/* or lib/server/orchestrator.ts.
 * Run with:
 *   npx dotenv -e .env.local -- npx tsx scripts/seed-test-org.ts
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment."
  );
}

// Plain PostgREST calls rather than @supabase/supabase-js: the SDK's
// createClient() unconditionally spins up a realtime client that requires a
// native WebSocket global, which this Node version doesn't have. We only
// need simple inserts, so raw REST avoids that dependency entirely.
const REST_URL = `${url.replace(/\/$/, "")}/rest/v1`;

async function insertRow<T = Record<string, unknown>>(
  table: string,
  row: Record<string, unknown>
): Promise<T> {
  const res = await fetch(`${REST_URL}/${table}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey!,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Insert into ${table} failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as T[];
  return data[0];
}

const now = new Date().toISOString();

const HANDOFF_PAYLOAD = {
  "handoff_type": "discovery_findings",
  "generated_at": "2026-07-30",
  "raw_inputs": {
    "company_name": "BrightPath Home Services",
    "onboarding": {
      "intro": "We run BrightPath Home Services in Singapore, eighteen of us doing residential maintenance, around 650 customer requests a month. Too much of our day goes into sorting Gmail and WhatsApp messages by hand and rescheduling appointments over the phone. Marketing keeps waiting on me, and every Friday the finance team combs through overdue invoices manually.",
      "organization_shape": "multi_role_team",
      "employee_count": "18",
      "workflow_builder": "invite",
      "builder_access": "workflows_only",
      "automation_scope": "focus_area",
      "business_area": "Operations",
      "repetitive_task": "Rescheduling customer appointments over the phone",
      "current_workflow": "Messages come in through Gmail and WhatsApp, the coordinator checks the calendar manually, then calls customers one by one to shift appointments and update the spreadsheet.",
      "selected_tools": ["gmail", "google-calendar", "hubspot", "whatsapp-business", "quickbooks", "google-drive", "slack"],
      "custom_tools": [],
      "employee_emails": ["marcus@brightpath.sg", "jolene@brightpath.sg"],
      "approval_owner": "Sarah Tan"
    },
    "interview": {
      "answered_count": 6,
      "completed": true,
      "answers": {
        "workflow_trigger": "This usually starts when a customer request comes in for this workflow, either by email, phone, or WhatsApp.",
        "workflow_steps": "First we receive the request, then we review the details, update the right tools, confirm the next action, and close the loop manually. The owner checks requests manually, updates tools, and follows up one by one.",
        "handoffs": "First we receive the request, then we review the details, update the right tools, confirm the next action, and close the loop manually. The owner checks requests manually, updates tools, and follows up one by one.",
        "workflow_data_inputs": "We usually need the customer details, timing information, any previous notes, and the latest status from the tools involved.",
        "human_decisions": "Refunds above a limit, Final price approval, should still stay with a person.",
        "workflow_success": "A good outcome would be faster turnaround, fewer manual updates, and a clearer handoff so this workflow does not depend on constant follow-up."
      },
      "fact_ids": []
    },
    "report_meta": { "version": 1, "status": "draft", "stale": false }
  },
  "structured_findings": {
    "business_context": {
      "company_name": "BrightPath Home Services",
      "company_intro": "We run BrightPath Home Services in Singapore, eighteen of us doing residential maintenance, around 650 customer requests a month.",
      "organization_shape": "multi_role_team",
      "organization_label": "Multi-role team",
      "employee_count": "18",
      "setup_ownership": "invite_builder",
      "automation_scope": "focus_area",
      "focus_area": "Operations"
    },
    "workflow_summary": {
      "workflow_name": "Rescheduling customer appointments over the phone",
      "current_workflow_summary": "Messages come in through Gmail and WhatsApp, the coordinator checks the calendar manually, then calls customers one by one to shift appointments and update the spreadsheet.",
      "trigger": "This usually starts when a customer request comes in for this workflow, either by email, phone, or WhatsApp.",
      "inputs": ["We usually need the customer details, timing information, any previous notes, and the latest status from the tools involved."],
      "outputs": ["A good outcome would be faster turnaround, fewer manual updates, and a clearer handoff so this workflow does not depend on constant follow-up."],
      "handoffs": ["First we receive the request, then we review the details, update the right tools, confirm the next action, and close the loop manually."],
      "tools": ["gmail", "google-calendar", "hubspot", "whatsapp-business", "quickbooks", "google-drive", "slack"],
      "approval_owner": "Sarah Tan",
      "human_only_decisions": ["Refunds above a limit, Final price approval, should still stay with a person."],
      "success_outcomes": ["A good outcome would be faster turnaround, fewer manual updates, and a clearer handoff so this workflow does not depend on constant follow-up."]
    },
    "missing_information": [],
    "assumptions": [],
    "confidence": 0.95
  },
  "workflow": {
    "name": "Rescheduling customer appointments over the phone",
    "focus_area": "Operations",
    "trigger": "This usually starts when a customer request comes in for this workflow, either by email, phone, or WhatsApp.",
    "ordered_steps": ["First we receive the request", "we review the details, update the right tools, confirm the next action, and close the loop manually", "The owner checks requests manually, updates tools, and follows up one by one.", "Messages come in through Gmail and WhatsApp, the coordinator checks the calendar manually", "calls customers one by one to shift appointments and update the spreadsheet."],
    "handoffs": ["First we receive the request, then we review the details, update the right tools, confirm the next action, and close the loop manually."],
    "tools_involved": ["gmail", "google-calendar", "hubspot", "whatsapp-business", "quickbooks", "google-drive", "slack"],
    "inputs": ["We usually need the customer details, timing information, any previous notes, and the latest status from the tools involved."],
    "outputs": ["A good outcome would be faster turnaround, fewer manual updates, and a clearer handoff so this workflow does not depend on constant follow-up."],
    "approval_points": ["Refunds above a limit, Final price approval, should still stay with a person."],
    "failure_points": [],
    "escalation_path": ["Sarah Tan"],
    "frequency": null
  }
};

const COMPANY_REPORT = {
  version: 1,
  status: "approved",
  approvedBy: "seed-script",
  approvedAt: now,
  exec:
    "BrightPath Home Services is an 18-person residential maintenance business in Singapore handling roughly 650 customer requests a month. Day-to-day operations are bottlenecked by manual triage of Gmail and WhatsApp messages and phone-based appointment rescheduling, with knock-on delays for marketing content approval and weekly manual review of overdue invoices in finance.",
  facts: [
    { k: "Industry", v: "Residential maintenance and home services" },
    { k: "Location", v: "Singapore" },
    { k: "Team size", v: "18" },
    { k: "Monthly volume", v: "~650 customer requests" },
  ],
  canvas: [
    { label: "Problem", body: "Manual message triage and phone-based rescheduling consume most of the coordinator's day.", dot: "ember" },
    { label: "Solution", body: "Automate reschedule intake and calendar updates while keeping refunds and pricing approvals with a person.", dot: "forest" },
    { label: "Channels", body: "Gmail, WhatsApp Business, phone.", dot: "ochre" },
  ],
  processes: [
    {
      name: "Appointment rescheduling",
      trigger: "Customer requests a reschedule via email, phone, or WhatsApp",
      systems: "Gmail, WhatsApp Business, Google Calendar, HubSpot",
      freq: "Daily",
      owner: "Sarah Tan",
    },
  ],
  systems: [
    { name: "Gmail", use: "Customer request intake", status: "Connected" },
    { name: "Google Calendar", use: "Appointment scheduling", status: "Connected" },
    { name: "HubSpot", use: "Customer records", status: "Ready to connect" },
    { name: "WhatsApp Business", use: "Customer messaging", status: "Connected" },
    { name: "QuickBooks", use: "Invoicing", status: "Needs auth" },
    { name: "Google Drive", use: "Document storage", status: "Connected" },
    { name: "Slack", use: "Internal coordination", status: "Connected" },
  ],
  pain: [
    { t: "Manual message triage", detail: "Requests arrive across Gmail and WhatsApp and are sorted by hand." },
    { t: "Phone-based rescheduling", detail: "The coordinator calls customers one by one to shift appointments and update the spreadsheet." },
    { t: "Manual invoice review", detail: "Finance combs through overdue invoices manually every Friday." },
  ],
  useCases: [
    {
      name: "Automated appointment rescheduling",
      trigger: "Customer reschedule request",
      freq: "Daily",
      risk: "Medium",
    },
  ],
  constraints: [
    "Refunds above a limit require human approval",
    "Final price approval must stay with a person",
  ],
  history: [{ v: "1", t: now }],
};

async function main() {
  const org = await insertRow<{ id: string }>("organizations", {
    external_key: "seed:brightpath-home-services",
    name: "BrightPath Home Services",
    approval_owner: "Sarah Tan",
    shape: "multi_role_team",
    employee_count: 18,
  });

  const session = await insertRow<{ id: string }>("onboarding_sessions", {
    external_id: "seed:brightpath-onboarding-session",
    organization_id: org.id,
    preferred_channel: "typed",
    status: "handed_off",
    current_step: "review",
    progress: 100,
    consent_accepted: true,
    transcript_review_required: false,
    schema_version: "1.0",
    blueprint_version: 1,
    created_at: now,
    updated_at: now,
    completed_at: now,
  });

  await insertRow("role_b_handoffs", {
    external_id: "seed:brightpath-handoff",
    session_id: session.id,
    blueprint_version: 1,
    idempotency_key: "seed:brightpath:v1",
    occurred_at: now,
    status: "ready",
    payload: HANDOFF_PAYLOAD,
    created_at: now,
  });

  const report = await insertRow<{ id: string }>("company_reports", {
    session_id: session.id,
    version: 1,
    status: "approved",
    approved_by: "seed-script",
    approved_at: now,
    report: COMPANY_REPORT,
    created_at: now,
    updated_at: now,
  });

  console.log(
    JSON.stringify(
      {
        organizationId: org.id,
        sessionId: session.id,
        companyReportId: report.id,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
