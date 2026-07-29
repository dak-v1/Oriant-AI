# Runtime setup — which key, what for, and when

**Owner:** Role C (`perynn/RoleC`) · **Template:** [`.env.example`](../.env.example)

The short version, and the most important fact on this page:

> **You can build, test and demo all of M1-M3 with zero configuration.**
> No API key. No database. No `.env.local` at all.

Everything below is about what changes once you *want* the runtime to talk to
something outside this process.

---

## 1. Zero-configuration start

```bash
npm install
npm run verify:m1  # the M1 exit criteria, headless, no keys, exits non-zero on failure
npm run dev        # → http://localhost:3000
```

That is the whole setup. The runtime is headless through M1, so `verify:m1` —
not the dev server — is what actually exercises it; `npm run dev` serves the
existing screens. With no `.env.local` the runtime uses:

| Dependency | Default implementation | Consequence |
| --- | --- | --- |
| `Reasoner` | `FixtureReasoner` | `reason` steps return canned, deterministic results |
| `IntegrationProvider` | `StubIntegrationProvider`, handing out `StubToolClient` | every read operation in `lib/plan/operations.ts` answers with shaped fake data; every write is logged and simulated, never performed |
| `RunStore` · `BuildStore` · `SchedulerStore` | the file-backed stores under `data/runtime/` | runs, approvals, packages, triggers and queued jobs survive a restart, with no database and no setup step. `ORIANT_RUNTIME_STORAGE=memory` opts out; see §2a |
| `Clock` / `newId` | `FixedClock` + `createIdFactory(seed)` in sandbox and tests; `SystemClock` + unseeded `createIdFactory()` elsewhere | identical timestamps and ids across repeat runs **only with the seeded pair** — an ordinary dev-server run uses wall time and `crypto.randomUUID()` |

This is not a degraded mode. It is the mode the sandbox verdict (M3) and the
equivalence test (M2) are defined against, and it is the fallback that carries
the demo if another lane slips. It stays supported permanently.

---

## 2. The two runtime modes

One switch: `ORIANT_RUNTIME_MODE`.

```bash
# fixture (the default — unset, blank, or anything that is not exactly "live")
ORIANT_RUNTIME_MODE=fixture

# live
ORIANT_RUNTIME_MODE=live
```

| | `fixture` | `live` |
| --- | --- | --- |
| `reason` steps | `FixtureReasoner`, canned | AI& chat completions |
| `fetch` / `act` steps | `StubToolClient` | real clients via Role D's `getToolClient()` |
| Network calls | none | yes |
| Determinism | guaranteed when paired with `FixedClock` + seeded `newId` | not guaranteed |
| Keys needed | none | AI&, plus the tool credentials each workflow touches |

**Composition root:** [`lib/runtime/session.ts`](../lib/runtime/session.ts),
reached through `getRuntimeSession()`. That is the one place the mode is read
and the one place the dependencies above are chosen.

Switching modes changes **which dependencies are injected**, nothing else. The
executor, the policy engine, the limit evaluation and the approval interrupt
are identical in both modes — that is the point of the injection seam.

The mode is read fail-closed: an unrecognised value is treated as `fixture`,
never as `live`.

> **Wiring note.** `runtimeMode()` in `lib/runtime/session.ts` reads the
> variable once: only the exact string `live` selects live mode; unset, blank
> or anything else yields `fixture`. `createSession()` then picks the reasoner
> directly — `new AiAndReasoner()` for `live`, `new FixtureReasoner()`
> otherwise. There is no string-keyed reasoner factory in between, so there is
> no intermediate enum a raw env value could be threaded into to land on the
> fixture branch by accident. Live must fail loudly and fixture must be the
> default; that is what this shape buys. The session is built once per process
> and cached on `globalThis`, so if you change the variable, call
> `resetRuntimeSession()` to make the next call re-read it.

> This switch is separate from the older per-provider fallback in
> `lib/server/providers/env.ts`, which powers the `/demo` lane and drops each
> provider to fixture independently when its keys are missing. The two govern
> different lanes and do not interact.

---

## 2a. Where the runtime keeps what it learns

The second switch `lib/runtime/session.ts` reads, and the reason §1 can promise
zero configuration through M4 and beyond. Full decision record:
[`STORAGE.md`](./STORAGE.md).

