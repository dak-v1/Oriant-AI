# Oriant.ai — Hardcoded Product Mock — Master Build Spec

> Source: `docs/reference/Oriant_AI_Hardcoded_Product_Mock_Claude_Master_Prompt.docx`.
> This is the authoritative build specification for the complete post-landing journey:
> voice-first discovery → live business knowledge → workforce planner → sandbox → approvals workspace.
> Everything is a deterministic hardcoded fixture. No backend, no keys, no real APIs.

**IMPORTANT** — The mock should look and behave like a real product, but it must not
falsely claim that voice transcription, integrations, agent generation, sandbox
execution, WhatsApp approval or deployment are live. Use a small "Interactive demo"
badge and transparent mock status labels where needed.

---

## 0. Role and mission

Lead product designer + frontend engineer building the complete Oriant.ai interactive
product mock that begins after the public landing page. Polished, fully clickable,
voice-first demonstration of how a small-business owner moves from onboarding to
discovery, company-report approval, AI workforce planning, agent configuration, mock
build, sandbox testing, deployment and day-to-day operations.

Deterministic hardcoded MVP. Feels intelligent and alive, but requires no backend,
auth provider, LLM, transcription API, MCP server, messaging API, Daytona sandbox
or database.

Success = a non-technical owner can complete the journey without explanation and
understand: what Oriant has learned about the business; why specific workflows and
agents are recommended; which actions remain human-controlled; what each integration
enables; what the workforce costs; how generated agents are tested before activation;
how the owner operates and approves work after deployment.

## 1. Existing project and scope boundaries

- Preserve the public landing page. Only required change: primary CTA
  **Start Free Discovery → `/app/onboarding`**.
- Build the full mock flow (onboarding, lean canvas, voice discovery, live
  "What Oriant knows", editable report + approval, planner Tier 1 + Tier 2, agent
  library/drag-drop/NL reconfiguration/undo, integrations + MCP manager, per-agent
  config, custom-agent discovery cycles, mock Agent Factory, sandbox + stress test,
  activation review, owner workspace with approvals/calendar/commands/notifications/
  digests/reports).
- Do NOT implement: real auth, transcription, LLM calls, file parsing, OAuth, MCP
  servers, code execution, WhatsApp/Telegram/email sends, billing, production DB.

## 2. Technical implementation constraints

| Layer | Required approach |
|---|---|
| Framework | Existing Next.js App Router + React + TypeScript |
| Styling | Existing token-centralised CSS approach (`.oa` scope, CSS Modules per component) |
| Animation | framer-motion (already installed). No competing animation libs |
| Icons | lucide-react |
| State | Central typed zustand demo store; persist completed steps to localStorage |
| Mock services | Promises with deterministic delays + fixtures. No randomness, no network |
| Drag & drop | Lightweight Motion-based reorder/snap. No heavy graph editor |
| Calendar | Lightweight month/day calendar from hardcoded events |
| Syntax viewer | Preformatted code blocks with tabs for YAML / JSON / Markdown |
| Testing | lint, typecheck, production build; manual route walk at desktop + mobile |

Central mock service layer (replaceable by live integrations later):
`mockVoiceService.startAnswer(questionId)`, `mockDiscoveryService.analyse(profile)`,
`mockPlannerService.generate(report)`, `mockAgentFactoryService.build(workflowPlan)`,
`mockSandboxService.run(workflowId)`, `mockDeploymentService.activate(planId)`,
`mockNotificationService.send(channel, approvalId)`.
Each returns typed data and emits ordered status events after deterministic delays.
All timers cancellable so Reset / route changes cannot cause stale updates.

## 3. Visual design system

Consistent with the redesigned Oriant.ai landing page: premium, calm, operational,
modern. NOT a dense enterprise admin panel, NOT a generic purple AI dashboard.

