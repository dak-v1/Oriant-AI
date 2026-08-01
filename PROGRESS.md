# Person B Build Progress

## Test data
- session_id: 5b4abc67-50b9-427a-9980-f3a14a5c4696
- organization_id: 0ec916c6-bc36-4d57-af32-938cee532ce5
- company_report_id: 16d84981-c947-40af-b793-0a1578de750c

## Steps
- [x] Step 0: Seed test org/session/handoff/report (scripts/seed-test-org.ts)
- [x] Step 1: Schema & Types
- [ ] Step 2: Seed Agent Templates
- [ ] Step 3: Core Planner Lifecycle
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
- Merged in Person A's latest Supabase/schema changes on <date you pull> —
  recheck organizations/onboarding_sessions/role_b_handoffs/company_reports
  column shapes after any future pull from her branch.