```bash
ORIANT_RUNTIME_STORAGE=      # blank or "file" (default) · "memory" · anything else THROWS
ORIANT_RUNTIME_DATA_DIR=     # blank = <cwd>/data/runtime
```

| | `file` (default) | `memory` |
| --- | --- | --- |
| Where | one JSON file per record under `data/runtime/`, written atomically | a `Map` per store |
| Survives a restart | yes — runs, events, approvals, decisions, packages, triggers, queued jobs, deployments, agent state | no |
| Setup | none. Directories are created on first write, `data/` is already gitignored | none |
| Use it for | everything | a throwaway experiment |

**Durable is what you get for free, and that is the whole point.** M0 called
storage the M4 blocker, and §3 used to carry the consequence in one sentence:
without durability *"a paused run and its pending approval vanish on restart,
which defeats the approval interrupt."* That sentence lives here now, and it
describes `memory` rather than the default. It is not a hypothetical — an agent
pauses mid-workflow, asks the owner a question, and waits, and
`escalateAfterMins` on the fixture agents is four hours. A restart inside that
window throws away the run, the approval, and the idempotency claim that stopped
the trigger firing again.

**An unrecognised value throws, unlike `ORIANT_RUNTIME_MODE`.** The asymmetry is
deliberate and is spelled out in `session.ts`: for the reasoner the dangerous
default is "does something", for storage it is "forgets something".
`ORIANT_RUNTIME_STORAGE=postgres` is a thing somebody will type the day
`STORAGE.md` §7 is taken up, and silently treating it as `file` would give them a
green server that is not using the database they just configured.

`ORIANT_RUNTIME_DATA_DIR` moves that directory. Relative values resolve against
the working directory; absolute is what two processes started from different
places need, or each gets a private copy of every run and neither sees the
other's queue claims. The directory is not encrypted and not access-controlled —
run context holds customer names, invoice amounts and draft email bodies — so
keep it off synced folders (`STORAGE.md` §6).

The tests and the sandbox do not come through here at all: `lib/runtime/verify/*`
and `lib/runtime/sandbox/runner.ts` construct `InMemoryRunStore`, `FixedClock`
and a seeded `createIdFactory()` explicitly, because determinism is an M3 exit
criterion and a store that touches a disk is neither deterministic nor fast.

---

## 3. Milestone → what becomes necessary

| Milestone | Keys that become necessary | What degrades without them |
| --- | --- | --- |
| **M0** Foundations | none | nothing. Fixture plan, validator, schema — all local |
| **M1** Runtime core | none for fixture. `AIAND_*` **only** for `live` | in `live`, wiring throws `ReasonerConfigError` before any run starts. Fixture mode unaffected: the full M1 exit (send at \$95, pause at \$1,200, resume on approve, always-approve write-off, refused refund) passes with no keys |
| **M2** Agent Factory | none. `DOUBLEWORD_*` optional | model-driven package generation unavailable. The deterministic local compiler still emits packages, and it is what the M2 equivalence test compares against |
| **M3** Sandbox | none. `DAYTONA_*` buys **isolation only**, and only when a caller asks for it | you lose isolation, nothing else. Without it every scenario runs in this process against stubbed tools, which is sufficient for the verdict: no scenario can reach an external system. Determinism comes from the injected `Clock`, seeded `newId()` and stubbed tools — never from Daytona. See §3a: isolation is opt-in and the verify suite deliberately stays in process |
| **M4** Scheduler + Activation | **none.** Durability is the default (§2a), not a key. Tool credentials required *only* for live runs against real systems | nothing, for fixture activation — it works end to end with no keys and survives a restart. Without tool credentials, live `act` steps fail and the Activation checklist reports the integration as not connected |
| **M5** Workspace + Approvals | same set as M4 | with the stub client the whole loop still runs: run fires → pauses → approval appears → owner edits and approves → run resumes |
| **M6** Calendar, Agents, Integrations | tool credentials, for real connection and expiry state | the Integrations screen shows stub connection states rather than real ones |
| **M7** Hardening | the full live set, for a live rehearsal only | the end-to-end test still passes in fixture mode |

Read that table as: **no milestone is blocked by a missing key.** Every exit
criterion in `ROLE_C_PLAN.md` is met in fixture mode with an empty `.env.local`,
and `npm run verify` — all eight targets — reads nothing but its own fixtures.
Keys buy live behaviour and isolation; they never buy correctness.

