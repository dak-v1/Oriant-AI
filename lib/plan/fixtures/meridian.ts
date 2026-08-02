/**
 * lib/plan/fixtures/meridian.ts — the workforce this account can actually run.
 *
 * WHY A SECOND PLAN FIXTURE EXISTS AT ALL.
 *
 * brightpath.ts is the reference plan and stays exactly as it is: it was chosen
 * for POLICY-PATH coverage, and its four agents reach every branch of contract
 * §3.10 between them. What it cannot do is run. Three of its four agents depend
 * on HubSpot and QuickBooks operations that lib/runtime/tools/capabilities.ts
 * records as unroutable — Composio's HubSpot toolkit publishes 304 tools with
 * quotes, line items and products and not one invoice, note, payment or refund;
 * its QuickBooks toolkit publishes 13 and covers none of them either. Those are
 * checked facts, read off the catalogue with full pagination, not assumptions.
 * Meanwhile this account holds live ACTIVE Composio connections for exactly
 * three toolkits: gmail, googlecalendar, googledrive.
 *
 * So the demo plan is unrunnable live for a reason nobody can fix from inside
 * this repository, and the owner of the product cannot watch their own work
 * happen. This fixture closes that gap: a workforce whose ENTIRE tool surface is
 * Gmail and Google Calendar, so every capability it grants resolves to a
 * published Composio tool and every act it proposes could really be performed.
 *
 * WHAT IT REJECTED.
 *
 *   - google-drive, even though this account has it connected. The registry has
 *     one Drive operation (`google-drive.files.read`), the clinic below keeps
 *     nothing in Drive that a scheduling agent would read, and a grant nobody's
 *     workflow uses is a permission with no purpose. Two integrations that are
 *     load-bearing beat three where one is decoration.
 *   - `google-calendar.events.update`. It maps to a real Composio tool, so it
 *     was available — and it is the operation that MOVES an appointment a
 *     patient already agreed to. Neither agent here is the right thing to hold
 *     it, so it is denied org-wide instead, and the two agents deny it again for
 *     themselves. Defence in depth against the day somebody relaxes a mode.
 *   - Inventing operations. Nothing below is free-typed; every id comes from
 *     lib/plan/operations.ts, which is the same registry both lanes import.
 *   - A realistic uuid for `organizationId`. Same reasoning as
 *     BRIGHTPATH_DEMO_ORGANIZATION_ID, and it matters more here precisely
 *     because this plan CAN execute: a value that looks live is one somebody
 *     will eventually copy, and the runtime resolves credentials from it.
 *
 * TWO ARTEFACTS, AND THE DIFFERENCE BETWEEN THEM IS THE POINT.
 *
 *   MERIDIAN_PLAN     the plan as the owner configured it — real operating
 *                     modes, real limits, real schedules. This is what the
 *                     product is for.
 *   MERIDIAN_HANDOFF  the same workforce as Role B sends it TODAY, at the
 *                     approval before the policy was wired. `ingestHandoff`
 *                     converts it into a draft_only plan with manual triggers
 *                     and whole-tool grants, records every assumption as a gap,
 *                     and that converted plan is what `runPipeline` carries to a
 *                     live deployment.
 *
 * They are the same planId at versions 1 and 2 because that is what they are:
 * one plan, approved twice. Keeping them as one story is what lets the runtime
 * show drift between what is running and what is intended, instead of two
 * unrelated fixtures that can never be compared.
 *
 * Company: Meridian Physiotherapy, Singapore. Two clinics (Novena and Bedok),
 * six physiotherapists, roughly 140 appointments a week. Bookings arrive by
 * email; each physiotherapist keeps a Google Calendar. There is no CRM and no
 * accounting integration, which is not a gap in the fixture — it is why a
 * gmail-and-calendar workforce is the honest shape for this business.
 */

import type {
  AgentSpec,
  ApprovedPlan,
  BusinessOutcome,
  QuietHours,
} from "../types";
import type { WorkforceHandoffPayload } from "../ingest/types";

