# Fixture module contracts

Every fixture file imports types from `../types` and ids from `./ids`.
Exports below are EXACT — the store and screens import these names.
All content is BrightPath Home Services (spec §6). Plain business language,
Singapore context (SGD $, local names). No lorem ipsum. No randomness.

## demo-company.ts
- `DEMO_COMPANY: CompanyProfile`
- `TOOL_CATALOG: ToolChip[]` — all 27 tools of spec §7.3, ids from `APP`
- `TOOL_CATEGORY_LABELS: Record<ToolCategory, string>`
- `DEMO_INTRO_ANSWER: string` — owner's opening voice answer (2–3 sentences,
  first person, mentions pain points)
- `ONBOARDING_SECTIONS: { id: string; title: string; blurb: string }[]` — the 7
  capture areas of §7.2

## lean-canvas.ts
- `LEAN_CANVAS_BLOCKS: LeanCanvasBlockDef[]` — all 9 blocks in spec §8.2 order,
  each with question, guidance, 2–3 industry examples, `demoValue` (2–3
  sentences) and `improvedValue` (sharper wording of the same content)

## discovery-questions.ts
- `DISCOVERY_QUESTIONS: DiscoveryQuestion[]` — the 5 canonical §9.2 questions in
  `DISCOVERY_QUESTION_ORDER`, ids from `DQ`, answers verbatim from the spec,
  `factIds` referencing facts below
- `KNOWLEDGE_FACTS: Record<string, KnowledgeFact>` — the full knowledge model:
  - ~10 base facts (`fact-base-*`, provenance `owner_confirmed` from onboarding
    + `uploaded_document` from canvas + `selected_tool` for systems)
  - 2–4 facts per question (`fact-q1-*`…`fact-q5-*`, provenance `owner_confirmed`)
  - 3 upload-bonus facts (`fact-upload-*`, provenance `uploaded_document`)
  - 2 invite-bonus facts (`fact-invite-*`, provenance `employee_response`)
  - 3 assumptions (`fact-assume-*`, provenance `oriant_assumption`,
    confirmed:false, confidence 0.5–0.7)
  - 3 gaps (section "gaps") and 4 opportunities (section "opportunities" —
    should foreshadow the 4 agents)
- `BASE_FACT_IDS: string[]`, `UPLOAD_FACT_IDS: string[]`, `INVITE_FACT_IDS: string[]`
- `KNOWLEDGE_SECTION_LABELS: Record<KnowledgeSection, string>`

## company-report.ts
- `REPORT_SECTIONS: ReportSectionDef[]` — all 12 §10 sections in order, rich
  BrightPath content (2–3 paragraphs OR 1 paragraph + bullets each), evidence
  entries quoting interview answers/canvas, honest confirmedFacts/assumptions
  counts
- `REPORT_SECTION_ORDER: ReportSectionId[]`

## agent-library.ts
- `AGENT_LIBRARY: Record<string, AgentDef>` keyed by `AGENT.*` ids —
  3 presets + 1 custom, workflows per spec §11.2 (ids from `WF`), costs from
  `PRICING`, fitScore 84–96 for presets, full `defaultConfig`, custom agent has
  `customProposal` (§11.3) + `designQuestions` (6 questions per §11.5 with
  hardcoded answers reflecting the §11.5 clarifications; factIds may be `[]`)
- `LIBRARY_ORDER: string[]` — display order (admin, marketing, finance, recovery)
- `PLAN_OUTCOMES: string[]` — 5 expected outcomes (§11.8, no guaranteed savings)

## workflow-plan.ts
- `INITIAL_PLAN_AGENTS: PlanAgent[]` — all four agents as the planner recommends
  them: presets `needs_configuration`, custom `needs_information`, configs from
  defaults, workflowOrder from the library defs
- `PLANNER_STAGES: string[]` — 5 visible generation stages (§22)
- `DISCOVERY_STAGES: string[]` — 4 visible analysis stages (§22)
- `NL_COMMANDS: NlCommandFixture[]` — the 4 example commands of §11.7 with
  deterministic effects (use `WF.weeklyInvoiceDigest` for the add command;
  the "move appointment reminders" command may use kind "add_rule" with a
  sensible summary if a true move is not representable)