Two things that become necessary are not keys at all. A deployment meant to fire
its schedules unattended needs `ORIANT_POLLER=on`, or every firing waits for a
POST to `/api/runtime/scheduler` (§3b). A deployment meant to show an owner their
own workforce rather than the scripted demo needs the lane variables (§3c).

---

## 3a. Sandbox isolation (M3, opt-in)

Isolation means the scenario is executed **inside a Daytona sandbox**, not that a
local call is wrapped in a remote handle. The runner is bundled, uploaded, and
run there; the `ScenarioResult` comes back over stdout. Nothing about the
scenario runs on your machine.

```bash
npm run sandbox:bundle   # build the runner that gets uploaded (esbuild, ~140 kB)
npm run daytona:check    # prove isolation is actually available, then use it
```

`daytona:check` runs the real preflight in
[`lib/runtime/sandbox/remote/preflight.ts`](../lib/runtime/sandbox/remote/preflight.ts):
key present → SDK loads → bundle built → key authenticates → an active snapshot
exists → a sandbox can actually be created and deleted. It prints the key's
presence and length and never the key, and exits non-zero with one sentence you
can act on. Two of those sentences exist because a fresh organisation hits them:

| What Daytona says | What it means |
| --- | --- |
| 400 `This organization does not have a default region` | there is nowhere to put a sandbox. Set a default region in the Daytona Dashboard — creating one sandbox by hand there also sets it — or set `DAYTONA_TARGET=us` |
| 403 `Access denied` on create | the key authenticates but lacks sandbox-create permission. Grant it, or issue a new key with the create and delete scopes |

### How a caller opts in

`SandboxIsolation` carries an optional `runScenarioRemotely(scenario)`.
`runScenario` prefers it whenever an isolation offers one and runs in process
otherwise, so opting in is one dependency:

```ts
await withDaytonaIsolation({}, async (isolation) =>
  runScenario(scenario, plan, { isolation }),
);
```

Every result records which mode earned it — `isolation: "remote"` is stamped only
on a `ScenarioResult` that came back over the wire, next to `packageSource`,
which records which artefact it was earned on. Only a scenario **id** can cross a
machine boundary (a scenario carries closures), so the sandbox resolves that id
in its own bundled copy of the library and the adapter refuses any scenario that
is not that library's own object — otherwise a modified copy would come back as a
well-formed verdict about the unmodified one.

### It is opt-in, and `npm run verify` never touches the network

`verify:m3` runs `InProcessIsolation`, deliberately. The M3 exit criterion is a
verdict that is **byte-identical across five consecutive runs**, and the suite is
24 scenarios plus a 20-case stress sweep — 44 executions, five times over. Paying
a network round trip for each would make the criterion slow and would let a DNS
hiccup turn a correct workforce red. Isolation is not what makes the verdict
trustworthy; the injected clock, the seeded ids and the stubbed tools are.

### What it costs, measured

Against the live account on 2026-07-28, region `us`:

| | |
| --- | --- |
| `npm run daytona:check` | ~4.6s, creates and deletes one sandbox |
| first scenario | ~5.6s — create (1.4s) + upload (1.0s) + run |
| each scenario after it | ~0.3s, on the same reused sandbox |
| all 24 scenarios | **~12s** |
| the same 24 in process | part of `verify:m3`, well under a second |

One sandbox is reused across scenarios and deleted in a `finally`. A fresh
sandbox per scenario would cost about 3s each — roughly 75s for the suite — and
buys nothing: every execution is already a fresh `node` process, and the runner
writes nothing to disk.

### The acceptance criterion

**A scenario executed remotely must produce a result identical to the same
scenario executed locally** — deep-equal, including every event timestamp and id.
Measured: 24 of 24 byte-identical. That is falsifiable rather than decorative; if
a remote run ever differs, isolation changed behaviour and that is the bug.

Both sides compile the package from the spec (`packageSource: "compiled"`): a
sandbox has no Factory store, and building one in there to earn the word
`"stored"` would be a fresh compile wearing the provenance of the artefact
Activation deploys. So the local side of the comparison runs `runScenario`
without a package store too — like against like.

### When to reach for it

When something other than the fixture suite is being proved: a generator that
emits executable code, an untrusted plan, or a reviewer who needs the run to have
happened somewhere other than a developer's laptop. For the BrightPath fixtures
it adds cost and no safety, because every tool is already stubbed.

