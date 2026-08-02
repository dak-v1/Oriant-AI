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
 * two toolkits the owner asked to build on: gmail and googlecalendar.
 *
 * So the demo plan is unrunnable live for a reason nobody can fix from inside
 * this repository, and the owner of the product cannot watch their own work
 * happen. This fixture closes that gap: a workforce whose ENTIRE tool surface is
 * Gmail and Google Calendar, so every capability it grants resolves to a
 * published Composio tool, every act it proposes could really be performed, and
 * the integrations gate demands NOTHING the owner cannot connect. That last
 * clause is the whole point of the roster below — a third integration anywhere
 * in the plan is a gate the owner can never open.
 *
 * THE TWO AGENTS ARE THE TWO THE OWNER ASKED FOR, not two invented for coverage:
 *
 *   helpdesk-agent   Gmail only. When the shared inbox receives a question, it
 *                    drafts the reply and PAUSES; the owner approves; the send
 *                    then happens for real. That decided flow — draft-and-approve
 *                    — is enforced structurally: `gmail.messages.send` sits on
 *                    the agent's alwaysApprove list, which beats the operating
 *                    mode (contract §3.10 step 3), so no later mode edit can
 *                    quietly make the send unattended.
 *   marketing-agent  Gmail AND Google Calendar. Reads the campaign schedule off
 *                    the calendar, composes the ad, and its send pauses for
 *                    approval the same way, behind the same alwaysApprove entry.
 *
 * IT IS ALSO WHAT A FRESH RUNTIME SERVES, WHICH MAKES TWO THINGS OBLIGATIONS OF
 * THIS FILE RATHER THAN CONVENIENCES. `resolveCurrentPlan`
 * (lib/runtime/current-plan.ts) falls back to MERIDIAN_PLAN when nothing has
 * been ingested — it used to fall back to BRIGHTPATH_PLAN, which is how a
 * product whose whole point is watching agents work came to show every visitor
 * a workforce that could not.
 *
 *   - This plan must keep validating clean AND keep every granted operation
 *     routable. GW-1 and GW-2 assert both; PS-1 asserts that this is the plan
 *     the resolver actually hands out. Together they mean a grant that drifted
 *     into an unpublished tool fails as a broken SERVER rather than as a stale
 *     test — which is the only reason those two claims are worth stating in two
 *     places.
 *   - The fallback is LABELLED, never silent. `resolveCurrentPlan` returns
 *     source "fixture" alongside a sentence naming Meridian Physiotherapy, and
 *     a screen that renders these agents without it is telling somebody this
 *     clinic is theirs.
 *
 * `MERIDIAN_DEMO_ORGANIZATION_ID` did not become a realistic id because of that,
 * and the reasoning below holds harder now: this is the plan a clean clone
 * shows, so it is the id somebody eventually copies. It also has a consequence
 * worth knowing before it is discovered at an act step —
 * `resolveToolsOrganization` (lib/runtime/tools/organization.ts) treats anything
 * that is not `BRIGHTPATH_DEMO_ORGANIZATION_ID` as a real business, so with live
 * tools on, this id resolves to a company holding no Composio connections
 * rather than to the `ORIANT_ORGANIZATION_ID` stand-in. Every OPERATION here is
 * routable; whose accounts they route through is still decided one file away.
 *
 * WHAT IT REJECTED.
 *
 *   - google-drive, even though this account has it connected. The registry has
 *     one Drive operation (`google-drive.files.read`), no workflow below reads a
 *     document, and a grant nobody's workflow uses is a permission with no
 *     purpose. Two integrations that are load-bearing beat three where one is
 *     decoration.
 *   - An EVENT trigger for the helpdesk. "When a message arrives" is the shape
 *     the job suggests, and `eventFirings` (lib/runtime/schedule/triggers.ts)
 *     even exists to fire one — but nothing in production calls it: there is no
 *     webhook receiver, so an event trigger would register a subscription that
 *     never fires and the inbox would sit unanswered while every screen showed
 *     an active workflow. Polling every five minutes is therefore the DECIDED
 *     ingress, chosen on the runtime that exists, not a compromise to hide.
 *   - A quiet-hours window for the helpdesk, and a global one. A window would
 *     contradict the five-minute schedule the same plan declares — the trigger
 *     would fire all night into a gate that refuses every start, which is a
 *     policy the plan quietly fights with itself about. The helpdesk answers
 *     around the clock BY DESIGN and its sends still pause for a human; the
 *     marketing agent, whose output lands in customer inboxes, carries its own
 *     window instead.
 *   - Writing to the calendar at all. `google-calendar.events.create` and
 *     `events.update` both map to real Composio tools, so they were available —
 *     and the marketing agent reads the campaign schedule, which makes it one
 *     grant away from being able to move a campaign nobody approved moving.
 *     Neither agent is granted either operation; both deny them again in their
 *     own policies, and `events.update` is denied org-wide. Defence in depth
 *     against the day somebody widens a grant.
 *   - Putting the drafts behind alwaysApprove too. `gmail.drafts.create` is
 *     reversible in one click and it is the act the limits below govern; listing
 *     it alongside the send would make every limit unreachable — the agent would
 *     pause at every act whatever the numbers said, and the limits would be
 *     prose pretending to be enforcement. The send is gated by name; the drafts
 *     are gated by numbers; both gates are real.
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
 * six physiotherapists. Patients' questions — insurance, opening hours, what a
 * first session involves — all arrive by email to one shared inbox, and the
 * clinic's promotions run as email campaigns whose dates live on a shared
 * Google Calendar. There is no CRM and no mailing platform, which is not a gap
 * in the fixture — it is why a gmail-and-calendar workforce is the honest shape
 * for this business.
 */