/**
 * The two people approvals land with. Both resolve in lib/plan/users.ts, which
 * is what validator rule 8 requires — an approval addressed to a name nobody can
 * look up waits forever in an inbox that does not exist.
 */
const FRONT_DESK_OWNER = "user_priya_nair";
const CLINIC_OWNER = "user_sarah_chen";

/**
 * The organization this fixture belongs to.
 *
 * Deliberately not a uuid, and the constant says demo in its own name, for the
 * reason brightpath.ts gives at length: `organizationId` is what decides whose
 * Composio connections an agent sends through, so a value that reads like a real
 * organization is one somebody will paste into a live deployment. This plan is
 * the one in the repository that could actually execute, which makes the risk
 * concrete rather than theoretical.
 */
export const MERIDIAN_DEMO_ORGANIZATION_ID = "org-meridian-demo-fixture";

/** Shared context, so both prompts describe one clinic rather than two. */
const CLINIC_CONTEXT =
  "Meridian Physiotherapy, Singapore. Two clinics — Novena and Bedok — six " +
  "physiotherapists, roughly 140 appointments a week. Most patients are on a " +
  "course of treatment rather than a one-off visit, so a missed appointment " +
  "costs the slot and delays the recovery. Bookings and rescheduling all " +
  "arrive by email; each physiotherapist keeps their own Google Calendar.";

/**
 * Nobody is emailed outside clinic hours. Saturday runs at 08:00 and the
 * reminder run at 17:00 both sit inside this window, which is the point: a
 * window that excluded the workflows the plan schedules would be a policy the
 * plan quietly contradicts.
 */
const CLINIC_HOURS: QuietHours = {
  start: "19:00",
  end: "08:00",
  timezone: "Asia/Singapore",
};

/* ═══════════════════════════ Front Desk ═══════════════════════════ */