### It fails closed, loudly

There is no fallback to a local run. A misconfigured or unreachable Daytona
throws; it never returns a locally computed result wearing a `"daytona"` label,
because the verdict is what Activation gates on and a verdict that can lie about
where it was earned is worse than no isolation at all. For the same reason
`DaytonaIsolation.run(label, fn)` — the closure-taking half of `SandboxIsolation`
— refuses rather than running the closure here.

---

## 3b. The scheduler poller (M4/M5, opt-in)

Activation registers triggers and computes a `nextFireAt` for every cron. Something
still has to turn the worker. There are two ways, and only one of them runs while
nobody is looking:

| | What turns the worker | When to use it |
| --- | --- | --- |
| `POST /api/runtime/scheduler` | one `runDueWork` pass per request | development, demos, `verify:m4` — anywhere you want the pass to be an event you caused |
| `ORIANT_POLLER=on` | a background poller, one pass every interval | a deployment that is supposed to be live |

```bash
ORIANT_POLLER=on              # off is the default
ORIANT_POLLER_INTERVAL_MS=    # blank = 30000; whole ms, minimum 1000
```

**Off is the default, and off is a real state rather than a broken one.** With the
poller off, triggers register, agents read as `active`, `nextFireAt` is computed
and correct — and no run ever starts by itself. That is what you want on a laptop:
`npm run dev` should serve screens, not begin dispatching a workforce thirty
seconds later against whatever is in `.env.local`. It is also the one failure that
is silent in a deployment, because everything looks live. If the Friday sweep is
not happening, this switch is the first thing to check.

### Where it starts

[`instrumentation.ts`](../instrumentation.ts) → `startPollerHost()`
([`lib/runtime/schedule/poller-host.ts`](../lib/runtime/schedule/poller-host.ts))
→ `startPoller` → `runDueWork`. Next calls `register()` once per server process,
which is the only hook with the lifetime a daemon needs. Three things follow from
that and are worth knowing before you turn it on:

- **Node.js server runtime only.** The edge runtime has no filesystem and no
  process to outlive a request, so nothing under `lib/runtime` can run there.
- **Never during `next build`.** A poller started by a build would execute real
  runs as a side effect of compiling the site.
- **One per process, and it survives dev hot reload** — the handle is cached on
  `globalThis` exactly as the runtime session is, so saving a file does not leave
  a second poller behind.

### What you will see

The poller is quiet when there is nothing to do — an idle pass logs nothing, or a
30s interval would write ~2,880 lines a day saying so. A pass that did work writes
one header line plus one line per claimed job:

```
[oriant:poller] started at 2026-07-31T01:00:00.412Z — one pass every 30000ms, fixture mode, file storage (…/data/runtime). The first pass is one interval from now, not now.
[oriant:poller] 2026-07-31T01:00:30.412Z — queued 1, claimed 1: 1 succeeded
[oriant:poller]   finance-followup/payment-reminder-drafting succeeded — Run run_… is waiting on approval ap_…. The job is done — the run is under way and the decision is the owner's.
```

That last line is the M5 loop starting on its own: a job the poller claimed, a run
nobody asked for, and a decision now waiting in the owner's inbox. Dead-lettered
jobs, jobs left unsettled, failed passes and triggers that could not be advanced go
to stderr instead.

### The rules it follows

- **It changes nothing about how a run behaves.** Same executor, same policy
  engine, same approval interrupt. Quiet hours and `maxRunsPerDay` still gate the
  start, and a refusal is still a `skipped` job rather than a failure.
- **It obeys `ORIANT_RUNTIME_MODE`.** In fixture mode it drives stubs. In live
  mode it is the thing that makes an agent act on a real customer system with no
  human present — which is the whole reason the switch is opt-in.
- **The first pass is one interval after boot, not at boot.** A restart does not
  replay everything that came due while the process was down until the next tick.
- **Anything it cannot read, it refuses.** `ORIANT_POLLER=treu` does not start a
  poller and does not silently mean "off": the reason is printed on stderr with
  the accepted values. The same applies to an unreadable interval and to a runtime
  session that cannot be composed. A refusal never takes the server down with it —
  a deployment losing its background scheduler is a smaller failure than a
  deployment that will not boot.