import type {
  AgentSpec,
  ApprovedPlan,
  BusinessOutcome,
  QuietHours,
} from "../types";
import type { WorkforceHandoffPayload } from "../ingest/types";

/**
 * The three people this plan names. All resolve in lib/plan/users.ts, which is
 * what validator rule 8 requires — an approval addressed to a name nobody can
 * look up waits forever in an inbox that does not exist.
 */
const HELPDESK_OWNER = "user_priya_nair";
const MARKETING_OWNER = "user_dana_lim";
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
  "physiotherapists. Every patient question arrives by email to one shared " +
  "inbox, and the clinic's promotions run as email campaigns whose dates are " +
  "kept on a shared Google Calendar. A question that sits unanswered is a " +
  "patient who books somewhere else; a campaign that misses its date is a slow " +
  "week nobody planned for.";

/**
 * When marketing email may go out. The campaign run at 10:00 sits inside this
 * window, which is the point: a window that excluded the workflow the plan
 * schedules would be a policy the plan quietly contradicts. The HELPDESK
 * carries no window at all — see the header's rejections — so this constant is
 * the marketing agent's alone and deliberately not global.
 */
const MARKETING_HOURS: QuietHours = {
  start: "20:00",
  end: "08:00",
  timezone: "Asia/Singapore",
};

/* ═══════════════════════════ Helpdesk ═══════════════════════════ */