| Token | Value | Use |
|---|---|---|
| Main background | `#F3F4F0` | Application shell and default page background |
| Alternate background | `#E9EDE8` | Secondary regions and planner bands |
| Raised surface | `#FAFAF7` | Cards, drawers, voice console, report paper |
| Primary text | `#101828` | Headings and core labels |
| Secondary text | `#667085` | Descriptions and metadata |
| Primary blue | `#3157D5` | Primary actions, active phase, selected agent |
| Teal | `#20A392` | Completed state, connected tools, approved results |
| Soft blue | `#E8EDFC` | Selected and information surfaces |
| Soft teal | `#DFF3EF` | Completed and positive surfaces |
| Amber | `#F59E0B` | Pending approval and warning |
| Red | `#D92D20` | Failure, high-risk action and urgent approval only |
| Dark | `#111827` | Code, execution and focused review areas |
| Border | `#D8DDD6` | Subtle boundaries |

Rules: never pure white full app background; generous spacing, 14–16px body text,
large section titles; ONE clear primary action per screen; readable cards/split views
over tiny tables; rounded 14–20px surfaces, subtle shadows, thin borders; colour
always paired with text labels + icons; plain business language — YAML/API scopes/MCP
details behind an Advanced view. Fonts: Manrope (interface) + Instrument Serif
(editorial accent, sparingly).

## 4. Global application shell

One persistent product shell after the landing page.

| Region | Required content |
|---|---|
| Left navigation | Oriant.ai wordmark; Discovery; Plan; Build; Operate. Active phase expands to show current sub-step; others compact |
| Top bar | Company selector, current phase, autosaved indicator, Interactive Demo badge, Help, Reset Demo, owner avatar |
| Main canvas | Active workflow page; allows wide planner/calendar layouts |
| Context rail / drawer | What Oriant knows, plan summary, selected agent or approval detail. Collapsible |
| Global command button | Always available after planning; opens universal command palette |
| Progress | Discovery → Report → Plan → Configure → Test → Activate. Never a vague spinner |

## 5. Route map and state machine

Routes (all under URL prefix `/app`):
`/app/onboarding`, `/app/onboarding/lean-canvas`, `/app/discovery`,
`/app/discovery/report`, `/app/planner`, `/app/planner/agents/[agentId]`,
`/app/integrations`, `/app/build`, `/app/sandbox`, `/app/deploy`, `/app/workspace`,
`/app/workspace/approvals`, `/app/workspace/calendar`, `/app/workspace/agents`,
`/app/workspace/integrations`.

Journey states:
`not_started → onboarding → discovery → report_review → report_approved → planning →
plan_review → agent_configuration → plan_approved → building → sandbox_ready →
validation_review → ready_to_activate → activating → active_workspace`
plus `blocked`, `needs_information`, `failed`, `reset`.

Any edit to an approved upstream object marks downstream mock outputs stale with a
clear "Rebuild required" notice. Deep-linking, refresh, back navigation and demo
reset must work reliably.

## 6. Canonical hardcoded demo company

"Use demo company" shortcut on first onboarding screen.

| Field | Hardcoded value |
|---|---|
| Company | BrightPath Home Services |
| Industry | Residential maintenance and home services |
| Location | Singapore |
| Business model | Appointment-based services with recurring maintenance plans |
| Team size | 18 employees |
| Monthly volume | ~650 customer requests, 420 completed jobs |
| Teams | Customer Care, Field Operations, Marketing, Finance, Management |
| Primary goal | Reduce manual coordination; keep customer-facing + financial decisions human |
| Tools | Gmail, Google Calendar, HubSpot, WhatsApp Business, QuickBooks, Google Drive, Slack |
| Automation mode | Assist — AI works with current employees |
| Always approve | Refunds > $100, public marketing content, invoice write-offs, schedule changes after customer confirmation |
| Never automate | Employee termination, bank transfers, legal commitments, deletion of customer records |

Core pain points: messages manually sorted across Gmail/WhatsApp; appointments
repeatedly rescheduled by phone+calendar; marketing planned inconsistently, waits on
owner; overdue invoices checked manually weekly; high-value complaints need info from
several teams before the owner can decide.

