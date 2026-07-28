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
| `RunStore` | `InMemoryRunStore` | runs and approvals are lost on restart |
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

## 3. Milestone → what becomes necessary

| Milestone | Keys that become necessary | What degrades without them |
| --- | --- | --- |
| **M0** Foundations | none | nothing. Fixture plan, validator, schema — all local |
| **M1** Runtime core | none for fixture. `AIAND_*` **only** for `live` | in `live`, wiring throws `ReasonerConfigError` before any run starts. Fixture mode unaffected: the full M1 exit (send at \$95, pause at \$1,200, resume on approve, always-approve write-off, refused refund) passes with no keys |
| **M2** Agent Factory | none. `DOUBLEWORD_*` optional | model-driven package generation unavailable. The deterministic local compiler still emits packages, and it is what the M2 equivalence test compares against |
| **M3** Sandbox | none. `DAYTONA_*` is **not read by the runtime** | nothing — there is no isolation to lose, because sandbox isolation is not implemented. The `SandboxIsolation` seam exists in `lib/runtime/sandbox/types.ts`, but `InProcessIsolation` is its only implementation, so every scenario runs in this process against stubbed tools. That is sufficient today: no scenario can reach an external system. Determinism comes from the injected `Clock`, seeded `newId()` and stubbed tools — never from Daytona. Setting `DAYTONA_*` affects only the legacy `/demo` lane |
| **M4** Scheduler + Activation | `DATABASE_URL` **required**. Tool credentials required *only* for live runs against real systems | without a database, a paused run and its pending approval vanish on restart, which defeats the approval interrupt. Without tool credentials, live `act` steps fail and the Activation checklist reports the integration as not connected; fixture activation still works end to end |
| **M5** Workspace + Approvals | same set as M4 | with the stub client the whole loop still runs: run fires → pauses → approval appears → owner edits and approves → run resumes |
| **M6** Calendar, Agents, Integrations | tool credentials, for real connection and expiry state | the Integrations screen shows stub connection states rather than real ones |
| **M7** Hardening | the full live set, for a live rehearsal only | the end-to-end test still passes in fixture mode |

Read that table as: **nothing before M4 is blocked by a missing key.**

---

## 4. Where each credential comes from

| Provider | Variables | What it powers | Obtain from |
| --- | --- | --- | --- |
| **AI&** | `AIAND_API_KEY`, `AIAND_BASE_URL`, `AIAND_MODEL` | every `reason` step: choosing which invoices to chase, drafting the reminder, judging a thread | AI& console. Base URL and model id are org-specific — copy both, do not guess |
| **Doubleword** | `DOUBLEWORD_API_KEY`, `DOUBLEWORD_BASE_URL`, `DOUBLEWORD_MODEL` | optional model-driven agent-package generation | Doubleword console |
| **Daytona** | `DAYTONA_API_KEY`, `DAYTONA_API_URL` | legacy `/demo` lane validation only (`lib/server/providers/daytona.ts` → `ValidateScreen`). The Role C runtime sandbox does not read these | app.daytona.io. URL defaults to `https://app.daytona.io/api` |
| **Google** | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Gmail (read threads, create drafts, send), Calendar (list events, create/update bookings), Drive (read files) | Google Cloud console → Credentials → OAuth 2.0 client (Web application), with the Gmail/Calendar/Drive APIs enabled |
| **HubSpot** | `HUBSPOT_ACCESS_TOKEN` | contacts, deals, invoices, notes, write-offs, and the refund operation the Finance agent forbids | HubSpot → Settings → Integrations → Private Apps |
| **WhatsApp Business** | `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN` | read and send customer messages | Meta for Developers → WhatsApp → API Setup; use a system-user token, not a temporary one |
| **QuickBooks** | `QUICKBOOKS_CLIENT_ID`, `QUICKBOOKS_CLIENT_SECRET` | invoices and payments (read-only in the current vocabulary) | Intuit developer portal → Keys & credentials. Sandbox keys differ from production |
| **Slack** | `SLACK_BOT_TOKEN` | internal channel messages | api.slack.com/apps → OAuth & Permissions → bot token (`xoxb-`) |
| **Mailchimp** | `MAILCHIMP_API_KEY`, `MAILCHIMP_SERVER_PREFIX` | campaign drafts | Mailchimp → Account → Extras → API keys. The prefix is your dashboard subdomain, e.g. `us14` |
| **Database** | `DATABASE_URL` | durable runs, events, approvals, packages, deployments, schedules | your own Postgres. Keep it separate from any demo data |

`NOSANA_*` belongs to YJ's discovery/voice lane and is not read by the runtime.
Setting it changes no runtime behaviour.

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

- **Server-side only.** Every variable in `.env.example` is read on the server.
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
All of M0-M3, including the complete approval interrupt and the sandbox
verdict. Just `npm run dev`.

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

**"My approvals disappeared after a restart."**
Expected without `DATABASE_URL` — the in-memory store is the default. Fine
through M3, must be fixed before M4.