const helpdesk: AgentSpec = {
  id: "helpdesk-agent",
  version: 2,
  name: "Helpdesk Agent",
  role: "Answers the questions in the shared inbox, one approved reply at a time",

  guidance: {
    objective:
      "Answer every question that lands in the shared clinic inbox with a " +
      "reply the owner can approve in one read. Prepare the reply, pause, and " +
      "send only once the owner says so — the pause is the product, not an " +
      "inconvenience.",
    businessContext: CLINIC_CONTEXT,
    tone:
      "Warm and specific. Answer the question actually asked, name real " +
      "opening hours and real prices where the thread contains them, and " +
      "never predict a clinical outcome or a number of sessions.",
    examples: [
      "A patient asks whether their insurer is accepted. The thread names the " +
        "insurer, so draft the factual answer and pause it for approval.",
      "A patient asks something clinical — whether their knee needs surgery. " +
        "Draft a reply that offers an assessment appointment and answers no " +
        "clinical question, and say in the summary why it was routed that way.",
    ],
  },

  capabilities: [
    {
      id: "read_the_inbox",
      name: "Read the inbox",
      description:
        "List the unread question threads in the shared clinic inbox and read the messages inside them.",
      backedBy: ["gmail.threads.read", "gmail.messages.read"],
    },
    {
      id: "send_the_reply",
      name: "Send the reply",
      description:
        "Send the prepared reply on its own thread — only ever after the owner approves it.",
      backedBy: ["gmail.messages.send"],
    },
    {
      id: "draft_a_followup",
      name: "Draft a follow-up",
      description:
        "Prepare an unsent follow-up for a patient who asked, got an answer, and went quiet.",
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
        "gmail.messages.send",
      ],
      purpose:
        "Read the questions in the shared inbox, reply to them once approved, and draft follow-ups",
      required: true,
    },
  ],

  policy: {
    /*
     * Unattended WITH a named exception, and both halves are load-bearing. The
     * mode is what makes the limits below reachable at the one write this
     * agent performs without a person (`gmail.drafts.create`, the follow-up
     * drafts) — under any other mode `resolveAct` returns before it ever reads
     * them, and a stress sweep would have no boundary to walk. The exception
     * is `alwaysApprove` below, which is what keeps the SEND out of the
     * unattended path entirely.
     */
    operatingMode: "auto_within_limits",
    limits: [
      {
        // A five-minute sweep of one clinic inbox should be answering a
        // handful of questions. Thirteen replies prepared in one run means the
        // agent has misread something — a loop, or a thread explosion — so the
        // batch stops and asks.
        id: "replies-per-run",
        metric: "replies.per_run",
        op: "<=",
        value: 12,
        unit: "count",
        onBreach: "require_approval",
      },
      {
        // A `>=` floor on purpose. Every other limit in this plan is a
        // ceiling, and a sweep that only ever walked ceilings would never
        // catch a comparison implemented in the wrong direction. Semantics: a
        // thread nudged less than a day after the last reply is nagging, not
        // following up.
        id: "nudge-idle-floor",
        metric: "nudge.idle_hours",
        op: ">=",
        value: 24,
        unit: "hours",
        onBreach: "require_approval",
      },
    ],
    /*
     * THE DECIDED DRAFT-AND-APPROVE FLOW, as structure. `alwaysApprove` beats
     * the operating mode (contract §3.10 step 3), so every send pauses with
     * the prepared reply frozen into the approval, the owner approves, and the
     * replay performs it for real. Listing ONLY the send here — and not
     * `gmail.drafts.create` — is the deliberate half of the decision: drafts
     * are unsent and reversible, they are what the limits above govern, and
     * putting them here too would make those limits unreachable prose.
     */
    alwaysApprove: ["gmail.messages.send"],
    /*
     * Never granted above, denied here anyway. A helpdesk that can write to
     * the diary is a booking agent nobody reviewed, and a hard deny is the
     * only form of "no" that survives a later edit widening the grants. Rule 3
     * is satisfied because nothing in `tools` overlaps it.
     */
    forbidden: ["google-calendar.events.create", "google-calendar.events.update"],
    approvalOwner: HELPDESK_OWNER,
    // Half an hour: the next sweep is five minutes away, and a reply that sits
    // unapproved past thirty is defeating the point of a helpdesk.
    escalateAfterMins: 30,
    // None, deliberately — see the header. The five-minute schedule IS the
    // clock this agent runs on, and its sends pause for a human whatever the
    // hour says.
    quietHours: null,
    // A tripwire, not a schedule: the 5-minute sweep implies 288 runs a day
    // and the nudge two more. 300 leaves headroom for retries and catches a
    // trigger that has started double-firing.
    maxRunsPerDay: 300,
  },

  workflows: [
    {
      id: "inbox-sweep",
      name: "Inbox Sweep",
      description:
        "Every five minutes, list the unread questions and prepare a reply for each; every send waits for the owner.",
      enabled: true,
      /*
       * POLLING, AS DECIDED. See the header's rejections for the full
       * reasoning: `eventFirings` has zero production callers, so a gmail
       * event trigger would subscribe to nothing and the inbox would rot
       * behind a workflow every screen reported as live. A five-minute cron is
       * the ingress this runtime actually has.
       */
      trigger: {
        kind: "schedule",
        label: "Every 5 minutes, list the unread threads in the shared inbox",
        cron: "*/5 * * * *",
        timezone: "Asia/Singapore",
      },
      steps: [
        {
          id: "sweep-1",
          kind: "fetch",
          instruction:
            "List the unread threads in the shared clinic inbox, most recent first.",
          tool: { integrationId: "gmail", operation: "gmail.threads.read" },
          /*
           * LITERAL, because the scope of this read is a fact about the JOB.
           * "Unread, a page at a time" is what an inbox sweep means, it was
           * known when the plan was approved, and it belongs to whoever
           * approved it rather than to a model re-deriving it every five
           * minutes. Both names are GMAIL_LIST_THREADS's own published
           * parameters (lib/runtime/tools/catalog-recording.ts), so the
           * executor's schema gate passes this verbatim. The alternative — an
           * opening fetch with no declaration — is exactly the unfiltered
           * whole-mailbox read the executor now refuses by design.
           */
          argumentSource: {
            kind: "literal",
            values: { query: "is:unread", max_results: 25 },
          },
        },
        {
          id: "sweep-2",
          kind: "reason",
          instruction:
            "For each unread thread that asks the clinic a question, draft the reply: answer what was actually asked from what the thread contains, route anything clinical to an assessment appointment, and produce the send's arguments in the tool's own vocabulary. Report how many replies this run prepared as replies.per_run.",
        },
        {
          id: "sweep-3",
          kind: "act",
          instruction:
            "Send each prepared reply on its own thread. This always pauses first: the owner sees the exact reply and approves it before anything leaves.",
          tool: { integrationId: "gmail", operation: "gmail.messages.send" },
          risk: "medium",
        },
      ],
      output: {
        kind: "message",
        successCriteria:
          "Every unread question has exactly one prepared reply on its own thread, every reply was shown to the owner before sending, and nothing was sent without an approval.",
      },
      // notify_owner rather than escalate: the next sweep is five minutes
      // away, and escalating every failed poll would page somebody hundreds
      // of times a day about a transient.
      onFailure: { retries: 1, backoffSeconds: 60, onExhausted: "notify_owner" },
    },
    {
      /*
       * THE SECOND ENABLED WORKFLOW ON THIS AGENT, and it is not decoration.
       * A five-minute reply sweep and a twice-daily nudge are different jobs
       * on different schedules, and they end in different writes — the sweep
       * in a gated send, this one in an unsent draft. Anything that proves an
       * agent by looking at one workflow leaves the other's act step unproven
       * while reporting the agent green; the generated stress sweep (GW-3)
       * exists to sweep both, and this workflow is also where the agent's two
       * limits are actually reachable.
       */
      id: "unanswered-nudge",
      name: "Unanswered Nudge",
      description:
        "Twice a day, find the questions that were answered and went quiet, and prepare an unsent follow-up for each.",
      enabled: true,
      trigger: {
        kind: "schedule",
        label: "Twice a day, at 10:00 and 16:00",
        cron: "0 10,16 * * *",
        timezone: "Asia/Singapore",
      },
      steps: [
        {
          id: "nudge-1",
          kind: "fetch",
          instruction:
            "List the read threads that have had no activity for a few days.",
          tool: { integrationId: "gmail", operation: "gmail.threads.read" },
          // Same arm and same reasoning as sweep-1: the staleness window is a
          // fact about the job, stated by the plan, in the tool's own
          // parameter names.
          argumentSource: {
            kind: "literal",
            values: { query: "in:inbox is:read older_than:3d", max_results: 10 },
          },
        },
        {
          id: "nudge-2",
          kind: "reason",
          instruction:
            "Pick the one thread most worth a follow-up — a patient who asked, was answered, and never came back — and produce the arguments to read its full messages, in the tool's own vocabulary. Report how long the thread has been idle as nudge.idle_hours.",
        },
        {
          id: "nudge-3",
          kind: "fetch",
          instruction: "Read every message on the chosen thread.",
          tool: { integrationId: "gmail", operation: "gmail.messages.read" },
          /*
           * REASONING, because these arguments genuinely depend on the run:
           * the thread id was chosen one step ago and cannot be a literal.
           * The executor puts the tool's own schema in front of nudge-2, so
           * the id arrives under the name the tool publishes.
           */
          argumentSource: { kind: "reasoning" },
        },
        {
          id: "nudge-4",
          kind: "reason",
          instruction:
            "Write a short follow-up that continues the conversation — no guilt, one question, and an easy way to book. Produce the draft's arguments in the tool's own vocabulary.",
        },
        {
          id: "nudge-5",
          kind: "act",
          instruction:
            "Save the follow-up as an unsent draft on the thread, for the owner to send by hand.",
          tool: { integrationId: "gmail", operation: "gmail.drafts.create" },
          risk: "low",
        },
      ],
      output: {
        kind: "draft",
        successCriteria:
          "The quiet thread has one unsent follow-up draft continuing its own conversation, and nothing was sent.",
      },
      onFailure: { retries: 2, backoffSeconds: 120, onExhausted: "notify_owner" },
    },
  ],
};