## 7. Phase 1 — Initial onboarding

Short, guided, voice-first. Establishes direction + permissions; Discovery documents
the rest.

**7.1 First view** — welcoming full-page screen, large progress summary, modes:

| Mode | Plain-language explanation |
|---|---|
| Assist | AI prepares, recommends and handles routine work with current employees. Important actions stay reviewable |
| Operate | AI handles more eligible workflows automatically within explicit limits and approval rules |
| Not sure yet | Oriant recommends an automation level after Discovery and explains why |

Voice-first prompt: "Tell me what your company does and what is taking too much of
your team's time." Large microphone control, secondary **Use demo company** action,
compact typed fallback.

**7.2 Onboarding sections** (conversational, not a long form; structured summary
updates as owner speaks; every captured field editable): Company; Team and
responsibilities; Goals; Automation preference; Existing tools; Business information
(Lean Canvas / SOPs / org chart); Permissions and consent.

**7.3 Existing tools selection** — categories with recognisable tool chips + search.
Selection ≠ connection. Categories:
- Customer communication: Gmail, Outlook, WhatsApp Business, Telegram, Intercom
- Scheduling: Google Calendar, Microsoft Calendar, Calendly
- CRM and sales: HubSpot, Salesforce, Pipedrive
- Finance: QuickBooks, Xero, Stripe
- Storage and documents: Google Drive, Dropbox, OneDrive, Notion
- Marketing: Mailchimp, Meta Business, LinkedIn, Canva
- Internal collaboration: Slack, Microsoft Teams, Asana, ClickUp

Selected tools animate into an "Existing systems" summary; not marked connected.

## 8. Lean Canvas intake

Two equal choices: **Upload existing Lean Canvas** and **Build it with Oriant**.

**8.1 Upload simulation** — polished drag-and-drop zone (PDF/PNG/DOCX examples), no
real parsing. After select: animated "Reading your business canvas" sequence →
hardcoded demo Lean Canvas. Labeled interactive demo.

**8.2 Guided Lean Canvas** — one card at a time with progress + plain-language
guidance: Problem, Customer Segments, Unique Value Proposition, Solution, Channels,
Revenue Streams, Cost Structure, Key Metrics, Unfair Advantage. Each card: one
focused question; industry-relevant examples; voice answer control; editable
transcript; Save and continue; **Improve wording with AI** (hardcoded transform,
Before vs Suggested side by side, Accept / Edit / Keep original — never overwrite
automatically).

## 9. Discovery Agent and adaptive voice interview

Voice-first, NOT voice-only: text conversation, question cards, upload more
information, invite an employee always available. Must never fail without microphone.

**9.1 Live interview screen** — focused call-like workspace: AI avatar/Orchestrator
indicator + current question; animated waveform, listening state, timer; live
transcript typing progressively; Edit answer before saving; Continue/clarify/skip;
question progress + reason for asking; two tabs: **Live Interview** and **What
Oriant Knows**.

Mock voice sequence on Start speaking: 1) listening state (waveform + elapsed
timer); 2) deterministic delay → hardcoded answer revealed word by word; 3) owner
can edit; 4) confirm → extracted facts animate into knowledge model; 5) next
hardcoded question. Mic input level may animate the waveform, but mic permission is
never necessary and transcripts are never derived from audio.

**9.2 Canonical interview questions and answers:**

| Question | Hardcoded owner answer | Knowledge updated |
|---|---|---|
| Which team is currently most overloaded? | Customer Care. Five people switch between Gmail, WhatsApp and HubSpot, and repeated questions take most of the morning. | Team load, systems, repeated customer-response workflow |
| What happens after a customer asks for an appointment? | A coordinator checks technician availability, offers times, updates Google Calendar and sends confirmation manually. | Appointment scheduling process and integration needs |
| Which decisions must always stay with a person? | Refunds above $100, schedule changes after customer confirmation, public campaign content and invoice write-offs. | Approval policies |
| What finance work is repeated? | Every Friday the finance team checks QuickBooks for overdue invoices and drafts reminders. | Scheduled finance workflow |
| What is hardest to coordinate? | Serious customer complaints need information from Customer Care, Operations and Finance before I can decide what to do. | Tier 2 custom workflow opportunity |

