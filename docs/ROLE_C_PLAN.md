# Role C — Build + Operate: execution plan

**Owner:** P · **Branch:** `perynn/RoleC`
**Input contract:** [`PLAN_CONTRACT.md`](./PLAN_CONTRACT.md) — one `ApprovedPlan` from D
**Scope:** everything downstream of an approved plan

| Section 3 — Build | Section 4 — Operate |
| --- | --- |
| Agent Factory · `/app/build` | Workspace · `/app/workspace` |
| Sandbox · `/app/sandbox` | Approvals · `/app/workspace/approvals` |
| Activation · `/app/deploy` | Calendar · `/app/workspace/calendar` |
| | Agents · `/app/workspace/agents` |
| | Integrations · `/app/workspace/integrations` |

---

## The organising principle

> **Depth before breadth.** Take *one* agent all the way — plan → built → tested
> → activated → approved — before building the other three or widening any
> screen. The spine is where all the risk lives; the breadth is mostly
> repetition.

A corollary that shapes the whole sequence: **the agent runtime is built once,
headless, in M1.** All eight screens are views over it. Time spent getting M1
right is repaid in every milestone after it.

---

## Milestone map

| # | Milestone | Output | Size |
| --- | --- | --- | --- |
| M0 | Foundations | valid fixture + validator + schema | S |
| M1 | **Runtime core** (headless) | agents actually run | **L — long pole** |
| M2 | Agent Factory | plan → packages | M |
| M3 | Sandbox | packages → proven | L |
| M4 | Scheduler + Activation | proven → live | M |
| M5 | Workspace + Approvals | live → owner in control | L |
| M6 | Calendar, Agents, Integrations | remaining Operate surface | M |
| M7 | Hardening | shippable | M |

Sizes are relative, not calendar. Recalibrate to actual hours available.

---

## M0 — Foundations

**Goal:** load a valid plan in code and prove it is valid.

- [ ] Write `lib/plan/fixtures/brightpath.ts` as a real `ApprovedPlan`
      — 4 BrightPath agents, 2–3 `BusinessOutcome`s, capabilities, policies, limits.
      **Not** `lib/mock/fixtures/workflow-plan.ts`: that file still feeds the
      scripted demo lane and keeps its prose shapes (`PLAN_CONTRACT.md` §7)
- [ ] Implement `validateApprovedPlan()` — all 16 rules from `PLAN_CONTRACT.md` §6
- [ ] Decide storage (the shared `data/db.json` will not survive real runs)
- [ ] Write the schema: `runs`, `run_events`, `approvals`, `packages`,
      `deployments`, `schedules`, `agent_runtime_config`
- [ ] Claim directories; agree shared-file owners with D and YJ

> The two storage items are still open, and they are **the M4 blocker.** The
> only `RunStore` is `InMemoryRunStore`, and no schema exists for any of the
> seven tables above. `RUNTIME_SETUP.md` §3 already states the consequence: a
> paused run and its pending approval must outlive the process, or the approval
> interrupt is defeated. Nothing before M4 is blocked by it.

**Fixture agents — chosen for path coverage, not looks:**

| Agent | Mode | Path it forces |
| --- | --- | --- |
| Service Recovery Coordinator | `act_after_approval` | approval → resume → complete |
| Finance Follow-up | `auto_within_limits` | auto-act, plus limit breach → escalate |
| Admin Operations | `auto_within_limits` | calendar writes, connected tool |
| Marketing | `draft_only` | never acts, always drafts |
| _(broken set)_ | — | throws mid-run · needs a disconnected tool · hangs |

**Exit:** `validateApprovedPlan(fixture)` returns `[]`.

---

## M1 — Runtime core (headless, no UI)

**Goal:** an agent runs end to end, pauses for approval, resumes correctly.

- [ ] **Package format** — what the Factory emits and the runtime consumes.
      Your invention; define it here, before M2
- [ ] **4 reference packages**, hand-written to that format. These double as
      the Factory's target output and the runtime's test fixtures
- [ ] **Executor** — `run(agent, workflow, trigger)` → event stream
- [ ] **Step handlers** — `fetch` · `reason` · `act` · `approve`
- [ ] **Tool mediation** — `ToolClient` interface + stub implementation
      (real one arrives from D later; one injected dependency)
- [ ] **LLM calls (AI&)** — powers `reason` steps
- [ ] **Policy engine** — the six-step resolution order from `PLAN_CONTRACT.md`
      §3.10, implemented exactly and in order
- [ ] **Limit evaluation** — `PolicyLimit` → satisfied / require_approval / block
- [ ] **Approval interrupt** — pause → persist run state → resume on decision
- [ ] **Errors** — retry, backoff, timeout, cancellation
- [ ] **Run persistence** — every run and event stored, replayable

**Exit — one headless test, no UI written:**

Finance Follow-up against stub tools, where
a \$95 invoice sends immediately ·
a \$1,200 invoice pauses and creates an approval ·
a simulated approve resumes the run to completion ·
a write-off always pauses (`alwaysApprove`) ·
a refund is refused outright (`forbidden`).

> Hit that exit and the rest of the project is largely assembly. The approval
> interrupt built here is the same mechanism that powers Sandbox checkpoints
> (M3) and the live Approvals inbox (M5). Build it once.

---

## M2 — Agent Factory · `/app/build`

**Goal:** the plan produces packages automatically instead of by hand.

- [ ] Read `ApprovedPlan` → one build job per agent
- [ ] Generation via Doubleword → emits the M1 package format
- [ ] Job state machine: `queued → generating → validating → completed/failed`
- [ ] Per-agent rebuild keyed on `AgentSpec.version` (never rebuild the whole plan)
- [ ] Build logs, artifact storage, per-agent retry
- [ ] UI: `BuildJobCard`, `BuildLog`, `PackageDrawer`
- [ ] Gate: all agents built → unlock Sandbox

**Exit:** fixture plan → 4 generated packages, and M1's runtime executes them
with **identical results** to the hand-written references. That equivalence
test is the real acceptance criterion, not "the job turned green".

---

## M3 — Sandbox · `/app/sandbox`

**Goal:** prove the workforce behaves before anything touches a real customer.