/* ═══════════════════════════ Marketing ═══════════════════════════ */

const marketing: AgentSpec = {
  id: "marketing-agent",
  version: 2,
  name: "Marketing Agent",
  role: "Turns the campaign calendar into ad emails, and never sends one unapproved",

  guidance: {
    objective:
      "On the day the campaign calendar names, compose the ad email for that " +
      "campaign, save it as a draft, and pause the send for the owner. The " +
      "calendar is the single source of what runs when — never invent a " +
      "campaign the calendar does not carry.",
    businessContext: CLINIC_CONTEXT,
    tone:
      "Clear and unbreathless. One offer per email, real dates and real " +
      "prices from the calendar entry, and no discount the entry does not " +
      "state.",
    examples: [
      "Today's calendar entry is 'September posture workshop — early-bird ends " +
        "Friday'. Compose that ad with the workshop date and the early-bird " +
        "deadline, draft it, and pause the send.",
      "The calendar shows nothing scheduled today. Prepare nothing, and say " +
        "so in the run summary rather than composing an ad on spec.",
    ],
  },

  capabilities: [
    {
      id: "read_campaign_schedule",
      name: "Read the campaign schedule",
      description:
        "Read the campaign calendar to learn which campaign runs today and what its entry says.",
      backedBy: ["google-calendar.events.list"],
    },
    {
      id: "draft_the_ad",
      name: "Draft the ad",
      description: "Compose the campaign email and save it as an unsent draft.",
      backedBy: ["gmail.drafts.create"],
    },
    {
      id: "send_the_campaign",
      name: "Send the campaign",
      description:
        "Send the campaign email — only ever after the owner approves it.",
      backedBy: ["gmail.messages.send"],
    },
  ],

  tools: [
    {
      integrationId: "google-calendar",
      // READ ONLY, deliberately. This agent exists to read the schedule, not
      // to change it, and the narrowest grant that does the job is the one
      // that cannot be widened by a prompt.
      operations: ["google-calendar.events.list"],
      purpose: "Read the campaign calendar to learn what runs today",
      required: true,
    },
    {
      integrationId: "gmail",
      operations: ["gmail.drafts.create", "gmail.messages.send"],
      purpose: "Draft the campaign email, and send it once the owner approves",
      required: true,
    },
  ],

  policy: {
    /*
     * Same shape as the helpdesk, for the same two reasons: the mode makes
     * `ads.per_run` reachable at the draft step, and `alwaysApprove` keeps the
     * send out of the unattended path whatever the numbers say. The rejected
     * alternative was `act_after_approval`, which reads closer to
     * "draft-and-approve" — but under that mode the limit below is a number
     * nothing consults (resolveAct returns at the mode check), and a limit
     * nobody can reach is worse than absent, because a reader would believe
     * it was enforced.
     */
    operatingMode: "auto_within_limits",
    limits: [
      {
        // The calendar schedules campaigns one or two at a time. Four ad
        // drafts in a single run means the agent has misread the schedule —
        // or is composing on spec — so the batch stops and asks.
        id: "ads-per-run",
        metric: "ads.per_run",
        op: "<=",
        value: 3,
        unit: "count",
        onBreach: "require_approval",
      },
    ],
    // The same decided flow as the helpdesk, on the same operation, for the
    // same reason. See the helpdesk's alwaysApprove note; nothing differs here.
    alwaysApprove: ["gmail.messages.send"],
    // Reading the schedule is one grant away from rearranging it. Denied by
    // name so that day never arrives silently; rule 3 holds because neither
    // operation is granted above.
    forbidden: ["google-calendar.events.create", "google-calendar.events.update"],
    approvalOwner: MARKETING_OWNER,
    // Four hours: a campaign approved by mid-afternoon still lands the same
    // day, and one approved later should wait for tomorrow anyway.
    escalateAfterMins: 240,
    quietHours: MARKETING_HOURS,
    // One scheduled run plus retry headroom. A marketing agent that starts
    // five times in a day is a schedule defect, not enthusiasm.
    maxRunsPerDay: 4,
  },

  workflows: [
    {
      id: "campaign-send",
      name: "Campaign Send",
      description:
        "Every morning, read what the campaign calendar schedules for today, compose the ad, draft it, and pause the send for the owner.",
      enabled: true,
      trigger: {
        kind: "schedule",
        label: "Every morning at 10:00, against today's campaign calendar",
        cron: "0 10 * * *",
        timezone: "Asia/Singapore",
      },
      steps: [
        {
          /*
           * The reason step comes FIRST, and that ordering is the argument
           * design. "Today's campaigns" is a window relative to now, which a
           * literal cannot express (the contract deliberately has no template
           * language — see StepArgumentSource in lib/plan/types.ts), so the
           * fetch takes the reasoning arm and this step derives the window
           * from the run's own facts. An opening fetch with no declaration
           * would be refused by the executor as an unscoped read.
           */
          id: "camp-1",
          kind: "reason",
          instruction:
            "From this run's own start time, work out today's date window and produce the arguments to list today's campaign calendar entries, in the tool's own vocabulary.",
        },
        {
          id: "camp-2",
          kind: "fetch",
          instruction: "Read today's entries from the campaign calendar.",
          tool: {
            integrationId: "google-calendar",
            operation: "google-calendar.events.list",
          },
          argumentSource: { kind: "reasoning" },
        },
        {
          id: "camp-3",
          kind: "reason",
          instruction:
            "Compose the ad email for the campaign the calendar schedules today — the entry's own offer, dates and prices, nothing invented. If nothing is scheduled, prepare nothing and say so. Produce the draft's arguments in the tool's own vocabulary, and report how many ads this run composed as ads.per_run.",
        },
        {
          /*
           * The draft is a real Gmail draft, not a figure of speech: when the
           * send below pauses, the owner is approving an email that already
           * exists word for word. This is also the act `ads.per_run` gates —
           * within the limit the draft is written unattended, over it the
           * batch stops here and asks.
           */
          id: "camp-4",
          kind: "act",
          instruction: "Save the composed ad as an unsent draft.",
          tool: { integrationId: "gmail", operation: "gmail.drafts.create" },
          risk: "low",
        },
        {
          id: "camp-5",
          kind: "act",
          instruction:
            "Send the campaign email. This always pauses first: the owner sees the exact ad and approves it before anything leaves.",
          tool: { integrationId: "gmail", operation: "gmail.messages.send" },
          risk: "medium",
        },
      ],
      output: {
        kind: "message",
        successCriteria:
          "The campaign the calendar schedules today has exactly one composed ad, saved as a draft, with its send approved by the owner before anything left — and a day with nothing scheduled sent nothing.",
      },
      // escalate, unlike the helpdesk's sweep: this runs once a day, so an
      // exhausted retry means today's campaign is about to be missed, which is
      // precisely the failure the agent exists to prevent.
      onFailure: { retries: 2, backoffSeconds: 300, onExhausted: "escalate" },
    },
    {
      /*
       * DISABLED, and left in the plan rather than deleted. The owner has not
       * agreed what a weekly recap should say, and a workflow that exists and
       * is switched off is the honest way to record that: it registers no
       * trigger, generates no scenario, and is one edit from being the thing
       * that runs — which is why rule 0 still checks its shape and GW-7
       * asserts activation registers nothing for it.
       */
      id: "campaign-recap",
      name: "Campaign Recap",
      description:
        "Once a week, draft a recap of the campaigns that ran, for the owner to circulate.",
      enabled: false,
      trigger: {
        kind: "schedule",
        label: "Every Monday morning at 09:00",
        cron: "0 9 * * 1",
        timezone: "Asia/Singapore",
      },
      steps: [
        {
          id: "recap-1",
          kind: "reason",
          instruction:
            "From this run's own start time, work out last week's date window and produce the arguments to list that week's campaign calendar entries, in the tool's own vocabulary.",
        },
        {
          id: "recap-2",
          kind: "fetch",
          instruction: "Read last week's entries from the campaign calendar.",
          tool: {
            integrationId: "google-calendar",
            operation: "google-calendar.events.list",
          },
          argumentSource: { kind: "reasoning" },
        },
        {
          id: "recap-3",
          kind: "reason",
          instruction:
            "Write a one-page recap of what ran last week, campaign by campaign, and produce the draft's arguments in the tool's own vocabulary.",
        },
        {
          id: "recap-4",
          kind: "act",
          instruction: "Save the recap as an unsent draft for the owner.",
          tool: { integrationId: "gmail", operation: "gmail.drafts.create" },
          risk: "low",
        },
      ],
      output: {
        kind: "draft",
        successCriteria:
          "One unsent draft recaps every campaign the calendar shows for last week.",
      },
      onFailure: { retries: 1, backoffSeconds: 60, onExhausted: "notify_owner" },
    },
  ],
};