**9.3 "What Oriant Knows" tab** — core product moment; can be opened during the
call (small floating call bar with waveform, current question, Return to call).
Sections: Company; Teams; Goals; Processes; Systems; Rules; Assumptions; Knowledge
gaps; Potential opportunities. Every fact shows provenance + confidence: Owner
confirmed / Uploaded canvas / Selected tool / Invited employee / Oriant assumption.
On confirm: relevant section pulses softly, new fact chip, completion updates —
informative, not celebratory.

**9.4 Other discovery modes** — Text Conversation (same Q&A, no voice animation);
Question Cards (own pace); Upload More Information (simulated SOP/org-chart upload
adds hardcoded facts); Invite an Employee (mock invite link, select process,
simulated employee response arrives in knowledge tab).

## 10. Company report and Human Approval Gate 1

Premium editable document inside the product (not a static Word preview, not a
dense form). Split layout: outline left, editable report centre, evidence/comments
drawer right. Sections: Company overview; Lean Canvas summary; Team structure;
Current processes; Business goals; Bottlenecks; Existing systems; Automation
preference; Approval restrictions; Assumptions; Missing information; Potential
opportunities.

Per-section actions: Edit, Confirm, Reject finding, Add context, Assign process
owner, Mark confidential, Ask another discovery question.

Bottom: report completeness; confirmed facts vs assumptions; remaining non-blocking
gaps; Save draft; **Approve and send to Planner**. Approval creates an immutable
version label (e.g. "Company Report v2 — Approved"). Editing later marks the
workforce plan stale.

## 11. Phase 2 — AI Workforce Planner

Planner receives the approved report, creates context only. UI = living operations
document + interactive workflow canvas (NOT a blank engineering graph editor).

**11.1 Layout** — Left library (recommended agents, preset library, custom
placeholder, search, filters); Centre plan (top-to-bottom workflow narrative, agent
cards between explanatory sections, connected by animated paths); Right inspector
(selected agent/edge/cost/integration/approval/config); Top controls (plan version,
regenerate, undo, redo, setup + monthly cost, Confirm workflow); Bottom command bar
(natural-language / voice plan changes).

**11.2 Tier 1 preset matching** — recommend existing agents wherever possible; mark
covered use cases as covered; pass full context + uncovered gaps to Tier 2.

| Preset agent | Workflows in the mock |
|---|---|
| Admin Operations Agent | Customer Response Drafting; Appointment Scheduling |
| Marketing Agent | Content Planning; Campaign Drafting and Approval |
| Finance Follow-up Agent | Overdue Invoice Summary; Payment Reminder Drafting |

Each preset card: fit score, reason, covered outcomes, required integrations,
autonomy level, human approvals, illustrative setup + monthly price.

**11.3 Tier 2 custom capability** — high-value complaint process → custom **Service
Recovery Coordinator**. Planner explains why no preset covers it, then a rough
proposal: objective, trigger, required inputs, teams involved, decisions, allowed
actions, prohibited actions, approval points, required integrations, missing
information. Custom card tappable → agent-specific discovery cycle (Phase-1-style
voice UX, only questions needed to design this agent).

**11.4 Preset agent configuration** — Configure opens a clean drawer: Operating
mode (Draft only / Act after approval / Auto within limits); Triggers (event,
schedule, threshold, manual, dependency, approval); Channels and systems; Workflows
enabled; Actions requiring human approval; Process owner + approval owner; Quiet
hours + run frequency; Data access + forbidden actions; illustrative setup +
monthly cost.

