# Oriant.ai Product Mock — Implementation Plan

Maps every phase and screen of `docs/PRODUCT_MOCK_SPEC.md` to routes, components,
fixtures and state transitions. The mock is 100% client-side: typed fixtures +
deterministic mock services + a persisted zustand store. The existing landing page
(`/`) and the legacy Margo demo (`/demo`) are untouched except for the landing CTA.

## Architecture

```
lib/mock/
  types.ts            All shared contracts (single source of truth)
  state-machine.ts    JourneyState order, guards, route↔state mapping, staleness
  store.ts            zustand store (persist → localStorage "oriant-demo-v1")
  motion.ts           EASE / durations / stagger + reduced-motion variants
  pricing.ts          Cost helpers (derive totals from plan)
  services/           Deterministic, cancellable mock services (§2)
    timeline.ts       runTimeline() — ordered status events w/ cancel registry
    voice.ts          mockVoiceService     (listen → transcript reveal)
    discovery.ts      mockDiscoveryService (4-stage analyse)
    planner.ts        mockPlannerService   (5-stage generate, NL reconfigure)
    factory.ts        mockAgentFactoryService (per-agent build jobs)
    sandbox.ts        mockSandboxService   (event timeline w/ approval pause)
    deployment.ts     mockDeploymentService(sequential activation)
    notifications.ts  mockNotificationService (WhatsApp preview)
  fixtures/           13 typed fixture files (§22) — BrightPath Home Services
app/app/              URL prefix /app — product shell + 16 routes (§5)
components/mock/      shell/ ui/ + one folder per experience
```

## Route → state → fixture map

| Route | Journey states | Key components | Fixtures |
|---|---|---|---|
| /app/onboarding | not_started→onboarding | ModeSelect, VoicePrompt, ToolPicker, SectionSummary | demo-company |
| /app/onboarding/lean-canvas | onboarding | UploadSim, GuidedCanvas, ImproveWording | lean-canvas |
| /app/discovery | discovery | LiveInterview, Waveform, TranscriptReveal, KnowledgeTab, OtherModes | discovery-questions, demo-company |
| /app/discovery/report | report_review→report_approved | ReportOutline, ReportSection, EvidenceDrawer, ApprovalFooter | company-report |
| /app/planner | planning→plan_review→plan_approved | AgentLibrary, PlanCanvas, Inspector, CommandBar, PricingBar | agent-library, workflow-plan |
| /app/planner/agents/[agentId] | agent_configuration | PresetConfigDrawer, CustomDiscoveryCycle, AgentDesignReport | agent-library, discovery-questions |
| /app/integrations | any ≥ planning | IntegrationTabs, ConnectionCard, ConnectWizard, McpDrawer | integrations |
| /app/build | building | BuildJobCard, BuildLog, ArtifactViewer | build-artifacts |
| /app/sandbox | sandbox_ready→validation_review | ScenarioPicker, EventTimeline, ApprovalInterrupt, StressSummary | sandbox-scenarios |
| /app/deploy | ready_to_activate→activating | ActivationChecklist, AgentActivationList | workflow-plan, integrations |
| /app/workspace | active_workspace | TeamTabs, TodayCards, ActivityFeed, WeeklySnapshot, CommandPalette | activity, reports, approvals |
| /app/workspace/approvals | active_workspace | ApprovalInbox, ReviewDrawer, WhatsAppPreview | approvals |
| /app/workspace/calendar | active_workspace | MonthCalendar, DayTimeline, EventDetail | calendar-events, approvals |
| /app/workspace/agents | active_workspace | AgentRoster | workflow-plan |
| /app/workspace/integrations | active_workspace | (reuses /app/integrations views) | integrations |

## State machine (lib/mock/state-machine.ts)

Linear order per §5 with guards; each route declares its minimum state; the shell
redirects forward (deep link into a later phase → send to current step) and allows
backward navigation freely. `blocked / needs_information / failed` are per-object
flags, not global states. Editing an approved report → `report.stale`+ downstream
`plan.stale` → "Rebuild required" notices.

## Design system

`.oa` scope in `app/app/app.css` — same palette as the landing (`landing.css`) per
§3, same fonts (Manrope + Instrument Serif via root layout), same easing. Shared
primitives: `.oa-btn` (primary/ghost/dark/danger/sm), `.oa-card`, `.oa-chip`,
`.oa-status--*` (pending/approved/completed/review/failed/active — never
colour-alone), `.oa-input`, `.oa-tabs`, `.oa-drawer`, `.oa-code`, `.oa-micro`,
`.oa-eyebrow`. Screen-specific layout in colocated CSS Modules.

## Determinism & persistence

- No `Math.random()` / time-derived content. All ids and sequences from fixtures.
- Services return `{ promise, cancel }`; every timer registered and cancelled on
  Reset/unmount (no stale updates).
- zustand `persist` with versioned key; Reset Demo clears storage + cancels timers.
- Fast-forward: demo menu action that completes the current phase instantly
  (services support `instant` mode).

## Delivery phases

1. Docs + contracts + design tokens (this commit set)
2. Store + state machine + services + shell + UI primitives
3. Fixtures (13 files, typecheck-verified)
4. Screens (parallel by experience, disjoint file ownership)
5. Integration: lint, tsc, production build
6. Browser walkthrough of Appendix C script + §26 acceptance checklist,
   responsive (1440/1024/768/390), reduced motion, screenshots