const frontDesk: AgentSpec = {
  id: "front-desk",
  version: 2,
  name: "Front Desk Agent",
  role: "Turns emailed appointment requests into held slots and drafted replies",

  guidance: {
    objective:
      "Answer every appointment request the same day and turn the " +
      "straightforward ones into a held slot without anyone opening six " +
      "calendars to find it. Keep each physiotherapist's day in one clinic " +
      "where you can: an unnecessary cross-town hop costs a whole slot.",
    businessContext: CLINIC_CONTEXT,
    tone:
      "Warm and specific. Name the physiotherapist and the exact time rather " +
      "than promising 'someone will be in touch', and never predict a clinical " +
      "outcome or a number of sessions.",
    examples: [
      "A returning patient asks for their next two sessions with the same " +
        "physiotherapist, flexible on the day. Two matching slots are free at " +
        "Novena on Tuesday and Thursday morning — hold both and draft the " +
        "confirmation.",
      "A new patient asks whether their insurer is accepted and what a first " +
        "session costs. Nothing in the diary answers that, so draft a reply " +
        "that asks for the insurer's name and hold no slot.",
    ],
  },

  capabilities: [
    {
      id: "read_enquiries",
      name: "Read appointment requests",
      description:
        "Read the request threads in the shared clinic inbox and the messages inside them.",
      backedBy: ["gmail.threads.read", "gmail.messages.read"],
    },
    {
      id: "read_the_diary",
      name: "Read the diary",
      description:
        "Read each physiotherapist's booked appointments, working hours and free slots.",
      backedBy: [
        "google-calendar.events.list",
        "google-calendar.availability.read",
      ],
    },
    {
      id: "hold_a_slot",
      name: "Hold a slot",
      description:
        "Place a provisional appointment in a physiotherapist's calendar.",
      backedBy: ["google-calendar.events.create"],
    },
    {
      id: "draft_a_reply",
      name: "Draft a reply",
      description:
        "Compose the reply to a request on its own thread, unsent.",
      backedBy: ["gmail.drafts.create"],
    },
  ],

  tools: [
    {
      integrationId: "gmail",
      operations: [
        "gmail.threads.read",
        "gmail.messages.read",
        "gmail.drafts.create",
      ],
      purpose:
        "Read appointment requests in the shared inbox and prepare replies on their own threads",
      required: true,
    },
    {
      integrationId: "google-calendar",
      operations: [
        "google-calendar.events.list",
        "google-calendar.availability.read",
        "google-calendar.events.create",
      ],
      purpose: "See what each physiotherapist has free and hold the matched slot",
      required: true,
    },
  ],

  policy: {
    /*
     * The one agent here that acts unattended, which is what makes the limits
     * below load-bearing rather than documentation: under any other mode
     * `resolveAct` returns before it ever reads them, and a stress sweep would
     * have no boundary to walk.
     */
    operatingMode: "auto_within_limits",
    limits: [
      {
        // A morning's worth of requests is five to ten. Nine holds in one run
        // means the agent has misread something, so the batch stops and asks.
        id: "holds-per-run",
        metric: "bookings.per_run",
        op: "<=",
        value: 8,
        unit: "count",
        onBreach: "require_approval",
      },
      {
        // Drafts are cheap and unsent, so this ceiling is wider — it exists to
        // catch a loop, not to ration replies.
        id: "replies-per-run",
        metric: "replies.per_run",
        op: "<=",
        value: 20,
        unit: "count",
        onBreach: "require_approval",
      },
      {
        // A `>=` floor on purpose. Every other limit here is a ceiling, and a
        // sweep that only ever walked ceilings would never catch a comparison
        // implemented in the wrong direction.
        id: "booking-notice",
        metric: "booking.notice_hours",
        op: ">=",
        value: 12,
        unit: "hours",
        onBreach: "require_approval",
      },
    ],
    /*
     * EMPTY, AND THAT IS THE DECISION. `alwaysApprove` wins over the operating
     * mode, so listing either of this agent's two writes here would make all
     * three limits above unreachable — the agent would pause at every act
     * whatever the numbers said, the boundary would never be crossed, and the
     * limits would be prose pretending to be enforcement. Holding a provisional
     * slot and saving an unsent draft are both reversible in one click, which is
     * what earns them the unattended path; the irreversible operation
     * (`events.update`) is denied outright below instead.
     */
    alwaysApprove: [],
    /*
     * Never granted above, denied here anyway. Moving an appointment a patient
     * already agreed to is the operation that makes somebody miss work, and a
     * hard deny is the only form of "no" that survives a later edit widening the
     * grants. Rule 3 is satisfied because nothing in `tools` overlaps it.
     */
    forbidden: ["google-calendar.events.update"],
    approvalOwner: FRONT_DESK_OWNER,
    // Ninety minutes: a request that stalls past lunch is one the patient books
    // somewhere else.
    escalateAfterMins: 90,
    quietHours: CLINIC_HOURS,
    maxRunsPerDay: 40,
  },

  workflows: [
    {
      id: "morning-diary-sweep",
      name: "Morning Diary Sweep",
      description:
        "Before the clinic opens, turn every overnight appointment request into a held slot.",
      enabled: true,
      trigger: {
        kind: "schedule",
        label: "Every morning the clinic opens, at 8:00am",
        // Monday to Saturday: Bedok runs a Saturday morning list.
        cron: "0 8 * * 1-6",
        timezone: "Asia/Singapore",
      },
      steps: [
        {
          id: "sweep-1",
          kind: "fetch",
          instruction:
            "Read the request threads that arrived since yesterday's sweep and keep the ones asking for an appointment.",
          tool: { integrationId: "gmail", operation: "gmail.threads.read" },
        },
        {
          id: "sweep-2",
          kind: "fetch",
          instruction:
            "Read each physiotherapist's working hours, blocked days and free slots for the next ten working days.",
          tool: {
            integrationId: "google-calendar",
            operation: "google-calendar.availability.read",
          },
        },
        {
          id: "sweep-3",
          kind: "reason",
          instruction:
            "Match each request to a physiotherapist and a free slot. Keep a returning patient with the physiotherapist who has been treating them, keep each person's day in one clinic, and leave anything that reads like a new injury unscheduled with a reason.",
        },
        {
          id: "sweep-4",
          kind: "act",
          instruction:
            "Hold the matched slot as a provisional appointment carrying the patient's name, the clinic and the reason for the visit.",
          tool: {
            integrationId: "google-calendar",
            operation: "google-calendar.events.create",
          },
          risk: "medium",
        },
      ],
      output: {
        kind: "booking",
        successCriteria:
          "Every schedulable request has exactly one provisional appointment with a named physiotherapist, a clinic and a duration; no physiotherapist is double-booked; and anything left unscheduled carries a reason a receptionist can act on.",
      },
      onFailure: { retries: 2, backoffSeconds: 120, onExhausted: "notify_owner" },
    },
    {
      /*
       * THE SECOND ENABLED WORKFLOW ON THIS AGENT, and it is not decoration.
       * A daily sweep and a per-message reply are genuinely different jobs on
       * different triggers, and they route through different tools — the sweep
       * writes to the calendar, this one writes to Gmail. Anything that proves
       * an agent by looking at one workflow leaves the other's act step
       * unproven while reporting the agent green.
       */
      id: "enquiry-reply-drafting",
      name: "Enquiry Reply Drafting",
      description:
        "When a request lands in the shared inbox, prepare the reply with the diary already checked.",
      enabled: true,
      trigger: {
        kind: "event",
        label: "When a request arrives in the shared clinic inbox",
        integrationId: "gmail",
        event: "message.received",
        filter: { label: "appointments", isReply: false },
      },
      steps: [
        {
          id: "reply-1",
          kind: "fetch",
          instruction:
            "Read the incoming message and everything earlier on the same thread.",
          tool: { integrationId: "gmail", operation: "gmail.messages.read" },
        },
        {
          id: "reply-2",
          kind: "fetch",
          instruction:
            "Read what is already booked for the days the patient mentioned, so the reply offers times that exist.",
          tool: {
            integrationId: "google-calendar",
            operation: "google-calendar.events.list",
          },
        },
        {
          id: "reply-3",
          kind: "reason",
          instruction:
            "Draft a reply that answers the question actually asked and offers at most three real times. Ask for the one detail reception would otherwise chase — insurer, referral or which clinic — and never quote a course length.",
        },
        {
          id: "reply-4",
          kind: "act",
          instruction:
            "Save the reply as a draft on the original thread so reception can send it as it stands.",
          tool: { integrationId: "gmail", operation: "gmail.drafts.create" },
          risk: "low",
        },
      ],
      output: {
        kind: "draft",
        successCriteria:
          "Each request has one draft reply on its own thread, every time offered is genuinely free in the named physiotherapist's calendar, and nothing was sent.",
      },
      onFailure: { retries: 3, backoffSeconds: 60, onExhausted: "escalate" },
    },
  ],
};