**11.5 Custom agent configuration cycle** — 1) Agent overview + why custom;
2) voice-first questions (objective, trigger, info required, decisions, permitted
actions, escalation, systems, success criteria); 3) live Agent Knowledge tab;
4) editable Agent Design Report; 5) required setup checklist (config fields,
APIs/connections, future credentials, permissions, process-owner confirmation);
6) Approve custom agent design.

Mock clarifications: trigger = complaint marked high severity OR high-value
customer asks for compensation; reads HubSpot customer history, job record, invoice
status; requests technician info from Operations; drafts resolution + proposed
compensation; never issues refund or promises compensation without owner approval;
escalates when info missing or sentiment remains highly negative.

**11.6 Drag, add, remove, reconfigure** — drag preset/custom agents from library
into valid planner slots; reorder workflows within an agent; add/remove/duplicate
agent; disable a workflow without deleting; click an animated connection to inspect
data passed + failure behaviour; NL command bar changes; undo/redo every structural
change. Snap zones + valid placement rules (not free-form). Cards animate smoothly;
connector paths redraw.

**11.7 Natural-language reconfiguration** — example commands: "Keep campaign
publishing human-approved." / "Add a weekly overdue-invoice summary." / "Move
appointment reminders to the Admin Agent." / "Do not let any agent contact a
high-value customer automatically." Submit → brief Planner reasoning state →
deterministic fixture change → summary of change + cost delta + Undo.

**11.8 Pricing** — illustrative, clearly labeled:

| Agent | Setup | Monthly |
|---|---|---|
| Admin Operations Agent | $180 | $59 |
| Marketing Agent | $140 | $49 |
| Finance Follow-up Agent | $160 | $55 |
| Service Recovery Coordinator (custom) | $420 | $129 |
| **Illustrative total** | **$900** | **$292** |

Expected outcomes (no guaranteed savings): faster first response, fewer scheduling
handoffs, consistent campaign review, faster invoice follow-up, clearer complaint
escalation.

## 12. Tools, integrations and MCP connections

Clearer version of the dense reference screen. Four tabs: **Recommended for your
plan** / **Connected apps** / **Available apps** / **MCP and internal tools**.
Recommended = Gmail, Google Calendar, HubSpot, WhatsApp Business, QuickBooks,
Google Drive, Slack.

Each connection card/row: logo + name; one-sentence purpose; "Needed by agent"
badges; data the agent can read; actions the agent may request; status (Connected /
Required / Optional / Needs approval); Connect or Manage button.

Connect → mock permission wizard: account selected, plain-language scopes, approval
owner, test connection, completed. No OAuth, no credentials.

MCP explained simply: "A secure tool connection that lets an agent use a specific
system or capability." Protocol/server URL/technical scopes inside an Advanced
accordion. Hardcoded MCP examples: Files and Documents, Browser Research, Calendar
Actions, CRM Records, Internal Knowledge Search — each shows which agents need it.

## 13. Human Approval Gate 2 — approve the workforce plan

Owner reviews: agents + workflows; human vs AI responsibilities; triggers +
schedules; autonomy levels; approval points; integrations + permissions; setup +
monthly cost; budget limits; deployment mode. Plan-readiness checklist; Confirm
workflow disabled until required config complete and blocking custom-agent
questions answered. Integrations may remain "connect during activation".

## 14. Executor / Agent Factory

Simulated asynchronous build jobs; creates only what was approved. Hardcoded
artifacts per agent: workflow definitions; agent configuration; prompt templates;
data schemas; integration manifests; approval policies; retry + timeout policies;
test cases; monitoring configuration. JSON/YAML machine-readable, Markdown docs.

Build screen: one job card per agent; queued/generating/validating/completed;
ordered build log; overall progress; cancel + retry; artifact tabs (YAML/JSON/
Markdown); Review generated package; clear "Simulated build" label. Deterministic
8–15s sequences; **Skip animation** for rehearsals. Missing required field → agent
marked Needs clarification, linked back to config (never invent values).

## 15. Sandbox and stress-test simulation

Screen: workflow selector; **Run test** and **Run 20-case stress test**; input
scenario panel; animated event timeline; agent-to-agent messages; human approval
interception; result panel; logs + metrics; failed-case review.

