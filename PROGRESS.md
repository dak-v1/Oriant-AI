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
- [x] Step 4: Custom Agent Design-Call Flow
  Note: "Full lifecycle verified end-to-end by hand in Postman on plan f5f51ce7...: generate → configure → gate correctly blocked → design-call (start/turn/clarify, 11 turns) → re-configure → approve succeeded. Plan status='approved', requiredTools correctly deduped to 6 tools across 3 agents."
- [x] Step 5: Workflow Refinement Chat
  Note: "Chat correctly classified a removal request vs. a compound question+conditional (declined a false-condition removal with a real explanatory answer). Apply/undo/redo all confirmed working by hand, including the undo-then-redo loop (Claude Code caught and fixed a real gap in the original undo/redo spec — undo now preserves the state it's moving away from so redo has something to restore). Archived-agent configure guard returns 404 correctly."
- [x] Step 6: Cost Estimator
  Note: "Verified via Postman against plan f5f51ce7...: backfilled 3 agents' runtime_model, GET cost-estimate returned volumeSource='facts' (real 650/mo from seeded report), correct per-agent costs (deepseek-v4-flash agents ~$1.30-1.95/mo, glm-5.2 custom agent ~$13.52/mo — ~10x higher, matches rate table). generate.ts fixed to set runtime_model at creation time going forward. Composio fees intentionally excluded (composioFeeUsd: null) pending Step 7."
- [x] Step 7: Integrations Backend — ALL 7 TOOLS via Composio
  Note: "Built for hubspot/slack/quickbooks/whatsapp-business first, then extended to gmail/google-calendar/google-drive (originally planned as a separate google_native OAuth path, but Composio covers them too — extended instead of building native OAuth; purely additive, no google_native rows existed to migrate). authConfigs.create works zero-config for all 7. Personally confirmed via real browser OAuth for both Slack and Gmail — status correctly stayed 'pending' until real consent completed, then flipped to 'connected'. Org overview correctly filters required-tools by active (non-archived) agents in real drifted state. quickbooks/google-calendar/whatsapp-business currently sitting 'pending' from Claude Code's own /connect calls (never completed, not a bug). Known cosmetic gap: plan.plan.stale can read true on an approved plan (no dedicated stale column yet)."
- [x] Step 8: Handoff to Person C
    Note: Verified end-to-end: migration ran clean, finalize-handoff correctly 400-blocked on missing tools and on a non-approved plan, returned genuine 200 once all required tools for the active agent set were really connected. Confirmed upsert behavior (same row id, same idempotency_key, updated_at advances) via a second call, and confirmed GET .../handoff is genuinely read-only (identical response, no further mutation). Full bundle payload correct — resolved agent specs, connected integrations with real timestamps, plan metadata. Test plan f5f51ce7... left with only marketing_content_approval_agent active (quickbooks needs a paid Intuit trial, whatsapp-business needs real Meta Business verification — both impractical to test) — not restored to original 3-agent state.
- [ ] Step 9: Frontend Rewiring

## Rules for every new Claude Code session
- Do not touch or import from lib/server/orchestrator.ts or app/api/plan/*
  — this is a separate, independent backend.
- Follow the existing adapter convention in lib/server/providers/
  ({mode:"live"|"fixture", data, error}, never throw).
- Agent removal via chat is ALWAYS a soft-delete (agent_configs.archived_at
  set), never a hard DELETE.

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
- agent_configs.runtime_model already exists. agent_templates has
  default_runtime_model (Step 2).
- Composio adapter: lib/server/planner/providers/composio.ts. Toolkit slug
  map (hardcoded, not a string transform): gmail→gmail,
  google-calendar→googlecalendar, google-drive→googledrive, hubspot→hubspot,
  slack→slack, quickbooks→quickbooks, whatsapp-business→whatsapp. Uses
  connectedAccounts.link() (NOT initiate() — deprecated/sunsetting).
  No connection-completion webhook exists — status is polled via
  connectedAccounts.get(id), never pushed.
- ⚠️ supabase/role_a_reset_and_create.sql is DESTRUCTIVE — drops and
  recreates all 12 Role A tables, which silently breaks foreign keys on
  any of my tables referencing organizations/role_b_handoffs. Confirmed
  this was actually run once already (wiped my Step 0 data). Told Person A
  not to run it again without warning me first.
- FK audit (read-only PostgREST introspection + information_schema query):
  found workforce_plans, role_c_handoffs, integration_connections,
  integration_manifests, integration_credentials all missing their FKs to
  organizations/role_b_handoffs. Also found integration_manifests has a
  separate workforce_plan_id FK. Found and cleaned up 2 stale
  pre-planning-session orgs (362371c6... and 02a28881...) with orphaned
  rows. All 6 FK constraints added and confirmed present via full schema
  dump.
- workforce_plan_snapshots table + workforce_plans.current_version +
  agent_configs.archived_at added for Step 5 (chat undo/redo history).