- **On SIGTERM/SIGINT it stops claiming immediately.** A pass already inside a run
  is not awaited — waiting properly would mean waiting out the run — so the job it
  claimed stays `running` in the queue, visible, rather than being lost.

### If you run more than one server process

Turn the poller on in **one** of them. A second is safe but pointless: the job
claim is atomic (the file store takes a lock, so it holds across processes too)
and a re-delivered firing is deduplicated by its idempotency key, so nothing
double-fires — both processes simply poll the same schedule and advance the same
triggers to reach the same queue.

---

## 3c. Which screen an Operate route renders (M5/M6, opt-in)

Five routes under `/app/workspace` have two screens behind them: the **scripted
demo** that has always been there, and a **live** one reading the real runtime
through `/api/runtime/*`. The scripted lane is the default and stays supported
permanently — `ROLE_C_PLAN.md` calls it the fallback that carries the demo if
another lane slips.

| Route | Variable | Live screen |
| --- | --- | --- |
| `/app/workspace` | `ORIANT_WORKSPACE_LANE` | tiles, approvals preview, today's schedule |
| `/app/workspace/approvals` | `ORIANT_APPROVALS_LANE` | the inbox and review drawer |
| `/app/workspace/calendar` | `ORIANT_CALENDAR_LANE` | runs, approvals and registered triggers |
| `/app/workspace/agents` | `ORIANT_AGENTS_LANE` | the roster, pause and resume |
| `/app/workspace/integrations` | `ORIANT_INTEGRATIONS_LANE` | connections and what depends on them |

```bash
ORIANT_WORKSPACE_LANE=       # blank or "demo" (default) · "live" · anything else is REFUSED
```

**You do not need any of them to see a live screen.** `?live=1` opts one page
over, and `?live=0` forces the demo back even where the variable says live — so a
deployment that has switched over can still open the scripted screen for a
rehearsal. The query parameter wins in both directions. The variables exist for
the other case: a deployment where the live screen is what the sidenav should
lead to, without a query string on every link.

**Nothing is inferred, and an unreadable value is refused.** "Show the live
screen if the API returns anything" is the obvious design and it is wrong twice
over — a demo would become a live surface the moment somebody activated a plan,
and a live screen would revert to a scripted one exactly when the runtime went
quiet, which is when an owner most needs to be told nothing is there. Likewise
`?live=yes` renders a refusal naming the setting, the value and the accepted
forms rather than falling back to the demo: the scripted screens are convincing
and their controls change nothing. The rule lives once in
[`components/live/lane.ts`](../components/live/lane.ts).

These are not secrets — they name a screen — but they still carry no
`NEXT_PUBLIC_` prefix. The server layout resolves them and passes the lane names
to the client shell as props ([`route-lane.ts`](../components/live/route-lane.ts)),
so the set of values that can reach a browser stays enumerated in one place.

---

## 4. Where each credential comes from

| Provider | Variables | What it powers | Obtain from |
| --- | --- | --- | --- |
| **AI&** | `AIAND_API_KEY`, `AIAND_BASE_URL`, `AIAND_MODEL` | every `reason` step: choosing which invoices to chase, drafting the reminder, judging a thread | AI& console. Base URL and model id are org-specific — copy both, do not guess |
| **Doubleword** | `DOUBLEWORD_API_KEY`, `DOUBLEWORD_BASE_URL`, `DOUBLEWORD_MODEL` | optional model-driven agent-package generation | Doubleword console |
| **Daytona** | `DAYTONA_API_KEY`, `DAYTONA_API_URL`, `DAYTONA_TARGET` | opt-in sandbox isolation for M3 (§3a). **Nothing else** — the legacy `/demo` validator reads the key only to say that it cannot use it (see the note below) | app.daytona.io → Keys; the key needs sandbox **create and delete** permission. URL defaults to `https://app.daytona.io/api`. `DAYTONA_TARGET` overrides the organisation's default region |
| **Google** | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Gmail (read threads, create drafts, send), Calendar (list events, create/update bookings), Drive (read files) | Google Cloud console → Credentials → OAuth 2.0 client (Web application), with the Gmail/Calendar/Drive APIs enabled |
| **HubSpot** | `HUBSPOT_ACCESS_TOKEN` | contacts, deals, invoices, notes, write-offs, and the refund operation the Finance agent forbids | HubSpot → Settings → Integrations → Private Apps |
| **WhatsApp Business** | `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN` | read and send customer messages | Meta for Developers → WhatsApp → API Setup; use a system-user token, not a temporary one |
| **QuickBooks** | `QUICKBOOKS_CLIENT_ID`, `QUICKBOOKS_CLIENT_SECRET` | invoices and payments (read-only in the current vocabulary) | Intuit developer portal → Keys & credentials. Sandbox keys differ from production |
| **Slack** | `SLACK_BOT_TOKEN` | internal channel messages | api.slack.com/apps → OAuth & Permissions → bot token (`xoxb-`) |
| **Mailchimp** | `MAILCHIMP_API_KEY`, `MAILCHIMP_SERVER_PREFIX` | campaign drafts | Mailchimp → Account → Extras → API keys. The prefix is your dashboard subdomain, e.g. `us14` |
| **Database** | `DATABASE_URL` | **nothing today.** The decided Postgres path (`STORAGE.md` §7), named here so it is not reinvented. Durable storage is already the default and needs no service — §2a | your own Postgres, when the migration is taken up. Keep it separate from any demo data |