/* ═══════════════════════ Appointment Reminders ═══════════════════════ */

const visitReminders: AgentSpec = {
  id: "visit-reminders",
  version: 2,
  name: "Appointment Reminder Agent",
  role: "Reminds patients of tomorrow's appointment, and never books one",

  guidance: {
    objective:
      "Cut missed appointments by reminding every patient the evening before, " +
      "in a message that names their physiotherapist, the clinic and the time, " +
      "and makes cancelling easy rather than embarrassing.",
    businessContext: CLINIC_CONTEXT,
    tone:
      "Short and human. One paragraph, no marketing, and an explicit line " +
      "saying that replying to move the appointment is fine.",
    examples: [
      "Tomorrow's 9:30am with Wei Ling at Novena, third session of a course. " +
        "Remind, and mention it is the third of six so the patient knows where " +
        "they are.",
      "Tomorrow's 4:00pm was booked this morning and the thread already " +
        "confirms it. Remind anyway — a confirmation is not a reminder.",
    ],
  },

  capabilities: [
    {
      id: "read_tomorrows_diary",
      name: "Read tomorrow's diary",
      description:
        "Read every appointment booked for the following day across both clinics.",
      backedBy: ["google-calendar.events.list"],
    },
    {
      id: "read_the_thread",
      name: "Read the booking thread",
      description:
        "Find the thread the appointment was booked on, so the reminder is a reply rather than a cold email.",
      backedBy: ["gmail.threads.read"],
    },
    {
      id: "send_the_reminder",
      name: "Send the reminder",
      description: "Send the reminder to the patient, once the owner approves it.",
      backedBy: ["gmail.messages.send"],
    },
    {
      id: "draft_a_followup",
      name: "Draft a follow-up",
      description:
        "Prepare an unsent follow-up for a patient who did not arrive.",
      backedBy: ["gmail.drafts.create"],
    },
  ],

  tools: [
    {
      integrationId: "google-calendar",
      // READ ONLY, deliberately. This agent exists to describe the diary, not
      // to change it, and the narrowest grant that does the job is the one that
      // cannot be widened by a prompt.
      operations: ["google-calendar.events.list"],
      purpose: "Read tomorrow's appointments across both clinics",
      required: true,
    },
    {
      integrationId: "gmail",
      operations: [
        "gmail.threads.read",
        "gmail.messages.send",
        "gmail.drafts.create",
      ],
      purpose:
        "Find the booking thread and send the reminder on it, or draft a follow-up",
      required: true,
    },
  ],

  policy: {
    /*
     * This agent is the only thing here that emails a patient directly, so it
     * never acts on its own: every reminder batch is shown to the owner before
     * it goes. That is a different guarantee from draft_only — the agent DOES
     * send, once somebody says so, and the approval interrupt is the whole
     * mechanism.
     */
    operatingMode: "act_after_approval",
    /*
     * EMPTY, and validator rule 2 only requires limits under
     * `auto_within_limits`. `resolveAct` returns at the mode check before it
     * ever reaches `evaluateLimits` here, so a limit written on this agent would
     * be a number nothing consults — worse than absent, because a reader would
     * believe it was enforced.
     */
    limits: [],
    // Redundant under this mode and kept anyway: it is the line that still holds
    // if somebody moves this agent to `auto_within_limits` without re-reading
    // what it can do.
    alwaysApprove: ["gmail.messages.send"],
    // Neither is granted above. A reminder agent that could write to the diary
    // is a booking agent nobody reviewed.
    forbidden: ["google-calendar.events.create", "google-calendar.events.update"],
    approvalOwner: CLINIC_OWNER,
    // An hour: a reminder batch approved after the patients have gone to bed is
    // a batch that should not be sent at all.
    escalateAfterMins: 60,
    quietHours: CLINIC_HOURS,
    maxRunsPerDay: 2,
  },

  workflows: [
    {
      id: "evening-reminder-run",
      name: "Evening Reminder Run",
      description:
        "Every evening the clinic is open, prepare tomorrow's reminders and wait for the owner.",
      enabled: true,
      trigger: {
        kind: "schedule",
        label: "Every evening the clinic is open, at 5:00pm",
        cron: "0 17 * * 1-6",
        timezone: "Asia/Singapore",
      },
      steps: [
        {
          id: "rem-1",
          kind: "fetch",
          instruction:
            "Read every appointment booked for tomorrow across both clinics, with the physiotherapist and the time.",
          tool: {
            integrationId: "google-calendar",
            operation: "google-calendar.events.list",
          },
        },
        {
          id: "rem-2",
          kind: "fetch",
          instruction:
            "Find the thread each appointment was booked on so the reminder continues that conversation.",
          tool: { integrationId: "gmail", operation: "gmail.threads.read" },
        },
        {
          id: "rem-3",
          kind: "reason",
          instruction:
            "Write one reminder per appointment naming the physiotherapist, clinic and time, and say plainly that replying to move it is fine. Skip anyone already reminded today.",
        },
        {
          id: "rem-4",
          kind: "act",
          instruction:
            "Send the reminders on their existing threads, one message per patient.",
          tool: { integrationId: "gmail", operation: "gmail.messages.send" },
          risk: "medium",
        },
      ],
      output: {
        kind: "message",
        successCriteria:
          "Every patient with an appointment tomorrow has exactly one reminder on their own booking thread naming the physiotherapist, clinic and time, and nobody was reminded twice.",
      },
      onFailure: { retries: 2, backoffSeconds: 60, onExhausted: "escalate" },
    },
    {
      /*
       * DISABLED, and left in the plan rather than deleted. The clinic has not
       * agreed the wording for chasing somebody who did not turn up, and a
       * workflow that exists and is switched off is the honest way to record
       * that: it registers no trigger, generates no scenario, and is one edit
       * from being the thing that runs — which is why rule 0 still checks its
       * shape and the Factory still compiles its steps.
       */
      id: "missed-appointment-followup",
      name: "Missed Appointment Follow-up",
      description:
        "When yesterday leaves no-shows behind, prepare a follow-up for each one.",
      enabled: false,
      trigger: {
        kind: "threshold",
        label: "When at least one appointment was missed yesterday",
        metric: "appointment.no_shows_yesterday",
        op: ">=",
        value: 1,
      },
      steps: [
        {
          id: "miss-1",
          kind: "fetch",
          instruction:
            "Read yesterday's appointments and pick out the ones marked as not attended.",
          tool: {
            integrationId: "google-calendar",
            operation: "google-calendar.events.list",
          },
        },
        {
          id: "miss-2",
          kind: "reason",
          instruction:
            "Write a short follow-up that offers the next two free times and does not ask why they missed it.",
        },
        {
          id: "miss-3",
          kind: "act",
          instruction:
            "Save the follow-up as a draft on the patient's booking thread.",
          tool: { integrationId: "gmail", operation: "gmail.drafts.create" },
          risk: "low",
        },
      ],
      output: {
        kind: "draft",
        successCriteria:
          "Each missed appointment has one unsent follow-up draft offering two real alternative times.",
      },
      onFailure: { retries: 1, backoffSeconds: 30, onExhausted: "notify_owner" },
    },
  ],
};

