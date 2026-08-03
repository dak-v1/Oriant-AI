# Oriant — submission

## 1. Short summary

Oriant turns a conversation about your business into a working AI workforce. A
small-business owner describes how they operate; Oriant drafts a team of agents,
proves each one in a sandbox, and puts them live against the owner's real Gmail
and Calendar. The point of difference is restraint: every agent prepares work and
stops, and nothing reaches a customer until a human approves it. It is built for
owners who cannot afford an ops hire and cannot risk an autonomous one.

---

## 2. Full write-up

### The problem

Small businesses lose hours a week to work that is repetitive but not safe to
automate blindly — answering the same customer questions, chasing the same
appointments, sending the same campaigns. The tools that promise to automate it
either need a developer, or they act on their own and give the owner no way to
see what they are about to do. The interesting problem is not "can a model draft
a reply". It is: **how do you let something act on a real business without the
owner losing control of it?**

### The approach

We treated the agent as untrusted and built the product around the gates rather
than the model.

**A plan is a contract, not a prompt.** `ApprovedPlan` is a validated structure —
agents, workflows, step sequences, tool grants, policy limits, the organization
that owns it. Seventeen validator rules refuse a plan that cannot be enforced. If
a limit exists only in prose it is not a limit, so it is rejected.

**Policy resolves in a fixed order, and fails closed.** Every action passes six
checks: forbidden → not granted → always-approve → draft-only → act-after-approval
→ auto-within-limits. A limit whose metric was never measured counts as breached,
not satisfied. Absence of evidence is never treated as safety.

**The approval interrupt is real.** When an action needs a human, the run freezes:
the invocation is persisted with its arguments, the run stops, and it resumes by
replaying exactly the frozen call after the owner decides. That is why storage is
Postgres rather than memory — a run paused for four hours must outlive the process
it paused in.

**Nothing goes live on a button.** Activation re-derives three gates on every read
— packages built, sandbox passed, required integrations connected — and refuses
with the specific blocker. There is no force flag anywhere in the codebase.

### Evidence

The runtime is covered by an executable suite rather than assertions in a
document: **215 checks across 15 targets** (`npm run verify`), plus **12 checks
executing real SQL** against Supabase (`npm run verify:pg`). The harness enforces
a tripwire — each target declares its expected check count, so a silently deleted
check fails the build.

Three findings are worth naming because they show what the tests are for.

A collector bug shipped where the claim marker lived in `consumed_at` while the
upstream writer only resets `status`. The first collection of a plan worked and
**every revision after it was invisible forever** — with the whole suite green,
because nothing had ever collected the same plan twice. `COLLECT-3` is now that
second cycle; reintroducing the bug turns it red.

`GET /api/runtime/agents` hung after one request. It was not the framework or the
data: issuing more concurrent queries than the connection pool holds wedges it
permanently against the Supabase pooler. Reproduced in isolation (`max=5` with 6
concurrent → second batch never returns; `max=6` → fine), fixed with a gate that
keeps in-flight work at or below the pool size, and guarded by `PG-12`.

The organization allowlist was first enforced per route. An audit found five more
paths reaching live execution — activation, run, approvals, scheduler, the
background poller — while the gate's own comment claimed it covered them all. It
now lives at the single function that produces a live tool client, which covers
routes not yet written.

Live behaviour was verified against a real account: the helpdesk agent read the
actual Gmail inbox, reasoned with a real model, and froze its send for approval.
The sandbox generates its scenarios from whatever plan it is given — for this
workforce, 3 smoke scenarios and 41 stress cases, all passing, with the helpdesk
case reporting `awaiting_approval`, which is the guarantee under test.

### Constraints, limitations and incomplete areas

We would rather state these than have them found.

- **Six of ten app pages are still the scripted demo lane** — discovery,
  onboarding, planner, integrations, setup, workspace. Build, Sandbox, Activation
  and Pipeline are live against the runtime. The Operate screens have live
  implementations reachable via `ORIANT_OPERATE_LANE=live` or `?live=1`.
- **A real send has not been completed end to end.** Everything up to the approval
  is verified against live Gmail; the final approved send has not been exercised.
- **`/api/runtime/*` is unauthenticated**, and so is the planner's
  `finalize-handoff`. The organization allowlist is a stopgap, not auth.