Canonical test: high-value customer complains after delayed service → Customer Care
classifies → Service Recovery Coordinator requests job + invoice context → prepares
resolution → **pauses for owner approval** before any compensation. Owner can
Review, edit proposed resolution, add comment, Ask agent to update. On approve,
timeline resumes and completes.

Stress test summary: 20 cases — 18 passed, 1 correctly escalated, 1 failed
(required job data missing). Failure understandable and safe.

## 16. Deployment and activation

Mock activation checklist: 1) confirm artifacts; 2) confirm sandbox results;
3) review unresolved warnings; 4) connect or simulate required systems; 5) confirm
human approval owners; 6) confirm triggers/schedules/quiet hours; 7) choose
notification channels; 8) **Activate workforce**. After activation: agents animate
Ready → Active, short activity burst, transition to workspace. "Demo agents" badge.

## 17. Owner-facing AI operations workspace

One workspace with team tabs: Overview, Customer Care, Admin, Marketing, Finance,
Agents. Active tab filters workflows, approvals, activity, calendar items.
Overview: today summary; human approvals required; scheduled work; active agents +
workflows; recent activity; weekly outcome snapshot; universal command bar.

## 18. Approval Inbox and Automation Calendar

Primary owner screen. Desktop: left 38–42% scrollable Approval Inbox; right 58–62%
calendar. Mobile: Approval and Calendar tabs.

**18.1 Approval Inbox** — filters: All, Assigned to me, Financial, Marketing,
Admin, High value, Customer-facing, Due today; also filter from a selected calendar
date. Card: workflow + agent; decision required; short reason; risk/value level;
due date + scheduled time; related customer or campaign; Review; Approve.
Review → large drawer: source info, proposed decision/content, confidence, approval
rule, history, editable fields, comments, **Ask Agent to Update** (hardcoded
revision, visible new version, previous preserved). Approve updates card, calendar
and activity feed together (shared-layout animation).

**18.2 Calendar** — month view default (Google-Calendar-like, Oriant styling); day
click → day timeline with time blocks; block click → related approval/workflow
detail. States:

| State | Visual treatment |
|---|---|
| Scheduled, approval required | Red/amber outline + "Pending approval" label + icon |
| Scheduled and approved | Dark navy/near-black fill + "Approved" label |
| Completed | Teal fill + "Completed" label |
| Needs changes | Blue outline + "Review requested" label |
| Failed | Red fill/border + "Failed" label + recovery action |

Colour consistent between approval card and calendar event; text + icons always.
Calendar actions: reschedule, skip next run, pause, run now, set quiet hours,
exclude public holidays, change frequency. Event-triggered workflows live primarily
in the activity feed.

## 19. Commands, notifications, digests and reports

**19.1 Universal command bar** — available from every workspace page. Examples:
"Prepare a summary of overdue invoices." / "Create a campaign for our new service."
/ "Show all customer enquiries waiting for a reply." / "Pause marketing posts
during the public holiday." Submit → Orchestrator routing animation → named agent →
hardcoded result or draft.

**19.2 Immediate notifications** — approval required; serious failure; sensitive
exception; cost threshold; permission issue; high-value customer/transaction.
Mock WhatsApp: approval created → phone notification preview; **Send test
notification** → fake message panel with Review + Approve deep-link buttons. Never
claims a real send.

**19.3 Daily digest + weekly outcome report** — digest: routine work completed,
non-urgent reviews, low-risk exceptions, upcoming scheduled work. Weekly: estimated
hours saved, response-time improvement, revenue/conversion impact, workflow success
rate, human intervention rate, total illustrative AI cost, cost per successful
outcome. All labeled estimates on mock data.

## 20. Motion and interaction system

One primary motion concept per screen:

