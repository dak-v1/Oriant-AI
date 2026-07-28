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

- [ ] Rewrite `lib/mock/fixtures/workflow-plan.ts` as a real `ApprovedPlan`
      — 4 BrightPath agents, 2–3 `BusinessOutcome`s, capabilities, policies, limits
- [ ] Implement `validateApprovedPlan()` — all 16 rules from `PLAN_CONTRACT.md` §6
- [ ] Decide storage (the shared `data/db.json` will not survive real runs)
- [ ] Write the schema: `runs`, `run_events`, `approvals`, `packages`,
      `deployments`, `schedules`, `agent_runtime_config`
- [ ] Claim directories; agree shared-file owners with D and YJ

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

- [ ] Scenario fixtures (extend `lib/mock/fixtures/sandbox-scenarios.ts`)
- [ ] Run scenarios through the M1 runtime with stubbed tools
- [ ] Live event timeline + output panel
- [ ] Approval checkpoints inside the simulation
- [ ] 20-case stress test + pass rate
- [ ] **Determinism** — fixed seed, fixed clock, stubbed tools, pinned model params
- [ ] Verdict per scenario → overall "ready for activation"
- [ ] Daytona isolation

**Exit:** all 4 agents pass, **and** the same scenario yields an identical
verdict across 5 consecutive runs.

> If the verdict is flaky, stop and fix it before moving on. Activation gates
> on this verdict — a flaky gate is no gate.

---

## M4 — Scheduler + Activation · `/app/deploy`

**Goal:** "live" actually means something.

**Trigger engine (headless)**
- [ ] `schedule` → cron · `event` → listeners · `threshold` → evaluation ·
      `dependency` → ordering
- [ ] Job queue + worker executing runs in the background
- [ ] Concurrency, retries, dead-letter
- [ ] Enforce `quietHours` and `maxRunsPerDay`
- [ ] Idempotency keys — never double-fire a scheduled run

**Activation screen**
- [ ] Checklist with three inputs: packages built (M2) · sandbox passed (M3) ·
      required integrations connected (**D's registry**)
- [ ] Blocked states with links to whatever is missing
- [ ] Go-live: register triggers, flip agents to `active`
- [ ] Transition into Workspace

**Exit:** activate the fixture plan → the Friday sweep fires on schedule → a
run appears with no human involvement.

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

- [ ] Send `PLAN_CONTRACT.md` to D; chase §8 Q1 (who authors `StepSpec[]`) specifically
- [ ] Write the `ApprovedPlan` fixture — 4 agents, mixed modes, one broken
- [ ] Implement `validateApprovedPlan()`; get it to `[]`
- [ ] Decide storage and write the schema
- [ ] Begin M1: package format + executor skeleton

---

## Open dependencies on other lanes

| Need | From | Blocks | Status |
| --- | --- | --- | --- |
| `ApprovedPlan` sign-off | D | nothing (fixture covers it) | ☐ |
| `getToolClient()` signature | D | M4 real tools (stub unblocks M1) | ☐ |
| Operation vocabulary registry | D | runtime enforcement polish | ☐ |
| Outcome baselines in the company report | YJ | M5 outcome progress | ☐ |

None of these block the start of M1.
