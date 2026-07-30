# Oriant.ai — landing page + Margo demo app

**`/` is the Oriant.ai marketing landing page** — white/black/deep-rose design
system, animated agent-workflow hero, scroll journey, feature bento, dark
approvals section, integrations, FAQ, and a product-video slot with a designed
fallback (drop the file at `public/videos/oriant-product-demo.mp4` and it
appears automatically; optional poster at `public/images/oriant-demo-poster.webp`).
Landing code lives in `components/landing/` with all copy in
`lib/landing-content.ts` and the design tokens in `app/landing.css`.
`/onboarding`, `/privacy`, and `/terms` are presentation-layer holding pages.

**`/demo` is the original Margo product demo**, unchanged, described below.

# Margo — your AI operations manager

> She learns the shop, hires the team, and runs it past you first.

Margo is an AI-workforce design and operations platform for small businesses,
built from the **Tandemry product blueprint** (`reference/blueprint.txt`) with
the **Margo design** (`reference/Margo.dc.html`) as the final look. One guided
journey: a kickoff call → an editable, approvable company brief → a drafted
team of preset + custom agents → asynchronous package generation → sandbox
validation → a live operations floor with human approvals and a calendar.

## Quick start

```bash
npm install
npm run dev        # → http://localhost:3000
```

That's it — the app runs end-to-end out of the box in **fixture mode** (the
prepared Overtone Coffee demo journey, honestly labeled). To go live, add
provider keys:

```bash
cp .env.example .env.local   # then fill in the keys you have
```

| Provider | Powers | Env vars |
|---|---|---|
| **AI&** | Discovery → company brief, workforce planning, natural-language plan changes (strict JSON-schema outputs) | `AIAND_API_KEY`, `AIAND_BASE_URL`, `AIAND_MODEL` |
| **Nosana** | Whisper voice transcription on the kickoff call (typed input always works as fallback) | `NOSANA_WHISPER_URL`, `NOSANA_API_KEY` |
| *(none — browser)* | **Margo's own voice**: she reads her questions aloud via the Web Speech API. Toggle it with the "Her voice" control on the call. No key required. | — |
| **Doubleword** | Async generation of each agent's package (prompt, YAML, policies, tests, docs) | `DOUBLEWORD_API_KEY`, `DOUBLEWORD_BASE_URL`, `DOUBLEWORD_MODEL` |
| **Daytona** | Isolated sandbox validation of every generated package before activation | `DAYTONA_API_KEY`, `DAYTONA_API_URL` |
| **Supabase** | Role A onboarding persistence, organization capture, audit/system logs, blueprint versions and Role B handoff mirroring | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |

Providers are independent — configure any subset. Missing ones stay in fixture
mode and every screen/badge/provider-trace entry says so (the blueprint's
"mock honesty" rule).

## Role A onboarding persistence

Role A now includes a server-side onboarding engine for:

- shared Type/Talk onboarding sessions;
- organization shape, employee count and approval-owner capture;
- transcript-linked voice answers;
- Business Blueprint generation and Human Approval Gate 1;
- Role B handoff records;
- audit and system-event mirroring to Supabase.

Without Supabase env vars, onboarding still works against the local file-backed
store. When Supabase is configured, the onboarding session is mirrored into the
tables defined in `supabase/migrations/20260728_role_a_onboarding.sql`.

## The journey

1. **The call** — Margo interviews you (goals chips, systems chips, Lean Canvas
   upload-or-build, operations, guardrails, clarifiers). Voice answers are
   transcribed by Nosana Whisper when configured; the transcript is always shown
   for you to correct before it's submitted, and typing always works.
2. **The brief** — Discovery (AI&) writes a document-style company report:
   editable, evidence-labeled, versioned. **Approving locks the version** as the
   only planning input; editing after approval re-opens it and marks the plan stale.
3. **Build the team** — the Planner drafts preset + custom agents. Drag from the
   library, configure presets (operating mode, channels, knowledge, approval
   categories, credentials *by reference*), run the custom-agent design call,
   ask Margo for changes in plain English (preview diff → apply → undo), watch
   the price update. **Confirm is blocked until every agent is ready.**
4. **The factory** — one async Doubleword job per agent generates
   `agent.yaml, workflow.yaml, prompt.md, tools.yaml, permissions.yaml,
   test-cases.yaml, required-integrations.json, README.md`. Leave the page;
   jobs keep running (state lives server-side in `data/db.json`).
5. **The sandbox** — every package is validated (schema, secret scan, tool
   allowlist, permission policy, test cases) in a Daytona sandbox when live.
   **No automatic privilege expansion**: unexpected files/permissions from
   generation are discarded and warned about.
6. **The floor & your desk** — active agents, live event feed, approval queue
   with approve/reject (audited), and the month calendar.

## Architecture

```
app/api/*            HTTP boundary (thin routes)
lib/server/
  orchestrator.ts    Deterministic lifecycle: transitions, gates, versions,
                     stale-marking, audit. AI proposes; this applies.
  store.ts           data/db.json file store (the single source of truth)
  discovery.ts       Call → CompanyReport (AI& or labeled fixture)
  planner.ts         Report → WorkflowPlan; NL instruction → reviewable diff
  factory.ts         AgentSpec → artifact bundle (templates = fixture + the
                     contract live generations must match)
  builder.ts         Async build jobs (Doubleword submit/poll or simulated)
  providers/         aiand · nosana · doubleword · daytona adapters (+env)
lib/
  contracts.ts       Shared typed contracts (report, plan, spec, jobs, runs…)
  store.ts           Client store (zustand) — UI state + server sync
  vals.ts            View-models named 1:1 after the design's template vars
  fixtures.ts        The Overtone Coffee demo content (labeled fixture)
components/          Pixel-faithful port of reference/Margo.dc.html
```

Hard rules enforced server-side (from the blueprint):

- Planner can't run from an unapproved brief; builds need an approved plan;
  activation needs passed validation (F-05/F-10/F-12).
- Every approved object records who/when; ~200 recent audit events kept.
- Secrets never appear in generated files — credentials are referenced by name
  (`gorgias_api`), and the secret scan fails any bundle that violates this.
- Undo restores the previous plan *version* server-side (no client-side guessing).

## Demo tips

- `POST /api/reset` (or delete `data/db.json`) → clean session for rehearsal.
- The provider trace is in `data/db.json → providerRuns` — each entry shows
  `provider / operation / status / mode` so you can prove which sponsor did what.
- `npm run dev` and `npm run build` use separate output directories
  (`.next` vs `.next-build`, via `scripts/next-prod.mjs`), so building while
  the dev server runs is safe. If you ever do see a stray
  `__webpack_modules__[moduleId] is not a function`, delete both directories
  and restart — that error always means stale/mixed build artifacts, never a
  code fault.
