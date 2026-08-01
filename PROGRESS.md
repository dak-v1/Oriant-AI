# Person B Build Progress

## Test data
- session_id: 6648850b-a9d7-42ca-928a-613e71e37a41
- organization_id: 1647df28-64de-4c69-b681-d20c3170b88b
- company_report_id: b1637ccf-8b12-4ba1-bfc1-eb5351cec5df
- NOTE: original ids (5b4abc67.../0ec916c6.../16d84981...) are DEAD —
  wiped when role_a_reset_and_create.sql was run against live Supabase.
  Always use the ids above, not any older id you see in past chat logs
  or old Postman requests.

## Steps
- [x] Step 0: Seed test org/session/handoff/report (scripts/seed-test-org.ts)
- [x] Step 1: Schema & Types
- [x] Step 2: Seed Agent Templates
- [x] Step 3: Core Planner Lifecycle
- [ ] Step 4: Custom Agent Design-Call Flow
- [ ] Step 5: Workflow Refinement Chat
- [ ] Step 6: Cost Estimator
- [ ] Step 7: Integrations Backend
- [ ] Step 8: Handoff to Person C
- [ ] Step 9: Frontend Rewiring

## Rules for every new Claude Code session
- Do not touch or import from lib/server/orchestrator.ts or app/api/plan/*
  — this is a separate, independent backend.
- Follow the existing adapter convention in lib/server/providers/
  ({mode:"live"|"fixture", data, error}, never throw).

## Notes
- scripts/seed-test-org.ts uses raw fetch() against the PostgREST API,
  not @supabase/supabase-js createClient (avoids a WebSocket/realtime
  dependency issue in this repo's Node version). Standalone, not
  imported anywhere else — don't reuse its client pattern elsewhere.
- role_b_handoffs.payload real shape (confirmed from buildDiscoveryHandoff()):
  {handoff_type, generated_at, raw_inputs, structured_findings} — no
  top-level "workflow" key. report_version is the live column;
  blueprint_version is legacy/always null.
- Canonical tool IDs: getCanonicalToolIds(payload) in lib/server/planner/db.ts
  reads structured_findings.workflow_summary.tools, falls back to
  raw_inputs.onboarding.selected_tools. Never use
  company_reports.report.systems[].name for integration matching —
  that's display text only.
- agent_configs.runtime_model already exists (added earlier). agent_templates
  still needs default_runtime_model added — Step 2's prompt handles this.
- ⚠️ supabase/role_a_reset_and_create.sql is DESTRUCTIVE — drops and
  recreates all 12 Role A tables, which silently breaks foreign keys on
  any of my tables referencing organizations/role_b_handoffs. Confirmed
  this was actually run once already (wiped my Step 0 data). Told Person A
  not to run it again without warning me first.
- FK audit (read-only PostgREST introspection + information_schema query):
  found workforce_plans, role_c_handoffs, integration_connections,
  integration_manifests, integration_credentials all missing their FKs to
  organizations/role_b_handoffs — no DB-level referential integrity.
  Also found integration_manifests has a separate workforce_plan_id FK
  (distinct from its organization_id FK) that wasn't in the original audit
  scope. Along the way, found 2 stale pre-planning-session orgs
  (362371c6... and 02a28881...) with orphaned rows across workforce_plans,
  agent_configs, workflow_definitions, and integration_manifests — deleted
  all orphaned rows, then added all 6 missing FK constraints. Confirmed
  clean via full schema dump: all constraints now present.