`NOSANA_*` belongs to YJ's discovery/voice lane and is not read by the runtime.
Setting it changes no runtime behaviour.

> **Daytona had two adapters, and only one of them ever worked.** The runtime's
> (`lib/runtime/sandbox/remote/daytona.ts`) goes through `@daytonaio/sdk` and is
> the one to use. The legacy `/demo` one hand-rolled
> `POST /api/toolbox/{id}/process/execute`, which **404s**: the toolbox moved
> behind `https://proxy.app.daytona.io/toolbox`, and that proxy rejects an
> organisation API key. Do not copy that transport — it authenticates at sandbox
> creation and then fails at the first command.
>
> As of M7 the legacy adapter **no longer attempts it.** It runs its checks in
> process, labels them `fixture` (its type no longer has a `"live"` to return),
> and when `DAYTONA_API_KEY` is set it adds a warning saying this was not a
> sandbox run and pointing here. Before that change it returned `mode: "live"`
> on the failure path — for work that had happened nowhere at all — and reported
> all four security checks as failed, so on any machine configured for M3
> isolation the scripted demo could not get past its own validate step. Giving
> `/demo` real isolation means calling the runtime's client; that is a piece of
> work, not a patch, and it is listed in §7.

### The tool credentials are Role D's, not ours

Everything in the Google → Mailchimp rows above is **owned by Role D's
integration layer** and only *consumed* by the runtime, at run time, through
`getToolClient(integrationId)`. Runtime code never reads those variables
directly — one injected dependency, swapped at the seam.

**Leave all of them blank until Role D's integration layer lands.** The stub
client already covers every operation in `lib/plan/operations.ts`.

### What a credential does not do

A key never widens what an agent may do. Before any client is called,
`resolveAct()` walks the six-step order from `PLAN_CONTRACT.md` §3.10, in this
sequence and no other:

1. operation in `policy.forbidden` or `globalPolicy.forbidden` → refuse
2. operation not in the package's `allowedOperations` → refuse
3. operation in `policy.alwaysApprove` → approval
4. / 5. `draft_only` or `act_after_approval` → approval
6. `auto_within_limits` → evaluate `PolicyLimit`s

Note that the hard deny is checked *first*, before the grant list: a refund
stays refused even if some future plan mistakenly grants it. A valid HubSpot
token does not let the Finance agent issue a refund when policy marks it
`forbidden`, and it does not let a write-off skip approval when policy marks it
`alwaysApprove`. Credentials enable reach, policy decides permission, and
policy is evaluated first.

Likewise, an operation that is not in `lib/plan/operations.ts` cannot be
invoked at all — no key enables it.

---

## 5. Security

- **Server-side only.** Every variable in `.env.example` is read on the server or
  not at all — `DATABASE_URL` is currently the second kind, and §4 says so.
- **Never use a `NEXT_PUBLIC_` prefix on any of them.** Next.js inlines
  `NEXT_PUBLIC_*` values into the client bundle, which would publish the secret
  to every visitor. If a value is needed in the browser, it is the wrong value.
- **`.env.local` is gitignored** (along with `.env` and `.env.*.local`). Keep
  secrets there and nowhere else.
- **`.env.example` carries names and guidance only, never values.** If you add
  a variable, add it here blank, with a comment saying what breaks without it.