| Experience | Primary motion |
|---|---|
| Onboarding | Question cards transition horizontally; captured facts settle into summary |
| Voice interview | Waveform, transcript typing, listening pulse, knowledge updates |
| What Oriant knows | New fact chips, confidence update, section-completion progress |
| Report | Section confirmation, version update, evidence drawer transitions |
| Planner | Cards snap into slots, paths redraw, cost counts up, undo restores layout |
| Custom agent | Mini discovery cycle + Agent Knowledge updates |
| Integrations | Connection wizard steps; status morphs Required → Connected |
| Build | Ordered job progress, log stream, artifact tabs |
| Sandbox | Event packets travel between agents, pause at human approval |
| Deployment | Agent statuses activate in sequence |
| Workspace | Approval card, calendar event, activity feed update together |

Timing: micro 180–280ms; cards/drawers 320–550ms; page transitions 450–700ms;
simulated AI jobs 1–3s per visible step. Easing `cubic-bezier(0.22, 1, 0.36, 1)`.
Use opacity, transforms, clip masks, SVG path animation. No continuous bouncing,
excessive glow, giant particle fields, layout-shifting animation. Pause offscreen
loops. Respect `prefers-reduced-motion` (remove waveform travel, path drawing,
shared-layout motion; keep instant state changes + full content). Never delay
access to a button to finish an animation.

## 21. Responsive behavior and accessibility

| Viewport | Adaptation |
|---|---|
| 1440px | Full sidebar, two/three-column workspaces, wide planner, split approval-calendar |
| 1024px | Compact sidebar, collapsible inspector, reduced planner spacing |
| 768px | Drawer-based inspector, stacked report/planner panels, calendar below approvals |
| 390px | Bottom/compact nav, full-screen drawers, Live Call / Knowledge tabs, Approval / Calendar tabs, no tiny workflow labels |

No horizontal overflow. Keyboard-operable everything. Visible focus states.
Semantic headings + accessible labels. `aria-live` for transcript text, build logs,
approval status. No unexpected audio. All voice actions have typed alternatives.
Tooltips never sole carrier of essential info. Calendar state never colour-alone.

## 22. Fixtures and deterministic timing

Typed fixture files (no big fake responses inside page components):
`lib/mock/fixtures/`: demo-company, lean-canvas, discovery-questions,
company-report, agent-library, workflow-plan, integrations, build-artifacts,
sandbox-scenarios, approvals, calendar-events, activity, reports.

Seeded deterministic sequence — fresh run always shows same content, same result.
Reset Demo + Fast-forward controls in a secondary demo menu.

| Action | Delay / sequence |
|---|---|
| Voice answer | 0.6s listening start; 3–5s waveform; 1.5s progressive transcript |
| Discovery analysis | 4 visible stages over 5–7s |
| Planner generation | 5 visible stages over 7–9s |
| NL reconfigure | 2–3s then deterministic plan update |
| Connection | 3-step wizard over 2–4s |
| Agent build | 8–15s with per-agent stagger |
| Sandbox run | 10–18s with approval pause |
| Activation | 5–8s sequential status transition |

## 23. Core TypeScript contracts

See `lib/mock/types.ts` — includes at minimum `Provenance`, `KnowledgeFact`,
`AgentPlan`, `ApprovalItem` from the spec plus everything else needed. Store
serialisable + localStorage-safe.

## 24. Component and file structure

```
app/app/                       (URL prefix /app)
  layout.tsx                   product shell
  onboarding/page.tsx          + lean-canvas/page.tsx
  discovery/page.tsx           + report/page.tsx
  planner/page.tsx             + agents/[agentId]/page.tsx
  integrations/page.tsx
  build/page.tsx
  sandbox/page.tsx
  deploy/page.tsx
  workspace/page.tsx           + approvals/ calendar/ agents/ integrations/
components/mock/
  shell/ ui/ onboarding/ discovery/ report/ planner/ agents/ integrations/
  build/ sandbox/ deploy/ workspace/ approvals/ calendar/ command/
lib/mock/
  types.ts  store.ts  state-machine.ts  motion.ts  pricing.ts
  services/  fixtures/
```