## integrations.ts
- `INTEGRATIONS: Record<string, IntegrationDef>` — the 7 recommended apps
  (defaultStatus "required", neededBy filled per agent), at least 8 more
  available apps (defaultStatus "optional", neededBy []), and the 5 MCP tools
  (kind "mcp", ids from `MCP`, defaultStatus "optional" except CRM Records +
  Files "required", neededBy filled). Every def: purpose, reads (2–4), actions
  (2–3), permissionSummary (3 plain-language lines), advanced (protocol
  "MCP over HTTPS" or "OAuth 2.0", plausible server, 2–4 scopes), account
  "ops@brightpath.sg" style
- `INTEGRATION_TAB_ORDER: { id: string; label: string }[]` — recommended /
  connected / available / mcp

## build-artifacts.ts
- `BUILD_FIXTURES: Record<string, BuildFixture>` keyed by agent id — durations
  9000/11000/12500/15000ms (admin/marketing/finance/recovery), 8–12 log lines
  each (tone mix), artifacts per agent: `agent.yaml`, `workflows.yaml`,
  `prompts.md`, `approval-policies.json`, `test-cases.yaml`, plus
  `integration-manifest.json` — service-recovery's agent.yaml MUST match spec
  Appendix B. Content must be realistic and consistent with the agent's
  workflows/permissions (forbidden: issue_refund etc.)
- `BUILD_ORDER: string[]` — admin, marketing, finance, recovery (stagger starts)

## sandbox-scenarios.ts
- `SANDBOX_SCENARIOS: Record<string, SandboxScenario>` — 3 scenarios keyed by
  `SCENARIO.*`; the complaint scenario is canonical (§15): Mrs Wong, delayed
  aircon servicing, timeline ~14 events with one `approval_pause` at ~60%,
  `proposedResolution` (goodwill visit + $60 service credit pending approval),
  `revisedResolution` (adds priority technician + follow-up call). Other two
  simpler (~8 events, no pause OR pause for reminder batch)
- `STRESS_TEST: StressTestFixture` — 20 cases: 18 passed, 1 escalated,
  1 failed (missing job data), all 20 named, failureExplanation clear + safe

## approvals.ts
- `APPROVAL_ITEMS: Record<string, ApprovalItem>` — all 8 items keyed by
  `APPROVAL.*`, calendarEventId from matching `CAL.*`, teams spread across
  customer_care/admin/marketing/finance, risk spread, 2 with status other than
  "pending" (one approved, one review_requested), dueAt within `DEMO_MONTH`
  near `DEMO_TODAY`, versions[0] = v1 fixture content, nextRevision filled,
  1–2 comments on some, flags accurate
- `APPROVAL_FILTERS: { id: string; label: string }[]` — §18.1 filter list

## calendar-events.ts
- `CALENDAR_EVENTS: Record<string, CalendarEvent>` — the 8 `CAL.*` events
  (state matching their approval's status: pending → pending_approval etc.)
  plus ~14 more standalone events across `DEMO_MONTH` covering every
  `CalendarEventState` incl. ≥1 failed + ≥1 needs_changes; recurring patterns
  (Friday invoice runs, Monday content planning); times 08:00–18:00
- `CALENDAR_ACTIONS: string[]` — reschedule, skip next run, pause, run now,
  set quiet hours, exclude public holidays, change frequency

## activity.ts
- `ACTIVITY_FEED: ActivityEvent[]` — 16 entries, today, newest first, tone mix,
  message style "Drafted reply to…", team + agent accurate
- `ACTIVATION_BURST: ActivityEvent[]` — 4 entries that appear right after
  activation
- `WHATSAPP_PREVIEW: { title: string; body: string; time: string }` — the mock
  phone notification for `APPROVAL.refund`

## reports.ts
- `DAILY_DIGEST: DailyDigestFixture` (date = DEMO_TODAY)
- `WEEKLY_REPORT: WeeklyReportFixture` — 7 metrics per §19.3, values labeled
  "est." where relevant
- `COMMANDS: CommandFixture[]` — the 4 §19.1 commands, keywords chosen so each
  example matches its own fixture (e.g. ["overdue"], ["campaign"],
  ["enquiries"|"waiting"], ["pause","holiday"]), routing steps 3 lines,
  resultLines 4–8 lines of plausible content