- **Never expose key material through the UI or an API response.** Report
  configuration as booleans only, the way `providerStatus()` already does.
- Prefer sandbox or test credentials while developing. Nothing in M1-M3 needs
  production access, and a live token in a dev environment is the one way a
  fixture-mode project can still send a real customer an email.

---

## 6. Quick answers

**"I have no keys at all. What can I do?"**
All of it — every milestone's exit criterion, including the complete approval
interrupt, the sandbox verdict, activation, the scheduler and all five live
Operate screens. Just `npm run dev`, or `npm run verify` for the headless proof.
Keys buy live behaviour, not correctness.

**"I set `ORIANT_RUNTIME_MODE=live` and it failed before the run started."**
Expected. `new AiAndReasoner()` throws `ReasonerConfigError` at construction,
naming exactly which of `AIAND_API_KEY` / `AIAND_BASE_URL` / `AIAND_MODEL` are
missing. That is deliberate: it fails loudly at wiring rather than silently at
the first `reason` step. All three are needed together; one or two counts as
not configured.

**"Sandbox verdicts differ between runs."**
That is not a missing key. Determinism comes from the injected `Clock`, seeded
`newId()` and stubbed tools. A `Date.now()`, `new Date()` or `Math.random()`
call that crept into library code is the usual cause.

**"Do I need Daytona for the sandbox verdict?"**
No. Isolation is opt-in and `verify:m3` never touches the network — see §3a.
Turn it on when you need the run to have happened somewhere other than this
laptop, and check it with `npm run daytona:check` before you rely on it.

**"A remote scenario gave a different result from the local one."**
That is a bug, not a tolerance. Both sides pin the same clock, ids, stubs and
reasoner, so they have no licence to differ; 24 of 24 are byte-identical today.
Check first that the two sides are configured alike — the remote runner has no
Factory package store, so the local comparison must also run `runScenario`
without one, or the results will disagree on `packageSource` alone.

**"I activated the plan, the trigger says it is due, and nothing ever runs."**
Almost certainly `ORIANT_POLLER`. Off is the default, and off means no process
turns the worker — see §3b. Confirm it by driving one pass by hand:
`curl -X POST localhost:3000/api/runtime/scheduler`. If the run appears then, the
scheduler is fine and nothing was waking it.

**"My approvals disappeared after a restart."**
Not expected, and not `DATABASE_URL` — nothing reads that variable. Durable file
storage is the default (§2a), so check `ORIANT_RUNTIME_STORAGE`: `memory` throws
everything away on exit. If it is unset or `file`, check that
`ORIANT_RUNTIME_DATA_DIR` (or the working directory, if it is unset) is the same
one the previous process wrote to — `data/runtime/approvals/` is a directory of
plain JSON you can open and count.

**"I opened `/app/workspace` and it is the scripted demo, not my runtime."**
By design — the demo is the default on all five Operate routes. Add `?live=1`, or
set that route's lane variable for the whole deployment. See §3c.

---

## 7. Known upgrade tasks

Not bugs, and not blocking anything today. Recorded here so they are found by
somebody reading this page rather than by a red CI run.

| What | Why it matters | Scope |
| --- | --- | --- |
| **`npm run lint` calls `next lint`, which is deprecated** and is removed in Next 16. It prints a deprecation notice on every run today and still works | The upgrade to Next 16 turns a notice into a failure, and it will land on whoever is doing an unrelated dependency bump | Migrate to the ESLint CLI: `npx @next/codemod@canary next-lint-to-eslint-cli .`, which writes an `eslint.config.mjs` and rewrites the script. Do it as its own change, with `npm run lint` output compared before and after — not folded into a feature branch |
| **The `/demo` lane has no sandbox isolation** (§4). Its validator runs the checks in process and says so | The `/demo` narrative claims packages are proven in an isolated sandbox; today only the M3 runtime path can make that true | Call `lib/runtime/sandbox/remote/` from the `/demo` validator instead of reviving the dead transport. It is a real piece of work — the `/demo` bundle shape is not a `Scenario` — and it must keep the no-key path working unchanged |
| **`/api/runtime/*` is unauthenticated**, exactly as M4, M5 and M6 left it | The connections and roster routes report which tools a business has connected and what its agents may do with them | Must be gated before any deployment. Named in `ROLE_C_PLAN.md` under M5 and M6 |