- [ ] Scenario fixtures in `lib/runtime/sandbox/scenarios.ts` — same lane split
      as the plan fixture: `lib/mock/fixtures/sandbox-scenarios.ts` stays with
      the scripted demo screens and is not extended
- [ ] Run scenarios through the M1 runtime with stubbed tools
- [ ] Live event timeline + output panel
- [ ] Approval checkpoints inside the simulation
- [ ] 20-case stress test + pass rate
- [ ] **Determinism** — fixed seed, fixed clock, stubbed tools, pinned model params
- [ ] Verdict per scenario → overall "ready for activation"
- [x] Daytona isolation — **scenarios genuinely execute inside a remote
      sandbox.** The runner is bundled (`npm run sandbox:bundle`), uploaded, and
      run there; the `ScenarioResult` comes back over stdout and is deep-equal to
      the same scenario run locally — event timestamps and ids included. The seam
      is wired: `SandboxIsolation` carries an optional
      `runScenarioRemotely(scenario)`, `runScenario` prefers it whenever an
      isolation offers one, and every result records which mode earned it
      (`isolation: "in-process" | "remote"`, alongside `packageSource`). Opt-in,
      and off in `npm run verify`. What is NOT done: the 20 stress cases are
      generated rather than named, so the bundle has no definition to resolve —
      they are refused by name rather than silently resolved to something else,
      and only the 24 library scenarios can run remotely

**Exit:** all 4 agents pass, **and** the same scenario yields an identical
verdict across 5 consecutive runs.

> If the verdict is flaky, stop and fix it before moving on. Activation gates
> on this verdict — a flaky gate is no gate.

> Isolation is deliberately *not* part of that exit, and now that it exists that
> stays true. Every tool is stubbed, so no scenario can reach an external system,
> and determinism comes from the injected clock, seeded ids and stubs rather than
> from a remote isolate. What isolation buys is defence against a future
> generator that emits executable code, and evidence that a run happened
> somewhere other than a developer's laptop.

> **What it costs, and when to use it.** Measured on 2026-07-28, region `us`:
> ~5.6s for the first scenario (create 1.4s, upload 1.0s, run), ~0.3s for each
> one after it on the same reused sandbox, **~12s for all 24**. In process the
> same suite is well under a second. `npm run verify:m3` therefore stays local on
> purpose: the exit criterion is five consecutive byte-identical verdicts over 44
> executions each, and paying a round trip per execution would make the criterion
> slow and let a DNS hiccup turn a correct workforce red.
>
> Reach for it when something other than the fixture suite is being proved — an
> untrusted plan, a generator that emits code, or a reviewer who needs the run
> off this machine. For BrightPath it adds cost and no safety.
>
> It fails closed: a misconfigured or unreachable Daytona throws rather than
> quietly returning a local result labelled remote. `npm run daytona:check`
> answers "is isolation actually available" by creating and deleting a real
> sandbox, and names the two failures a fresh organisation hits — a 400 for a
> missing default region and a 403 for a key without create permission. Setup:
> `docs/RUNTIME_SETUP.md` §3a.

---

## M4 — Scheduler + Activation · `/app/deploy`

**Goal:** "live" actually means something.

**Trigger engine (headless)**
- [ ] `schedule` → cron · `event` → listeners · `threshold` → evaluation ·
      `dependency` → ordering — **two of the four run end to end.** All five
      `TriggerSpec` kinds register and can derive a firing
      (`lib/runtime/schedule/triggers.ts`), and the worker drives `schedule` and
      `dependency` from due to run. `eventFirings` and `thresholdFirings` are
      written and proven pure, but **nothing delivers into them**: there is no
      webhook route and no metric poller, so an `event` or `threshold` workflow
      registers, shows as live, and never starts. Listeners need D's integration
      layer (`PLAN_CONTRACT.md` §8 Q3)
- [x] Job queue + worker executing runs in the background —
      `schedule/{queue,worker}.ts`. `runDueWork` is one pass and returns;
      `startPoller` is the daemon. **A process now starts it:**
      `instrumentation.ts` calls `startPollerHost()` (`schedule/poller-host.ts`)
      once per Next server process, so a firing no longer needs a human to POST
      the scheduler route. It is OFF unless `ORIANT_POLLER=on`, refuses
      configuration it cannot read rather than guessing, never throws out of
      `register()`, and is skipped in the edge runtime and during `next build`
- [x] Concurrency, retries, dead-letter — capped lanes, exponential backoff by
      moving `runAfter`, terminal `dead_letter` at `maxAttempts`
- [x] Enforce `quietHours` and `maxRunsPerDay` — `resolveRunStart` gates the
      START, and a refusal settles the job `skipped` with the reason, never
      `failed`. The daily boundary is the agent's own timezone, not UTC
- [x] Idempotency keys — never double-fire a scheduled run. Two layers: the
      queue refuses a second job for a key it holds, and
      `RunStore.claimIdempotencyKey` refuses a second run. Only the second is a
      guarantee, and it is the one M4-3 forces