/* ═══════════════════════════ Outcomes ═══════════════════════════ */

/**
 * Outcomes own the relationship to agents (contract §3.2), and between the two
 * below both agents are claimed — which is what keeps rules 13, 15 and 16
 * quiet. Every baseline is a number the clinic could read off its own diary;
 * `null` was available and not used, because an outcome with nothing to compare
 * against renders as a goal that has never moved.
 */
const businessOutcomes: BusinessOutcome[] = [
  {
    id: "outcome-same-day-answers",
    name: "Every appointment request answered the same day",
    priority: "high",
    owner: CLINIC_OWNER,
    metrics: [
      {
        id: "first-response-hours",
        label: "Time to first reply on a request",
        metric: "enquiry.first_response_hours",
        direction: "decrease",
        baseline: 26,
        target: 4,
        unit: "hours",
      },
      {
        id: "slots-filled",
        label: "Bookable slots actually filled",
        metric: "diary.slots_filled_pct",
        direction: "increase",
        baseline: 71,
        target: 88,
        unit: "percent",
      },
    ],
    agentIds: ["front-desk"],
  },
  {
    id: "outcome-fewer-missed-visits",
    name: "Fewer missed appointments",
    priority: "high",
    owner: CLINIC_OWNER,
    metrics: [
      {
        id: "no-show-rate",
        label: "Appointments missed without notice",
        metric: "appointment.no_show_pct",
        direction: "decrease",
        baseline: 14,
        target: 6,
        unit: "percent",
      },
      {
        id: "reminded-pct",
        label: "Patients reminded the day before",
        metric: "appointment.reminded_24h_pct",
        direction: "increase",
        baseline: 30,
        target: 98,
        unit: "percent",
      },
    ],
    agentIds: ["visit-reminders"],
  },
];