Route files thin; reusable logic in components + mock service layer.

## 26. Acceptance checklist (verify all)

Flow: landing CTA opens onboarding, browser back works. Onboarding: 3 modes work;
Use demo company fills fixture. Lean Canvas: upload sim + guided flow → same
editable canvas. Voice: waveform, progressive transcript, editable answer, no mic
needed. Knowledge tab: openable during call, updates after every confirmed answer.
Provenance: facts show source + confirmation; assumptions distinct. Report: every
section editable + approvable; approval creates version. Planner: Tier 1 vs Tier 2
distinct in one plan. Preset config changes summary + cost. Custom agent: mini
discovery → editable Agent Design Report. DnD: valid zones only; connectors +
totals update. Reconfigure: NL command → deterministic change; Undo restores.
Integrations: purpose, needed-by, permissions, mock connect flow. MCP plain
language + optional advanced. Plan approval blocked until ready; checklist explains.
Build: async per-agent jobs; artifacts reviewable. Sandbox: run pauses for approval,
resumes after. Stress test: 20-case summary. Activation: checklist completes; agents
activate. Workspace: team tabs filter; command bar everywhere. Approvals: review,
comments, edit, Ask Agent to Update, Approve. Calendar: month + day views link to
approvals, matching states. WhatsApp: clearly simulated. Reports: digest + weekly
render. Persistence: refresh preserves; Reset cleans. Responsive: no horizontal
overflow at 1440/1024/768/390. A11y: keyboard, focus, labels, reduced motion,
colour-independent states. Quality: no broken links, runtime errors, duplicate
timers, stale updates, blank states. Build: lint + tsc + production build pass.

## Appendix A — hardcoded workflow plan example

```json
{
  "planId": "plan-brightpath-v1",
  "companyReportVersion": 2,
  "agents": [
    { "id": "admin-operations", "name": "Admin Operations Agent", "source": "preset",
      "workflows": ["customer-response-drafting", "appointment-scheduling"],
      "setupCost": 180, "monthlyCost": 59, "status": "ready_to_build" },
    { "id": "service-recovery", "name": "Service Recovery Coordinator", "source": "custom",
      "workflows": ["high-value-complaint-resolution"],
      "setupCost": 420, "monthlyCost": 129, "status": "ready_to_build" }
  ],
  "humanGates": ["refunds_above_100", "public_marketing_content",
    "invoice_write_offs", "confirmed_schedule_changes"],
  "illustrativePricing": true
}
```

## Appendix B — example generated custom-agent YAML

```yaml
schema_version: '1.0'
agent:
  id: service-recovery
  name: Service Recovery Coordinator
  source: custom
  objective: Coordinate high-value complaint resolution without making financial commitments
trigger:
  event_type: complaint.high_severity
inputs: [customer_history, job_record, invoice_status, technician_notes]
outputs: [resolution_draft, compensation_proposal, owner_approval_request]
permissions:
  read: [hubspot_customer_history, job_records, invoice_status]
  write: [resolution_drafts, approval_queue]
  forbidden: [issue_refund, promise_compensation, delete_customer_record]
human_approval:
  required_for: [any_compensation, refund, schedule_change_after_confirmation,
    missing_required_information]
```

## Appendix C — 4–6 minute demo script

1. Landing → Start Free Discovery → Use demo company.
2. Assist mode → guided Lean Canvas summary.
3. Voice interview: confirm two answers → open What Oriant Knows.
4. Fast-forward remaining questions → approve Company Report v2.
5. Planner: three presets + custom Service Recovery Coordinator.
6. Configure one preset; open custom agent, answer one voice question, approve design.
7. Add a recommended integration; NL command changes an approval rule; Undo.
8. Confirm plan → Agent Factory progress → open one YAML artifact.
9. Run complaint sandbox scenario → approve paused action.
10. Activate → Approval Inbox + Calendar → review, Ask Agent to Update, approve.
11. Universal command bar → overdue-invoice summary.