/* ═══════════════════════════ Outcomes ═══════════════════════════ */

/**
 * Outcomes own the relationship to agents (contract §3.2), and between the two
 * below both agents are claimed — which is what keeps rules 13, 15 and 16
 * quiet. Every baseline is a number the clinic could read off its own inbox or
 * calendar; `null` was available and not used, because an outcome with nothing
 * to compare against renders as a goal that has never moved.
 */
const businessOutcomes: BusinessOutcome[] = [
  {
    id: "outcome-every-question-answered",
    name: "Every question in the inbox answered the same hour",
    priority: "high",
    owner: CLINIC_OWNER,
    metrics: [
      {
        id: "first-response-hours",
        label: "Time to first reply on a question",
        metric: "enquiry.first_response_hours",
        direction: "decrease",
        baseline: 26,
        target: 1,
        unit: "hours",
      },
      {
        id: "stale-questions",
        label: "Questions unanswered after a day",
        metric: "inbox.unanswered_over_24h",
        direction: "decrease",
        baseline: 9,
        target: 1,
        unit: "count",
      },
    ],
    agentIds: ["helpdesk-agent"],
  },
  {
    id: "outcome-campaigns-on-schedule",
    name: "Every scheduled campaign goes out on its day",
    priority: "high",
    owner: MARKETING_OWNER,
    metrics: [
      {
        id: "campaigns-on-schedule",
        label: "Campaigns sent on their scheduled day",
        metric: "campaign.sent_on_schedule_pct",
        direction: "increase",
        baseline: 60,
        target: 100,
        unit: "percent",
      },
      {
        id: "campaign-opens",
        label: "Campaign emails opened",
        metric: "campaign.opens_pct",
        direction: "increase",
        baseline: 18,
        target: 26,
        unit: "percent",
      },
    ],
    agentIds: ["marketing-agent"],
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
  approvedAt: "2026-07-30T09:00:00+08:00",
  approvedBy: CLINIC_OWNER,
  reportVersion: 2,
  businessOutcomes,
  agents: [helpdesk, marketing],
  globalPolicy: {
    /*
     * Null, and the null is a decision — see the header. The helpdesk polls
     * around the clock by design, so any org-wide window would contradict the
     * schedule this same plan declares. The one agent whose output lands in
     * customer inboxes on its own clock carries its own window instead.
     */
    quietHours: null,
    /*
     * Moving a calendar entry somebody agreed to is denied for the whole
     * organization, not merely withheld from these two agents. Withholding is
     * a fact about today's roster; a deny is a fact about the business, and it
     * is the one that survives the next agent somebody adds.
     */
    forbidden: ["google-calendar.events.update"],
  },
};

/* Individual specs, exported so a check can pin one agent without reaching
   through the plan — the same reason brightpath.ts exports its four. */
export { helpdesk as MERIDIAN_HELPDESK, marketing as MERIDIAN_MARKETING };

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
 * resolves to a real published tool — and the integrations gate never asks the
 * owner for a connection they cannot make.
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
          name: "Helpdesk Agent",
          agentKey: "helpdesk_agent",
          reasoning:
            "The clinic's stated pain is that questions sit unanswered in the shared inbox. Gmail alone covers reading the question and preparing the reply, so no other tool is proposed — the owner wants every send approved before it leaves.",
          requiredTools: ["gmail"],
          templateKeyOrNull: null,
        },
        {
          name: "Marketing Agent",
          agentKey: "marketing_agent",
          reasoning:
            "Campaigns are scheduled on a shared Google Calendar and go out by email. Reading the schedule and composing the ad needs Google Calendar plus Gmail, and the send waits for the owner exactly as the helpdesk's does.",
          requiredTools: ["gmail", "google-calendar"],
          templateKeyOrNull: null,
        },
      ],
    },
  },
  agents: [
    {
      agent_key: "helpdesk_agent",
      agent_type: "custom",
      template_id: null,
      status: "configured",
      runtime_model: "zai-org/glm-5.2",
      // Gmail is this agent's ONLY tool, which makes `stepsFor` in
      // lib/plan/ingest/from-handoff.ts promote `gmail.drafts.create` — the
      // first write the gmail registry lists — to the single `act` step. The
      // ingested agent therefore prepares a reply and stops, which is the
      // behaviour draft_only claims.
      required_tools: ["gmail"],
      config: {
        approvalOwner: "Priya Nair",
        channels: ["gmail"],
        spec: {
          objective:
            "Answer every question that arrives in the shared clinic inbox, and never send a reply the owner has not approved.",
          trigger:
            "A question lands in the shared clinic inbox. Until an event feed exists, check the inbox every few minutes.",
          inputs: "The unread threads in the shared inbox, and the messages inside them.",
          rules:
            "Answer what was actually asked from what the thread contains. Anything clinical becomes an offer of an assessment appointment, never an answer. Prepare the reply and stop.",
          tools: "Gmail.",
          forbidden:
            "Never send without approval, never answer a clinical question, and never touch anyone's calendar.",
          success:
            "Every question has a prepared reply waiting for the owner, on its own thread.",
          notes: {
            q1: "Insurance and pricing questions are answered from the thread where possible; otherwise ask for the missing detail and stop.",
            q2: "A patient who asked, was answered, and went quiet for days gets a gentle follow-up prepared, not a resend of the old reply.",
          },
        },
      },
    },
    {
      agent_key: "marketing_agent",
      agent_type: "custom",
      template_id: null,
      status: "configured",
      runtime_model: "zai-org/glm-5.2",
      // Gmail first, and the order is not cosmetic: `stepsFor` promotes the
      // FIRST write it finds to the agent's single `act` step. Gmail first
      // makes that write `gmail.drafts.create` — the agent composes the ad and
      // stops. Calendar first would have made it
      // `google-calendar.events.create`, so the synthesised workflow would end
      // by inventing a campaign on the very calendar it exists to read.
      required_tools: ["gmail", "google-calendar"],
      config: {
        approvalOwner: "Dana Lim",
        channels: ["gmail"],
        spec: {
          objective:
            "On the day the campaign calendar names, compose that campaign's ad email and hold it for the owner's approval.",
          trigger: "Each morning, against whatever the campaign calendar schedules for today.",
          inputs: "Today's entries on the shared campaign calendar.",
          rules:
            "The calendar is the source of what runs when. One ad per scheduled campaign, using the entry's own offer, dates and prices. Nothing scheduled means nothing composed.",
          tools: "Gmail and Google Calendar.",
          forbidden:
            "Never send without approval, never invent a discount the calendar entry does not state, and never create or move anything on the calendar.",
          success:
            "Each scheduled campaign has one composed ad waiting for the owner on its scheduled day.",
          notes: {
            q1: "Two campaigns on one day are two separate ads, never one combined email.",
            q2: "An entry with no offer details gets a question to the owner, not an invented promotion.",
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