/* ═══════════════════════════ The plan ═══════════════════════════ */

export const MERIDIAN_PLAN: ApprovedPlan = {
  planId: "plan-meridian-001",
  organizationId: MERIDIAN_DEMO_ORGANIZATION_ID,
  // Version 2: the second approval, the one where the owner's answers about
  // approval boundaries became `AgentPolicy`. MERIDIAN_HANDOFF below is the
  // first, and the difference between them is visible as drift rather than as
  // two fixtures nobody can relate.
  version: 2,
  approvedAt: "2026-07-22T10:12:00+08:00",
  approvedBy: CLINIC_OWNER,
  reportVersion: 2,
  businessOutcomes,
  agents: [frontDesk, visitReminders],
  globalPolicy: {
    quietHours: CLINIC_HOURS,
    /*
     * Moving a confirmed appointment is denied for the whole organization, not
     * merely withheld from these two agents. Withholding is a fact about today's
     * roster; a deny is a fact about the business, and it is the one that
     * survives the next agent somebody adds.
     */
    forbidden: ["google-calendar.events.update"],
  },
};

/* Individual specs, exported so a check can pin one agent without reaching
   through the plan — the same reason brightpath.ts exports its four. */
export { frontDesk as MERIDIAN_FRONT_DESK, visitReminders as MERIDIAN_VISIT_REMINDERS };