**Activation screen**
- [ ] Checklist with three inputs: packages built (M2) · sandbox passed (M3) ·
      required integrations connected (**D's registry**) — **the derivation is
      done, the screen is not.** `activationChecklist` re-derives all three on
      every read and each one blocks on its own; `/app/deploy` still renders the
      scripted demo lane (`lib/mock/store`) and reads none of it
- [ ] Blocked states with links to whatever is missing — `ActivationBlocker`
      carries the message, the `href` and the agent or integration at fault.
      Nothing renders them yet
- [x] Go-live: register triggers, flip agents to `active` — `activate()` writes
      triggers, then `AgentRuntimeRecord`s, then the `Deployment`, in that order
      so an interrupted go-live leaves work to finish rather than a record of
      work that never happened. Re-activating the live version writes nothing
- [ ] Transition into Workspace

**Exit:** activate the fixture plan → the Friday sweep fires on schedule → a
run appears with no human involvement.

> **Met, headlessly — `npm run verify:m4`.** M4-1 is that sentence executed:
> `BRIGHTPATH_PLAN` activates behind its three real gates, a `FixedClock` moves
> from 08:30 to 09:00 Asia/Singapore, one call to `runDueWork` claims the job
> that `0 9 * * 5` queued, and a run for `finance-followup/payment-reminder-drafting`
> exists with no decision recorded against it. The other eleven checks are there
> because firing once under laboratory conditions proves almost nothing: one run
> per redelivered trigger at both layers, quiet hours skipping rather than
> failing, the daily cap resetting on the agent's midnight and not UTC, a paused
> run leaving its job `succeeded`, backoff that a retry cannot skip, a
> concurrency ceiling that is also demonstrably parallel, each activation gate
> shutting on its own, and the whole sequence byte-identical on a rerun.
>
> The sweep ends `awaiting_approval`, and that **is** the criterion met — its
> `act` step breaches `invoice.amount <= 500`, so the run pauses for Sarah. A run
> appeared unattended; the decision waiting on her is the product working.
>
> The HTTP surface exists: `GET/POST /api/runtime/activation` (the checklist,
> and go-live returning **409 with the checklist** when a gate blocks) and
> `GET/POST /api/runtime/scheduler` (triggers, queue, one `runDueWork` pass,
> agent pause/resume). The `now` override that lets the Friday sweep be
> demonstrated on a Tuesday is honoured in fixture mode only — in live mode it
> would be a replay button pointed at real customer systems.
>
> What M4 does **not** yet have: the deploy screen, and an inbound path for
> `event` and `threshold` triggers. Storage is no longer the blocker M0 records
> — `lib/runtime/persist/` backs runs, packages and the scheduler on disk, and
> `session.ts` defaults to it. The worker is no longer waiting for a human
> either, as of the poller host above — though `ORIANT_POLLER` is off by default,
> so a deployment that has not opted in still fires nothing on its own.
>
> The one handoff M4 flagged for M5 — `fireDependencies()` must be called
> wherever a paused run resumes, because a worker pass never observes that
> completion — **is wired.** `dependencyFanOut()` (`lib/runtime/approvals.ts`) is
> passed to the executor as `ExecutorOptions.onRunResumed` by
> `app/api/runtime/approvals`, and `verify:m5` M5-7 proves it fires *and* proves
> what its absence costs by running the same decision without it.

---

## M5 — Workspace + Approvals

**Goal:** the owner is genuinely in control. This is the product's core loop.

### Approvals · `/app/workspace/approvals` — build this first

- [ ] Inbox with filters (team, risk, status) — **the inbox is there, the filter
      set is not the one this line names.** `LiveApprovalsScreen` filters by
      agent, by risk and by due/overdue, each showing counts scoped by the other
      two. There is no team filter (`AgentSpec` has no team) and no status filter
      (`RunStore` exposes `listPendingApprovals` and nothing else, so a decided
      approval cannot be listed — only fetched by an id the caller already holds)
- [x] Item card: agent, proposed action, risk level, due time — `ApprovalListCard`,
      with the operation id under the plain-language line and the runtime's own
      `deadline.detail` rendered verbatim rather than recomputed in the browser
- [x] Review drawer: full draft, evidence/context, edit before approving —
      `ReviewDrawer` + `ArgsEditor`. Evidence is the run's trigger, timeline and
      context fetched from `/api/runtime/run`, not a summary; an edit outlines the
      changed fields, lists every before/after, shows the exact merged object, and
      changes the button from "Approve as proposed" to "Approve edited version"
- [x] Approve / reject-with-reason / edit → **resumes the paused M1 run** —
      `POST /api/runtime/approvals` → `decideAndResume`. Proven end to end by
      `verify:m5` M5-1/M5-2/M5-4, including that the EDITED args are what executed
- [x] `ApprovalVersion` recorded when the owner edits — derived, not stored
      (`lib/runtime/approvals.ts`), from the same merge the executor replays, so
      the audit cannot describe an action that never ran
- [x] Overdue handling via `escalateAfterMins` — `approvalDeadline` /
      `overdueApprovals`, clock-free and pure, with an unreadable `dueAt` counted
      as needing attention rather than as time in hand
- [x] Deep link `?focus=<id>` — the live inbox opens the drawer on it and reads
      the approval by id, so the link still resolves after a decision. **Nothing
      links to it yet:** the calendar and the notifications this line names are M6
      and M7

### Workspace · `/app/workspace`

- [x] Stat tiles — active workflows, approvals needed, at risk, scheduled runs.
      Three sources, three failure states, and a tile whose source did not answer
      shows a dash naming the source — never a nought, because zero approvals is
      also what healthy looks like
- [x] Approvals preview, today's schedule, next runs — plus a third list for the
      `event`, `threshold`, `dependency` and `manual` triggers that have no
      `nextFireAt` and would otherwise be live and invisible
- [ ] Daily digest, notifications drawer — neither exists. A drawer needs a
      notification store; there is none
- [ ] **Outcome progress** from `BusinessOutcome.metrics` — baseline → current →
      target — **two of the three.** `OutcomeProgress` renders the target, the
      baseline where the plan has one, and the current value AS UNMEASURED,
      because nothing in `lib/runtime` measures `invoice.days_to_payment` or
      `enquiry.first_response_minutes`: no sample store, no collector, and
      contract §8 Q5 still open on where baselines come from. What is shown
      instead is attribution from `BusinessOutcome.agentIds` — agents assigned,
      triggers live, runs so far, decisions queued — which is real and checkable
- [ ] Ask Oriant command bar, routing via `Capability.id` — absent. Routing a
      command by capability needs a dispatcher that does not exist, and a command
      bar that accepts a sentence and does nothing is worse than none

**Exit — the full loop, no fixtures bypassed:** scheduled run fires → agent
pauses → approval appears → owner edits and approves → run resumes and
completes → Workspace reflects it.

> **Met, headlessly — `npm run verify:m5`.** M5-1 is that sentence executed
> through the real modules in the real order: `BRIGHTPATH_PLAN` activates behind
> its three gates, a `FixedClock` moves 08:30 → 09:00 Asia/Singapore, one
> `runDueWork` pass starts the Friday sweep unattended, its `act` step breaches
> `invoice.amount <= 500`, an approval appears in `pendingApprovals` with four
> hours on its deadline, Sarah edits three arguments forty minutes later and
> approves through `decideAndResume`, the run resumes to `completed` with exactly
> one `gmail.messages.send`, and every read the Operate surface makes comes back
> changed. Nothing is hand-built: every approval in the file was raised by
> `policy.ts` on a run the cron started.
>
> The other eight checks exist because this repo has already spent a round
> deleting assertions that could not go red, so each is paired with the mutation
> that breaks it — verified by mutating the compiled runtime and watching the
> check turn: the edited args are what executed and are **not** the proposal
> (M5-2); a real edit yields a second `ApprovalVersion`, while approving
> unchanged — and echoing the proposal straight back as `editedArgs` — yields
> none (M5-3); reject-with-reason ends the run `refused`, sends nothing, queues
> no dependent and keeps the owner's words (M5-4); a second decision is refused
> twice over —
> sequentially by `ApprovalNotActionableError` before anything is written,
> concurrently by the write-once decision slot, one email either way (M5-5); the
> escalation boundary is inclusive, a minute early is not overdue, and an
> unparseable `dueAt` counts as overdue (M5-6); the chained
> `overdue-invoice-summary` fires on the decision **and demonstrably does not
> without the handoff** (M5-7); a resume against a package with a step inserted
> ahead of the paused one fails the run rather than replaying the approved send
> against the wrong step (M5-8); and the whole loop is byte-identical on a rerun
> (M5-9).
>
> **What M5 does NOT have, stated plainly.**
>
> - **The live UI is opt-in and the scripted demo is still the default.** Both
>   `/app/workspace` and `/app/workspace/approvals` render `components/mock/*`
>   unless asked otherwise — `?live=1`, or `ORIANT_WORKSPACE_LANE` /
>   `ORIANT_APPROVALS_LANE` set to `live`. That is the integration checkpoint
>   below ("keep the fixture path working permanently") honoured rather than a
>   staging post, and an unreadable lane value renders a refusal rather than
>   guessing which screen was meant.
> - **No `current` value is measured for any outcome metric.** See the item
>   above: the number does not exist, so it renders as unmeasured and the rail is
>   hatched rather than filled. Inventing one would put the single fabricated
>   fact on a screen where everything else is evidenced.
> - **`verify:m5` proves the modules the routes call, not the screens.** No
>   component, no route handler and no lane switch is covered by `npm run
>   verify`; M5-1's last clause asserts against `pendingApprovals`,
>   `approvalRecord`, `RunStore.listRuns` and the trigger and job tables, which is
>   the data the screen renders and one layer below its JSON.
> - No realtime: both screens load on mount, on tab visibility and on a button.
>   Push is M7.
> - The `/api/runtime/*` routes are still unauthenticated, exactly as M4 left
>   them. That must be gated before any deployment.
> - `RunStore` has no `listApprovals`, so a "recently decided" section needs an
>   interface change rather than a query.

---

## M6 — Calendar, Agents, Integrations

**Goal:** complete the Operate surface. No dead sidenav links.

- [x] **Calendar** — day + month views, runs and pending approvals as events,
      event states, click through to the approval — and a third source the line
      does not ask for: registered `schedule` triggers, which are the only thing
      on this screen that is about the future. `GET /api/runtime/calendar`
      projects all three into one event shape, resolves every instant to a day
      and a clock time in the plan's own timezone so a browser never re-derives a
      Singapore morning in the reader's zone, and labels the first occurrence of
      a cron `scheduled` and every later one `projected` — a fact and an
      extrapolation are not the same promise. Anything that cannot be placed
      (an unparseable `dueAt`, a frozen cron that no longer schedules) comes back
      in `unplaceable` rather than vanishing into a calm-looking month
- [ ] **Agents** — roster with status and run history, pause/resume/stop,
      read-only view of D's config — **all of it except stop, which does not
      exist and is refused by name rather than quietly mapped onto pause.**
      `AgentRuntimeState` has five values and none of them is stopped; pausing
      already disables every trigger, which is what stopping an agent means here,
      and the one stop-shaped primitive the runtime has is `cancelRun(runId)`.
      An owner who presses "stop" and silently gets a pause has been told
      something untrue about tomorrow morning. Everything else is there: one row
      per agent re-derived on every read from `AgentRuntimeRecord`, the
      SchedulerStore, the RunStore and the plan — never a roster table — with run
      history, today's runs counted against the cap in the agent's own timezone,
      `resolveRunStart` answering "could it start right now", and `AgentSpec`'s
      limits, deny lists, quiet hours and tool grants served read-only
- [ ] **Integrations** — live connections view over D's registry, per-tool
      permissions, which agents use what, expiry/re-auth warnings — **three of
      the four, and the registry is still a stub.** The screen walks every
      agent's `ToolGrant[]`, so it lists exactly the connections the approved
      plan references, attributes each to the agents and operations that depend
      on it, marks read against write from `lib/plan/operations.ts` with an
      unknown operation reported as unknown rather than assumed harmless, and
      takes its blocking rule from `activationChecklist` rather than restating it
      — so "connect this and you can launch" cannot drift from what the go-live
      button actually does. **Expiry and re-authorisation deadlines are rendered
      as unavailable, with the reason**: `IntegrationProvider` answers with one of
      four words and not one timestamp, so there is nothing to count down from
      (`PLAN_CONTRACT.md` §8 Q3). The connection statuses themselves come from
      `StubIntegrationProvider`, whose connected set is a constant, and the screen
      says so on its face rather than reporting eight live connections on a
      machine where nobody ever authorised anything

**Exit:** every sidenav item leads somewhere real.

> **Met on the live lane, and proven headlessly — `npm run verify:m6`.** The exit
> is a sentence about a browser, so the honest headless translation is the half
> that is falsifiable without a DOM: each screen's data is genuinely derived from
> the runtime, and it changes when the runtime changes. The nine checks drive the
> real route handlers through the real screen readers — `fetchRoster`,
> `fetchCalendar`, `fetchConnections`, `submitTransition`, `fetchApprovalRecord`,
> the same modules the components call — against an injected deterministic
> session, so every assertion is about a value the screen would actually hold.
>
> Pausing an agent through the roster's own transition switches off both its
> triggers and moves the row to `paused` while the other agents stay live;
> resuming re-registers from the plan and puts the next Friday back (M6-1). A
> resume the runtime refuses — an agent the plan does not contain, or one whose
> version has moved past what activation proved — comes back **as a refusal**,
> paired with the identical call that succeeds, and leaves the stored record
> exactly as it found it (M6-1). Every
> row's state is the `AgentRuntimeRecord` the runtime stored, and with one agent's
> package missing the packages gate blocks, no record is written and that agent
> reads "never activated" rather than active (M6-2). The calendar projects a
> scheduled trigger at the exact instant the scheduler holds, two runs whose
> states are their own `RunStatus`, and one approval placed at its `dueAt`, in
> chronological order (M6-3). The approval's link carries an id the M5 inbox
> actually resolves through the review drawer's own read, on a lane the shared
> resolver reads as live — and a fabricated id is a 404, so "it resolved" means
> something (M6-4). The same approval read at three instants of the injected clock
> keeps its id and its deadline and changes only its state (M6-5). The connections
> screen lists exactly the plan's eight integrations and blocks on a missing
> required one while a missing optional one stops nothing — matched by a go-live
> that actually refused (M6-6). `0 9 * * 5` in Asia/Singapore lands on two
> Fridays, both labelled 09:00 rather than the 01:00 a UTC reading would print,
> and at 17:00Z — still the 24th in UTC — the calendar's today is the 25th
> (M6-7). The whole surface is byte-identical on a rerun (M6-8), and a read that
> throws is reported as a named failure rather than a stack trace (M6-9).
>
> Each check was confirmed to go red by mutating the compiled runtime: a pause
> that leaves triggers enabled, a refusal answered 200, a roster state that is not
> the record's, a gate that stops blocking, a projection relabelled as a
> commitment, a deep link without `live=1`, a deep link to a plausible wrong id, a
> hard-coded deadline state, a calendar formatted in UTC, an integration silently
> dropped, every grant read as required, and a wall clock or a random source on an
> event id.
>
> **What M6 does NOT have, stated plainly.**
>
> - **All three live screens are opt-in and the scripted demo is still the
>   default.** `/app/workspace/{calendar,agents,integrations}` render
>   `components/mock/*` unless asked otherwise — `?live=1`, or
>   `ORIANT_CALENDAR_LANE` / `ORIANT_AGENTS_LANE` / `ORIANT_INTEGRATIONS_LANE` set
>   to `live`. So the exit sentence is met **on that lane**: by default the
>   sidenav still leads to the scripted screens, which is the integration
>   checkpoint below ("keep the fixture path working permanently") honoured rather
>   than a staging post. `?live=0` forces the demo back, and an unreadable value
>   renders a refusal rather than guessing which screen was meant — the rule now
>   lives once in `components/live/lane.ts` and each surface supplies only its own
>   nouns. None of the five lane variables — the two from M5 and the three here —
>   is documented in `.env.example`, which is where every other switch in this
>   project is explained.
> - **There is no "stop".** See the Agents line above. `POST /api/runtime/agents`
>   refuses `stop` with a 400 explaining why rather than performing a pause.
> - **Integration token expiry, re-authorisation deadlines, connected-at and
>   account identity do not exist** and are rendered as unavailable with a reason
>   each. They arrive with Role D's integration layer (`PLAN_CONTRACT.md` §8 Q3).
>   Until then `needs_approval` is the only re-auth-shaped signal in the system,
>   and it is shown wherever the registry reports it.
> - **Nothing measures an outcome yet**, exactly as M5 recorded. M6 added no
>   measurement and claims none.
> - **`verify:m6` proves the routes and the readers, not the screens.** No React
>   renders in it: no component, no lane switch on a page, no focus order and no
>   pixel is covered. The nine checks stop one layer below the DOM.
> - **`countRunsToday` in `app/api/runtime/agents/route.ts` is a display copy** of
>   a module-private function in `schedule/worker.ts`. Both count the same three
>   things the same way and the worker remains the enforcement; if they ever
>   disagree the worker is right. The fix is one shared helper, and it needs an
>   edit to a file M6 did not own.
> - No realtime: all three screens load on mount, on tab visibility and on a
>   button. Push is M7.
> - The `/api/runtime/*` routes are still unauthenticated, as M4 and M5 left them.
>   The connections route is the sharpest case yet — it reads which tools a
>   business has connected and what its agents may do with them. That must be
>   gated before any deployment.

---

## M7 — Hardening

**Goal:** shippable — which here means the product runs end to end through its own
doors, says what it does not know, and cannot regress quietly.

- [x] **Realtime** — background runs push to Workspace/Approvals without a
      refresh. `GET /api/runtime/events` holds an SSE connection and pushes
      `{ revision, topics }` — a SIGNAL, not a payload: the screen that cares
      refetches the endpoint it already reads, so the push can never drift from
      the thing it describes. It OBSERVES the stores on an interval rather than
      being told by the writers, because an announcement somebody forgets to add
      is a screen that silently stops updating. One timer per process, not per
      connection; all five live screens subscribe through `useRuntimeEvents`, and
      each falls back to its own slow poll and says on its face when it is in that
      state. **Only on the live lane** — the scripted screens push nothing and
      never did
- [ ] Empty, loading, error and blocked states across all 8 screens — **five of
      the eight.** Every live screen distinguishes not-loaded from failed from
      genuinely empty, per source rather than per page (`Loaded<T>`, and the
      `loading` tile state that M7 added so a page no longer opens by reporting
      four failures that have not happened yet). `/app/build`, `/app/sandbox` and
      `/app/deploy` have no live lane at all and still render `components/mock/*`,
      so this line cannot be ticked without claiming three screens that do not
      exist
- [ ] **Notifications** — the derivation is done, the surface is built, and
      **nothing mounts it.** `GET /api/runtime/notifications` derives seven kinds
      from four stores at one instant, stores nothing, links every item somewhere
      real, and declares what it declined to check rather than omitting it — the
      sandbox gate is not funded on a bell's budget, so it is filtered out by id
      and said out loud, because reporting a gate shut on evidence nobody gathered
      would tell every owner their workforce is unproven.
      `components/live/notifications/` holds the reader, the hook and
      `NotificationCenter`. **No screen imports it**, so an owner cannot see any
      of this yet; it is one line in five files and it is not written. External
      delivery — WhatsApp, Telegram, email — is Role D's and does not exist
      (`PLAN_CONTRACT.md` §8 Q3); the route reports that too
- [ ] Performance pass on the dense screens — **not done, and no measurement was
      taken.** Two real decisions were made on performance grounds and are worth
      recording: the change signal is one store walk per PROCESS rather than one
      per screen, only while a client is connected; and the attention list asks
      the store for terminal states (`listRuns({ status })`) instead of shipping
      the whole run log to a browser to find three failures in it. Neither is a
      pass over the dense screens, nobody profiled a render, and this box stays
      empty rather than being ticked for adjacent work
- [ ] Accessibility — focus order, keyboard, contrast — **partial, and unaudited.**
      The live components carry landmark roles, labelled controls and live regions,
      and the drawer traps and restores focus. No audit was run, no contrast ratio
      was measured, and nothing in `npm run verify` renders a DOM, so there is no
      evidence here to point at. Treat this line as untouched work
- [x] **One full end-to-end test: fixture plan → activated → approval decided** —
      `npm run verify:m7`, M7-1

> **Met where it is ticked, and the two ticks are the two the milestone is
> named for.** `npm run verify:m7` is seven checks; the suite is now 120 across
> nine targets and byte-identical on a rerun.
>
> **M7-1 is the exit sentence at full width, walked through the product's own
> doors.** Every milestone before it proved its own layer and stopped: M4 drove
> the scheduler and `activate()`, M5 the executor and the approval interrupt, M6
> three route handlers through three screen readers. None of them ever asked
> whether a plan that validates can be built, proved, activated, fired, paused,
> decided and read back without a human reaching past a door an owner has. M7-1
> asks exactly that: `validateApprovedPlan` returns no errors, `POST
> /api/runtime/build` emits four packages, `POST /api/runtime/sandbox` passes 24
> of 24 scenarios with the stress sweep run, `POST /api/runtime/activation` opens
> all three gates and goes live, one `POST /api/runtime/scheduler` at 09:00
> Asia/Singapore starts the Friday sweep with nobody in the room, it pauses on
> `invoice-amount` and appears in Sarah's inbox with four hours on the clock, she
> edits and approves through the inbox's own POST forty minutes later, the run
> resumes to completed with exactly one `gmail.messages.send`, and the chained
> `overdue-invoice-summary` becomes a run that is now waiting on her. Then all
> four Operate views are read at that instant, through the modules their screens
> call: the Workspace's three loaders and stat tiles, `fetchCalendar`,
> `fetchRoster`, `fetchConnections`, and the M7 attention list. The Factory, the
> Sandbox and Activation had never been exercised over HTTP by any check in this
> repo — `next build` proves they compile, and nothing until now proved they
> answer.
>
> The other six exist because this repo has already spent a round deleting
> assertions that could not go red, so each was confirmed to fail by mutating the
> runtime beneath it and watching the check turn: a change signal that fires on
> every pass and one whose timer never fires at all (M7-2); a blocked gate that
> stops being reported, and the unfunded sandbox gate leaking into the list as a
> false alarm (M7-3); an unreadable `startedAt` that stops counting against the
> cap, and a day boundary keyed to UTC (M7-4); a packages gate that stops blocking
> (M7-5); a random source reaching the id factory (M7-6); and an approvals route
> that drops the owner's edits on the wire (M7-1). M7-7 is about the harness: the
> readers refuse rather than shrug, so a route that renames a field arrives here
> as a thrown error, and M7-7 turns that into a named failure and a short count
> instead of a stack trace.
>
> **M7-2 does not settle for a reconnect.** Revision changes are read across
> connections for the easy arms — a manual run that raises no approval, then the
> cron raising one — but the decision is observed on a connection that is HELD
> OPEN, because `prime()` runs on every connect and a stream whose timer is dead
> would pass a reconnect test while pushing nothing to a screen sitting still. The
> two negatives are asserted as hard as the three positives: a signal that always
> fires is the same as no signal.
>
> **The debt M6 wrote down is paid.** `countRunsToday` and `agentTimezone` are
> exported from `schedule/worker.ts` and there is ONE implementation — M7-4 proves
> it by reading what the roster promises and then making the scheduler keep or
> break that promise, on the two days a second copy would most plausibly have
> diverged: three runs at 01:00 Singapore, which a UTC boundary forgets entirely,
> and a run whose `startedAt` will not parse, which must count AGAINST the cap.
> Each is paired with the control where both halves move the other way. The
> scripted lane's route guard no longer bounces the live lane — an owner whose
> workforce is genuinely activated was being redirected to onboarding because a
> demo they never ran left `journey` at `not_started`. And the five lane variables
> M6 complained were undocumented are in `.env.example`.
>
> **What M7 does NOT have, stated plainly.**
>
> - **The notification centre is built and not mounted.** See the item above. The
>   route, the parser, the hook and the panel are all there and proven; no screen
>   renders any of it, so nothing about this reaches an owner yet.
> - **`ORIANT_EVENTS_INTERVAL_MS` is documented nowhere but in the route that
>   reads it.** It is the one switch M7 added, and it is missing from
>   `.env.example` and `RUNTIME_SETUP.md` — the exact complaint M6 made about the
>   lane variables, made again about a smaller thing.
> - **No performance measurement and no accessibility audit.** Both boxes above
>   are empty on purpose.
> - **`verify:m7` proves the routes and the readers, not the screens.** No React
>   renders in it. The seven checks stop one layer below the DOM, exactly as M5's
>   and M6's do.
> - **The `/api/runtime/*` routes are still unauthenticated**, as M4, M5 and M6
>   left them. There are now eleven of them and two are worse than the rest: the
>   event stream reveals by its timing alone when a business's agents are working,
>   and the notifications route is a single call that reports everything currently
>   wrong with a workforce. This must be gated before any deployment. It is the
>   largest single thing standing between this lane and the word "shippable".
> - **A quiet-hours timezone the platform cannot resolve reaches the roster as a
>   500.** `validateApprovedPlan` refuses such a plan at the handoff gate, so this
>   is unreachable through the front door — but `app/api/runtime/agents/route.ts`
>   guards `countRunsToday` and not the `resolveRunStart` call beside it, and is
>   shielded today only because the first of the two throws first. Found by
>   mutation while proving M7-4; recorded rather than fixed, because the fix is in
>   a file M7 did not own.

---

## Integration checkpoints

Weave these in; do not leave them to the end.

| When | What | Risk if it slips | Status |
| --- | --- | --- | --- |
| During M2 | D's real `ApprovedPlan` replaces the fixture | Low — the validator catches shape drift | ☐ **not started** |
| During M4 | D's real `getToolClient` replaces the stub | Low — one injected dependency | ☐ **not started** |
| Before demo | Full chain: YJ report → D plan → build → sandbox → activate → approve | Medium — needs all three lanes | ◐ **Role C's half is executable** |

**None of the three has been done, and that is the honest headline of this
section.** Every one of them is a handoff, and no handoff has happened yet.

**What each still needs, concretely.**

- **D's `ApprovedPlan`.** Role C needs one real plan object that
  `validateApprovedPlan()` returns `[]` for. `PLAN_CONTRACT.md` §6 lists the 16
  rules and `lib/plan/fixtures/brightpath.ts` is a worked example of every one of
  them. The blocking question is still §8 Q1 — **who authors `StepSpec[]`** — and
  it has not been answered. Nothing on Role C's side changes when the real plan
  arrives except which object is loaded: the validator, the Factory, the sandbox
  and the gates all take a plan as an argument. Two contract questions travel with
  it and are D's to settle, not Role C's: whether an agent may declare itself
  exempt from `globalPolicy.quietHours` (see the note below the dependency table),
  and where a `BusinessOutcome` baseline comes from (§8 Q5).
- **D's `getToolClient`.** One injected dependency —
  `IntegrationProvider.getToolClient(integrationId): ToolClient | null`, plus
  `getIntegrationStatus`. `StubIntegrationProvider` implements it today and the
  runtime handles `null` (an unconnected required tool blocks activation; an
  optional one degrades). What Role C additionally needs from that layer is the
  four things the Integrations screen currently renders as unavailable-with-a-
  reason: **token expiry, re-authorisation deadline, connected-at and account
  identity** (§8 Q3). None of them is inventable here, and the screen says so
  rather than showing a plausible number.
- **The full chain.** Role C's segment of it runs today, unattended and headless,
  as `npm run verify:m7` M7-1 — build → sandbox → activate → fire → approve →
  resume. The two ends are not wired: nothing turns a YJ report into a D plan, and
  no D plan reaches `lib/plan`. Wiring the seam is one function on each side; the
  rehearsal it needs is a whole afternoon with all three lanes in the room, and it
  has not been booked.

**Keep the fixture path working permanently.** It is the fallback, the test
harness, and what carries the demo if another lane slips. This was honoured
rather than treated as a staging post: every live screen is opt-in and the
scripted demo is still what `/app/*` renders by default.

---

## Top risks

| Risk | Mitigation |
| --- | --- |
| **Approval interrupt** — persist/resume is subtle | Build in M1, headless, with tests. Do not discover these bugs through a UI |
| **Sandbox flakiness** | Determinism is an M3 *exit criterion*, not a nice-to-have |
| **Scheduler double-fires or misses runs** | Idempotency keys per run; test explicitly |
| **D pushes back on `StepSpec[]`** | Chase `PLAN_CONTRACT.md` §8 Q1 this week — the only true rework risk |
| **Scope: 8 screens + a runtime** | Cut list below, decided in advance |

> **How they landed.** Three of the five were retired with evidence: the approval
> interrupt is `verify:m5` (nine checks, each paired with the mutation that breaks
> it), sandbox flakiness is `verify:m3`'s five consecutive byte-identical
> verdicts, and the double-fire risk is `verify:m4` M4-2/M4-3 — one run per
> re-delivered trigger at both the queue and the store. Scope was managed: five of
> the eight screens exist on the live lane and three do not, which is the shape the
> cut list predicted. **`StepSpec[]` is the one risk that neither materialised nor
> retired** — §8 Q1 was never answered, so the rework it threatens is still
> outstanding rather than avoided.

## Cut list — decide now, not at 2am

1. **Calendar** — largely a second view of approvals data
2. **Agents roster** — fold status into Workspace
3. **Stress test** — keep single-scenario runs, drop the 20-case sweep
4. **Outcome progress charts** — show current values as numbers, skip trends

**Never cut:** the runtime, the approval interrupt, Activation. Those *are* the
product.

> Items 1 and 2 were **not** cut — M6 built both — and item 1's reasoning turned
> out to be wrong, which is worth recording rather than quietly deleting. The
> calendar is not a second view of approvals data: approvals are one of its three
> sources, and the other two (what a registered trigger will do next, and what
> runs actually did) appear on no other screen. Item 3 stands as written, and item
> 4 is what M5 shipped for a different reason — the current value is not skipped,
> it is unmeasured.

---

## Closing status — what a reader can rely on

M0 through M7 are done and the last one is the end of the plan. This section is
the honest summary a reader should start from, because **the checklists above are
the original ask, not the record.** Most boxes in M0–M6 were deliberately left as
written; the `>` block under each milestone is where the truth lives, and it says
what was built, what was not, and why. Where a box IS ticked, it was ticked
against evidence.

**The evidence is `npm run verify` — 120 checks across nine targets, green, and
byte-identical on a rerun.** It compiles the relevant slice of `lib/` with the
repo's own TypeScript and runs it: no test runner, no extra dependency, no
network, no disk outside a temp directory. Every target declares how many checks
it must produce, so a check that quietly disappears cannot pass as green. Every
check in M4 through M7 was confirmed to go RED by mutating the runtime beneath it
— that is a house rule here, not a flourish.

| Target | What it proves |
| --- | --- |
| `verify:m0` (27) | the plan contract's 16 rules, and a fixture that satisfies them |
| `verify:m1` (19) | the executor, the policy engine and the approval interrupt |
| `verify:m2` (13) | generated packages run identically to the hand-written references |
| `verify:m3` (11) | the same scenario yields the same verdict five times running |
| `verify:m4` (17) | the cron fires unattended, once, inside quiet hours and the daily cap |
| `verify:m5` (9) | the core loop: pause → edit → approve → resume → complete |
| `verify:m6` (9) | the calendar, roster and connections are derived from the runtime |
| `verify:m7` (7) | the whole product end to end, realtime, notifications, gates |
| `verify:int` (8) | the real modules agree with each other end to end |

**What a reader can rely on.** The runtime is real and headless: agents execute,
policy stops them, approvals pause and resume runs, and everything survives the
process (`lib/runtime/persist/`). The scheduler fires on its own once
`ORIANT_POLLER=on`. Activation genuinely gates on three independently derived
pieces of evidence and refuses by explaining which one shut. Eleven HTTP routes
serve all of it, and five live screens read them. The whole thing is
deterministic: a fixed clock and seeded ids in, byte-identical output out.

**What is still open, in the order it matters.**

1. **The `/api/runtime/*` routes are unauthenticated.** All eleven. This is the
   one item that makes "shippable" untrue as written, and it was never in a
   milestone's scope because the auth scheme belongs with whoever owns the
   deployment.
2. **The live screens are opt-in and the scripted demo is the default.**
   `/app/workspace` and its four children render `components/mock/*` unless asked
   otherwise — `?live=1`, or the per-surface `ORIANT_*_LANE` variable. That is the
   integration checkpoint above honoured on purpose. `/app/build`, `/app/sandbox`
   and `/app/deploy` have no live lane at all: the derivations behind Activation
   exist and are proven, the screen was never built.
3. **The notification centre is built and mounted nowhere**, and nothing delivers
   a notification anywhere. External delivery over WhatsApp, Telegram or email is
   Role D's integration layer (`PLAN_CONTRACT.md` §8 Q3) and has not landed.
4. **No outcome metric has a live `current` value.** Nothing in `lib/runtime`
   measures `invoice.days_to_payment` or `enquiry.first_response_minutes`: no
   sample store, no collector, and §8 Q5 still open on where baselines come from.
   The rail renders hatched and says "unmeasured" rather than showing the one
   fabricated number on a screen where everything else is evidenced.
5. **`event` and `threshold` triggers register, show as live, and never fire.**
   The firing derivations are written and pure; nothing delivers into them,
   because there is no webhook route and no metric poller. Both need D's
   integration layer.
6. **The 20-case stress sweep cannot run in a remote sandbox.** Daytona isolation
   works and is proven for the 24 named library scenarios; the stress cases are
   generated rather than named, so the uploaded bundle has no definition to
   resolve and refuses them BY NAME rather than silently running something else.
   `npm run verify` stays local on purpose either way — see M3.
7. **Nothing here has been rehearsed with D or YJ.** See the integration
   checkpoints: all three are still open, and the full-chain rehearsal has not
   been booked.

**Two smaller debts, recorded so they are not rediscovered.**
`ORIANT_EVENTS_INTERVAL_MS` is documented only inside the route that reads it, and
`app/api/runtime/agents/route.ts` guards `countRunsToday` against an unresolvable
timezone but not the `resolveRunStart` call beside it — unreachable through the
front door, since the validator refuses such a plan, and one layer thin all the
same.

---

## Open dependencies on other lanes

| Need | From | Blocks | Status |
| --- | --- | --- | --- |
| `ApprovedPlan` sign-off, and D's planner emitting one (`PLAN_CONTRACT.md` §7 steps 1–2) | D | nothing (`brightpath.ts` covers it) | ☐ |
| `getToolClient()` signature | D | M4 real tools (stub unblocks M1) | ☐ |
| Operation vocabulary registry | D | runtime enforcement polish | ☐ |
| May an agent's `quietHours` ever be **looser** than `globalPolicy.quietHours`? (`PLAN_CONTRACT.md` §3.1, §3.10) | D | nothing today — the union is enforced and proven by `verify:m4` M4-4 | ☐ |
| Outcome baselines in the company report | YJ | M5 outcome progress | ☐ |

**All five are still open at the end of M7, and none of them blocked a milestone.**
That is the point of the design rather than luck: every one arrives over an
injected seam, so the fixture stands in for it and the swap is one argument. Two
have a visible cost today and are named on the screens that pay it — the missing
outcome baselines are why `OutcomeProgress` renders `current` as unmeasured, and
the missing integration layer is why the Integrations screen reports token expiry
and account identity as unavailable rather than inventing them. The operation
vocabulary registry is the mildest: `lib/plan/operations.ts` holds Role C's
working copy, and an operation it does not know is reported as unknown rather than
assumed harmless, so D's registry replacing it tightens enforcement rather than
enabling it.

**On the quiet-hours question.** §3.1 says `globalPolicy` "applies to every agent
unless the agent is stricter", and for a restriction stricter can only mean quiet
for *longer*. `resolveRunStart` now reads it that way: quiet hours are the UNION
of the agent's window and the plan's, so an agent cannot escape an org-wide floor
merely by mentioning quiet hours at all. That closes a real hole — and it closes
an escape hatch the fixture was using. `service-recovery` declares a degenerate
`00:00–00:00` window specifically to opt out of BrightPath's 18:00–09:00 block,
because a complaint landing at 7pm must not wait until morning; under the union
that window is simply never quiet on its own and the org-wide one still refuses
the run. M4-4 asserts exactly that, so the behaviour is pinned rather than
drifting.

The contract has no way to say what the fixture was trying to say. Either an
agent may declare itself exempt — in which case §3.1 needs a word for it and the
runtime needs a field that is not a degenerate time range — or it may not, in
which case the fixture's comment at `brightpath.ts` is stale and the
service-recovery agent genuinely cannot answer a 7pm complaint until 9am. That is
D's call, not Role C's: it is a question about what the plan is allowed to
express. Role C's position is that a silent exemption expressed as `00:00–00:00`
is the wrong mechanism either way — it is indistinguishable from a typo.