- **HubSpot and QuickBooks cannot be served.** Composio publishes no invoice,
  payment, refund or note tool for either (checked with full pagination). Plans
  needing them are refused by name rather than silently degraded.
- **Event triggers have no production ingress.** The scheduler polls; a webhook
  path does not exist, so the helpdesk agent sweeps every five minutes instead of
  reacting instantly.
- **One act step is one tool call.** Nothing fans an action out over a list.

### What we would improve next

Authentication first — it is the one gap that makes the rest of the safety work
theoretical. Then the remaining demo screens onto the runtime, so the whole
journey shows one workforce. Then a Gmail push ingress to replace polling, and
argument fan-out so one approval can cover a batch. Longer term, the plan contract
should carry the tool schemas it will be executed against, so a plan that cannot
run is refused at approval rather than discovered at the first act step.

---

## 3. Repository review guide

### Start here

| Path | What it contains | What it demonstrates |
| --- | --- | --- |
| `docs/PLAN_CONTRACT.md` | The `ApprovedPlan` contract between planning and runtime | The data model everything else enforces |
| `lib/plan/validate.ts` | 17 validator rules, each with its reasoning | Why a plan is refused rather than repaired |
| `lib/runtime/policy.ts` | The six-step resolution order | The fail-closed decision at the centre of the product |
| `lib/runtime/executor.ts` | The workflow executor and the approval interrupt | How a run freezes, persists and resumes on the frozen invocation |
| `lib/runtime/schedule/activation.ts` | The three go-live gates | Evidence-based activation with no force path |

### The seams

| Path | What it contains | What it demonstrates |
| --- | --- | --- |
| `lib/plan/ingest/from-handoff.ts` | Planning → runtime conversion | Every ingested agent forced to `draft_only`, gaps recorded not guessed |
| `lib/runtime/pipeline/source.ts` | The handoff claim protocol | An atomic conditional claim; the header documents a shipped bug and its fix |
| `lib/runtime/pipeline/run.ts` | The six-stage pipeline | collect → ingest → validate → build → prove → activate |
| `lib/runtime/tools/organization.ts` | Whose credentials, and whether this deployment may act | The single chokepoint the allowlist is enforced at |
| `lib/runtime/tools/composio.ts` | Real tool execution | Capability→tool mapping; unroutable capabilities refuse by name |

### Evidence

| Path | What it contains |
| --- | --- |
| `scripts/verify.mjs` | The harness and its expected-check tripwire |
| `lib/runtime/verify/gmail-workforce.ts` | The working workforce proven end to end through the real pipeline |
| `lib/runtime/verify/collect.ts` | The handoff protocol, including the redeploy cycle a shipped bug broke |
| `lib/runtime/verify/pg.ts` | Real SQL against Supabase, including the pool-wedge regression |
| `lib/runtime/sandbox/smoke.ts` | Scenario and stress generation from an arbitrary plan |
| `lib/plan/fixtures/meridian.ts` | The two-agent workforce this account can actually run |
| `docs/STORAGE.md` | Storage decisions, schema and known limitations |

### Running it

```bash
npm install
npm run dev          # http://localhost:3000
npm run verify       # 215 checks, no credentials required
npm run build
```

**A clean clone runs with an empty `.env`.** Fixture mode and file storage are the
defaults: no keys, no database, no network. `npm run verify` passes as-is.

Optional, each additive:

| Variable | Effect |
| --- | --- |
| `ORIANT_RUNTIME_MODE=live` | Real model for reasoning steps (needs the AI& block) |
| `ORIANT_RUNTIME_TOOLS=composio` | Real tool execution — **defaults off, and off means nothing leaves the machine** |
| `ORIANT_ORGANIZATION_ID` / `ORIANT_ALLOWED_ORGANIZATION_IDS` | Whose connections, and which are permitted |
| `ORIANT_RUNTIME_STORAGE=postgres` + `DATABASE_URL` | Supabase; `npm run verify:pg` then runs |
| `ORIANT_OPERATE_LANE=live` | Operate screens read the runtime instead of the demo |
| `ORIANT_POLLER=on` | Schedules fire unattended |

`.env` and `.env.local` are gitignored; `.env.example` carries names and
explanations only, never values. No credentials are committed.

### External dependencies

Composio (tool execution and OAuth), Supabase (Postgres and planner data), and an
OpenAI-compatible model endpoint. All three are optional — with none configured
the product runs in fixture mode end to end, which is how the test suite runs.