/* ═══════════════════════════ The handoff ═══════════════════════════ */

/**
 * The same workforce as Role B's `GET /api/planner/:id/handoff` sends it.
 *
 * WHY THIS IS NOT JUST `MERIDIAN_PLAN` IN A WRAPPER. `runPipeline` has one
 * entry point and it takes a handoff, because ingest is a stage of the pipeline
 * rather than something a caller does first — so the only way to prove this
 * workforce reaches a live deployment through the real path is to hand the
 * pipeline the shape the seam really carries. `ingestHandoff` then synthesises
 * the plan it always synthesises: every agent `draft_only`, every trigger
 * `manual`, whole-tool grants, one workflow apiece, and a gap recorded for each
 * of those assumptions. That converted plan is what goes live in
 * lib/runtime/verify/gmail-workforce.ts, and MERIDIAN_PLAN is what the same
 * workforce looks like once the policy Role B does not yet carry has been
 * wired — proved through the same build, sandbox and activation gates in the
 * same file.
 *
 * EVERYTHING THAT WOULD BLOCK A BUILD IS DELIBERATELY ABSENT, which is the
 * opposite choice from role-b-handoff.ts. That fixture is kept broken on purpose
 * so the refusals have something to refuse; this one exists to prove the pass
 * completes, and a second broken payload would prove nothing the first does not.
 * So: status "approved", `version` equal to `current_version`, every integration
 * connected, and both approval owners recorded as display names that resolve in
 * lib/plan/users.ts.
 *
 * The two tool keys are gmail and google-calendar and nothing else. That is the
 * whole reason this fixture exists: they are the toolkits this account has live
 * ACTIVE Composio connections for, so every grant ingest derives from them
 * resolves to a real published tool.
 */
