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
      `startPoller` is the daemon. **No process starts the poller yet** — no
      route or server hook calls into `lib/runtime/schedule` at all
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
> What M4 does **not** yet have: the deploy screen, an inbound path for `event`
> and `threshold` triggers, and any process that runs the worker on its own.
> `startPoller()` exists but nothing calls it, so in a deployed build every
> firing still needs someone to POST the scheduler route.
> Storage is no longer the blocker M0 records — `lib/runtime/persist/` backs
> runs, packages and the scheduler on disk, and `session.ts` defaults to it.
>
> One handoff for M5, easy to miss and silent when missed:
> `fireDependencies()` must be called wherever a paused run resumes, because a
> worker pass never observes that completion. On BrightPath the sweep pausing
> for approval is the *ordinary* path, so anything chained behind it only
> becomes due once the owner decides.

---

## M5 — Workspace + Approvals

**Goal:** the owner is genuinely in control. This is the product's core loop.

### Approvals · `/app/workspace/approvals` — build this first

- [ ] Inbox with filters (team, risk, status)
- [ ] Item card: agent, proposed action, risk level, due time
- [ ] Review drawer: full draft, evidence/context, edit before approving
- [ ] Approve / reject-with-reason / edit → **resumes the paused M1 run**
- [ ] `ApprovalVersion` recorded when the owner edits
- [ ] Overdue handling via `escalateAfterMins`
- [ ] Deep link `?focus=<id>` from calendar and notifications

### Workspace · `/app/workspace`

- [ ] Stat tiles — active workflows, approvals needed, at risk, scheduled runs
- [ ] Approvals preview, today's schedule, next runs
- [ ] Daily digest, notifications drawer
- [ ] **Outcome progress** from `BusinessOutcome.metrics` — baseline → current → target
- [ ] Ask Oriant command bar, routing via `Capability.id`

**Exit — the full loop, no fixtures bypassed:** scheduled run fires → agent
pauses → approval appears → owner edits and approves → run resumes and
completes → Workspace reflects it.

---

## M6 — Calendar, Agents, Integrations

**Goal:** complete the Operate surface. No dead sidenav links.

- [ ] **Calendar** — day + month views, runs and pending approvals as events,
      event states, click through to the approval
- [ ] **Agents** — roster with status and run history, pause/resume/stop,
      read-only view of D's config
- [ ] **Integrations** — live connections view over D's registry, per-tool
      permissions, which agents use what, expiry/re-auth warnings

**Exit:** every sidenav item leads somewhere real.

---

## M7 — Hardening

- [ ] Realtime — background runs push to Workspace/Approvals without a refresh
- [ ] Empty, loading, error and blocked states across all 8 screens
- [ ] Notifications
- [ ] Performance pass on the dense screens
- [ ] Accessibility — focus order, keyboard, contrast
- [ ] One full end-to-end test: fixture plan → activated → approval decided

---

## Integration checkpoints

Weave these in; do not leave them to the end.

| When | What | Risk if it slips |
| --- | --- | --- |
| During M2 | D's real `ApprovedPlan` replaces the fixture | Low — the validator catches shape drift |
| During M4 | D's real `getToolClient` replaces the stub | Low — one injected dependency |
| Before demo | Full chain: YJ report → D plan → build → sandbox → activate → approve | Medium — needs all three lanes |

**Keep the fixture path working permanently.** It is the fallback, the test
harness, and what carries the demo if another lane slips.

---

## Top risks

| Risk | Mitigation |
| --- | --- |
| **Approval interrupt** — persist/resume is subtle | Build in M1, headless, with tests. Do not discover these bugs through a UI |
| **Sandbox flakiness** | Determinism is an M3 *exit criterion*, not a nice-to-have |
| **Scheduler double-fires or misses runs** | Idempotency keys per run; test explicitly |
| **D pushes back on `StepSpec[]`** | Chase `PLAN_CONTRACT.md` §8 Q1 this week — the only true rework risk |
| **Scope: 8 screens + a runtime** | Cut list below, decided in advance |

## Cut list — decide now, not at 2am

1. **Calendar** — largely a second view of approvals data
2. **Agents roster** — fold status into Workspace
3. **Stress test** — keep single-scenario runs, drop the 20-case sweep
4. **Outcome progress charts** — show current values as numbers, skip trends

**Never cut:** the runtime, the approval interrupt, Activation. Those *are* the
product.

---

## This week

- [ ] Send `PLAN_CONTRACT.md` to D; chase §8 Q1 (who authors `StepSpec[]`)
      specifically. §7 changed — the structured types live in `lib/plan/types.ts`
      and steps 1–2 are now D's to do — so per §10 this goes over as a pull
      request both lanes review, not as a link
- [ ] Write the `ApprovedPlan` fixture — 4 agents, mixed modes, one broken
- [ ] Implement `validateApprovedPlan()`; get it to `[]`
- [ ] Decide storage and write the schema
- [ ] Begin M1: package format + executor skeleton

---

## Open dependencies on other lanes

| Need | From | Blocks | Status |
| --- | --- | --- | --- |
| `ApprovedPlan` sign-off, and D's planner emitting one (`PLAN_CONTRACT.md` §7 steps 1–2) | D | nothing (`brightpath.ts` covers it) | ☐ |
| `getToolClient()` signature | D | M4 real tools (stub unblocks M1) | ☐ |
| Operation vocabulary registry | D | runtime enforcement polish | ☐ |
| May an agent's `quietHours` ever be **looser** than `globalPolicy.quietHours`? (`PLAN_CONTRACT.md` §3.1, §3.10) | D | nothing today — the union is enforced and proven by `verify:m4` M4-4 | ☐ |
| Outcome baselines in the company report | YJ | M5 outcome progress | ☐ |

None of these block the start of M1.

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