export const MERIDIAN_HANDOFF: WorkforceHandoffPayload = {
  handoff_type: "workforce_plan",
  generated_at: "2026-07-20T02:14:51.318Z",
  organization: {
    id: MERIDIAN_DEMO_ORGANIZATION_ID,
    external_key: "seed:meridian-physiotherapy",
    name: "Meridian Physiotherapy",
  },
  workforce_plan: {
    id: "plan-meridian-001",
    version: 1,
    current_version: 1,
    status: "approved",
    approved_at: "2026-07-20T02:14:03.72+00:00",
    // Role B's placeholder while they have no auth system; ingest carries it
    // through rather than inventing an approver.
    approved_by: "pending-auth",
    plan: {
      stale: false,
      agents: [
        {
          name: "Front Desk Agent",
          agentKey: "front_desk",
          reasoning:
            "The clinic's stated pain is that appointment requests sit unanswered overnight. Gmail and Google Calendar are both connected, and between them they cover reading the request and finding the slot, so no other tool is proposed.",
          requiredTools: ["gmail", "google-calendar"],
          templateKeyOrNull: null,
        },
        {
          name: "Appointment Reminder Agent",
          agentKey: "visit_reminders",
          reasoning:
            "Missed appointments were named as the second pain point. Reminders need tomorrow's diary and the thread the booking was made on, which is Google Calendar plus Gmail.",
          requiredTools: ["gmail", "google-calendar"],
          templateKeyOrNull: null,
        },
      ],
    },
  },
  agents: [
    {
      agent_key: "front_desk",
      agent_type: "custom",
      template_id: null,
      status: "configured",
      runtime_model: "zai-org/glm-5.2",
      // Gmail first, and the order is not cosmetic: `stepsFor` in
      // lib/plan/ingest/from-handoff.ts promotes the FIRST write it finds to the
      // agent's single `act` step. Gmail first makes that write
      // `gmail.drafts.create` — the agent prepares a reply and stops, which is
      // the behaviour draft_only claims. Calendar first would have made it
      // `google-calendar.events.create`, so the synthesised workflow would end
      // by proposing a booking it never drafted a reply about.
      required_tools: ["gmail", "google-calendar"],
      config: {
        approvalOwner: "Priya Nair",
        channels: ["gmail"],
        spec: {
          objective:
            "Answer emailed appointment requests the same day and hold a slot where the diary makes it obvious.",
          trigger:
            "A patient emails the shared clinic inbox asking for an appointment or to move one.",
          inputs:
            "The request thread itself, and each physiotherapist's calendar for the next two weeks.",
          rules:
            "Returning patients stay with the physiotherapist treating them. Keep a physiotherapist's day in one clinic. Anything that reads like a new injury goes to a person.",
          tools: "Gmail and Google Calendar.",
          forbidden:
            "Never move an appointment the patient already confirmed, and never quote how many sessions a course will take.",
          success:
            "Every request has a reply prepared and, where the diary allowed it, a slot held.",
          notes: {
            q1: "Requests with no preferred day default to the earliest slot with the patient's own physiotherapist.",
            q2: "Insurance and pricing questions go to reception; the agent asks for the insurer's name and stops.",
            q3: "If no slot fits inside two weeks, say so in the draft rather than holding something unsuitable.",
          },
        },
      },
    },
    {
      agent_key: "visit_reminders",
      agent_type: "custom",
      template_id: null,
      status: "configured",
      runtime_model: "zai-org/glm-5.2",
      required_tools: ["gmail", "google-calendar"],
      config: {
        approvalOwner: "Sarah Chen",
        channels: ["gmail"],
        spec: {
          objective:
            "Remind every patient the evening before their appointment, on the thread it was booked on.",
          trigger: "The evening before any day the clinic is open.",
          inputs:
            "Tomorrow's appointments across both clinics, and the booking thread for each one.",
          rules:
            "One reminder per patient per appointment. Name the physiotherapist, the clinic and the time. Say that replying to move it is fine.",
          tools: "Gmail and Google Calendar.",
          forbidden:
            "Never create, move or cancel anything in the diary, and never chase a payment.",
          success:
            "Every appointment tomorrow has exactly one reminder on its own thread.",
          notes: {
            q1: "A patient who booked the same day still gets a reminder — a confirmation is not a reminder.",
            q2: "If the booking thread cannot be found, prepare a new message rather than skipping the patient.",
          },
        },
      },
    },
  ],
  integrations: [
    {
      tool_key: "gmail",
      provider: "composio",
      status: "connected",
      external_connection_id: "ca_meridian_gmail",
      connected_at: "2026-07-19T09:41:12.004+00:00",
    },
    {
      tool_key: "google-calendar",
      provider: "composio",
      status: "connected",
      external_connection_id: "ca_meridian_gcal",
      connected_at: "2026-07-19T09:43:58.117+00:00",
    },
  ],
};
