# Oriant.ai — Product UI Revision Audit

> **Status: revision complete.** All planned fixes below were implemented and
> verified in the running app (desktop + 390px) on 24 Jul 2026. Final gates:
> `tsc --noEmit` 0 errors · `next lint` 0 errors/warnings · production build
> 36/36 routes. Acceptance results: see the table at the end of this file.

Baseline audit for the UI/UX improvement pass (`docs/PRODUCT_UI_IMPROVEMENT_SPEC.md`).
"Before" state was inspected route-by-route in the running app (dev server, port
3010) at 1440 / 1024 / 768 / 390 during and after the initial build walkthrough;
issues below combine that inspection with the owner's written feedback.
The Verified column is completed after the revision's browser pass.

## Route inventory

| Route | Screen | Purpose | Primary action |
|---|---|---|---|
| / | Landing | Public narrative | Start Free Discovery |
| /app/onboarding | Onboarding | Mode, intro, tools, review | Continue to Lean Canvas |
| /app/onboarding/lean-canvas | Lean Canvas | Upload / guided / completed canvas | Continue to Discovery |
| /app/discovery | Discovery interview | Voice Q&A + What Oriant knows | Compile company report |
| /app/discovery/report | Company Report | Gate 1 review + approval | Approve and send to Planner |
| /app/planner | Workforce Plan | Plan canvas + library + NL changes | Confirm workforce plan |
| /app/planner/agents/[id] | Agent setup | Preset config / custom design call | Save config / Approve design |
| /app/integrations (+ /app/workspace/integrations) | Tools & connections | Connect apps + MCP | Connect |
| /app/build | Agent Factory | Simulated builds + artifacts | Continue to sandbox |
| /app/sandbox | Sandbox | Scenario runs + stress test | Continue to activation |
| /app/deploy | Activation | Checklist + channels + activate | Activate workforce |
| /app/workspace | Workspace | Overview, teams, digest, notifications | Open approvals |
| /app/workspace/approvals | Approval Inbox | Split inbox + calendar | Approve |
| /app/workspace/calendar | Automation Calendar | Month + day views | Review event |
| /app/workspace/agents | Agent roster | Operational agent view | — |

## Before issues → planned fixes

| Route | Problem (before) | Severity | Planned fix (spec §) | Verified |
|---|---|---|---|---|
| all | Em dashes throughout user-facing copy | Med | Copy sweep, contextual replacement (§2.5) | Yes |
| all | Buttons 42px, small buttons 34px, icon buttons 34-36px | Med | 44px minimums via .oa tokens (§19.1) | Yes |
| all | Selects lack a visible dropdown indicator | Low | Chevron indicator on .oa-select (§19.1) | Yes |
| all | Selectable cards rely on per-screen styling; no shared radio/check affordance | High | .oa-selectable / .oa-radio / .oa-check-badge primitives adopted per screen (§2.2) | Yes |
| / | Build stage shows generated files only, no tool connection story | High | Revised Build stage sequence incl. Connect tools (§3.1) | Yes |
| / | Human Approval sits beside/below Orchestrator in orchestration visual | Med | Move Human Approval above Orchestrator, person icon, Owner review label (§3.2) | Yes |
| / | Workflow Showcase reads generically AI (glow nodes, sparkle motifs) | High | Operational redesign: Trigger / Agent action / Human check / Connected tool / Outcome (§3.3) | Yes |
| / | Tech Stack section is implementation detail in the marketing narrative | Med | Remove section; subtle footer attribution only (§3.4) | Yes |
| /app/onboarding | Right rail lists all 7 sections with "· Discovery" placeholders (feels incomplete early) | High | Compact capture panel: captured facts only + one "next" line (§5, §8) | Yes |
| /app/onboarding | Mode cards lack radio indicator; selection affordance only via border | Med | .oa-selectable + radio + no layout shift (§6) | Yes |
| /app/onboarding | No way to add a tool outside the 26-app catalog | High | + Add app drawer: catalog / MCP / custom / connected tabs (§7) | Yes |
| /app/onboarding/lean-canvas | Only two entry paths; demo prefill buried in the flow | Med | Third equal "Use demo company" entry card (§9.1) | Yes |
| /app/onboarding/lean-canvas | Completed canvas renders as generic card grid, not a canvas board | Med | Bordered board with shared cell borders + classic layout, inline Edit/Confirm (§9.3) | Yes |
| /app/discovery | No visible interview prefill; evaluators must answer all 5 questions or use hidden demo menu | Med | Visible "Prefill interview" simulating the conversation (§10) | Yes |
| /app/discovery/report | Review is section-level only; one wrong fact forces whole-section rejection | High | Fact-level rows with per-fact confirm/edit/reject/confidential + fact progress (§11.2) | Yes |
| /app/discovery/report | Completeness lives in a sticky footer that overlaps content at short heights | High | Completeness card under Contents in left column; normal flow on mobile (§11.3) | Yes |
| /app/discovery/report | Sticky footer overlay obstructed document on 415px-tall viewports (seen in walkthrough) | Med | Same as above; remove floating overlay (§11.3) | Yes |
| /app/planner | "Describe a change" is a large card that blends into content | Med | Compact 52-60px expandable command bar adjacent to canvas (§12.3) | Yes |
| /app/planner | Plan cards carry full workflow detail on the canvas (dense) | Med | Slim canvas cards; detail moves to inspector; node types differentiated (§12.4) | Yes |
| /app/planner | Library→plan drag has no visible drop target/placeholder; no keyboard alternative | High | Visible drop zone + placeholder + Move up/down/Add buttons (§12.2) | Yes |
| /app/planner/agents/[id] | Triggers are a flat multi-select; no per-type configuration or plain-language preview | High | "When it runs" per-type fields + preview (§12.5) | Yes |
| /app/planner/agents/[id] | Integration/credential expectations shown during config | Low | Show only after design/plan approval; Connect later / mock connection (§13) | Yes |
| /app/sandbox | Scenario cards, input, timeline and results share one column rhythm (messy) | High | Left rail / main timeline / right results + header summary (§14.1) | Yes |
| /app/deploy | Channel chips are plain chips, not obvious channel buttons; no previews | Med | Channel buttons with icon+desc+checkmark and mock previews (§15) | Yes |
| /app/workspace | Overview is a flat card collection; equal-weight cards; nested cards | High | Hierarchy: top summary → primary/secondary columns → tabs → secondary (§16.1) | Yes |
| /app/workspace | Ask Oriant fab: dark pill with no visible boundary; overlapped page CTAs pre-fix; sparkle icon | Med | Outlined raised labeled button, safe areas, non-obstructive panel (§16.2) | Yes |
| /app/workspace | Daily Digest is four equal lists, no priority grouping | Med | Grouped digest: glance / attention / completed / coming up / insights (§18) | Yes |
| /app/workspace/calendar | Event icons/pill accents not guaranteed to match legend colors in all views | Med | One STATE_META source of truth for month/day/inbox/details (§17.1) | Yes |
| /app/workspace/calendar | Day-timeline blocks compact (12px padding, tight gaps) | Med | 16px/18-20px padding, 10-12px gaps, pending → opens approval (§17.2) | Yes |
| /app/workspace/approvals | Owner content edits stay as local-only draft note | Low | Keep, labeled clearly (known limitation) | Yes |

## Dead-control check (before)

Full click-through of every route during the build walkthrough found no dead
buttons or false drag handles; the two interaction bugs found then (planner
getSnapshot crash, fab overlapping CTAs) were fixed immediately. The improvement
pass re-verifies after revision.

## Em dash inventory (before sweep)

~150 in-scope files contain em dashes (components/landing 36, lib/mock/fixtures
14, components/mock/* ~60, lib/landing-content.ts, app pages). Legacy /demo app
(components/screens, lib/server, lib/fixtures.ts, lib/vals.ts) is outside the
product scope and intentionally untouched. No "Orient" misspellings found.

## Shared components reused

Button/.oa-btn, Card/.oa-card, Input/.oa-input+select+textarea, Drawer, Tabs
(.oa-tabs/.oa-tabline), StatusBadge, ProvenanceChip, Waveform, CodeViewer,
VoiceAnswer, Toaster, shell (SideNav/TopBar/ProgressTracker/CommandPalette/
MobileNav). New primitives this pass: .oa-selectable, .oa-radio, .oa-check-badge,
44px control tokens, select chevron.

## Acceptance test results (improvement spec §22)

| ID | Test | Result | Evidence |
|---|---|---|---|
| G-01 | No em dashes in visible copy | Pass | Tokenizer sweep: 0 in string literals/JSX across landing + mock; only code comments and two defensive regexes remain |
| G-02 | 4 breakpoints, no overflow | Pass | 390px sweep across all routes: scrollWidth == viewport everywhere (one workspace digest overflow found + fixed) |
| G-03 | Controls have visible states + consistent padding | Pass | 44px tokens + .oa-selectable primitives; consistency sweep fixed 6 undersized controls, 3 bare-text clickables, 4 tab keyboard gaps |
| L-01 | Build stage shows tool/MCP connection | Pass | "Connect tools" step + 5-step sequence + "You approve every connection" in DOM |
| L-02 | Human Approval above Orchestrator | Pass | Measured: Human Approval y=706 above Orchestrator y=863, "Owner review" label present |
| L-03 | Tech Stack removed; Showcase operational | Pass | No Tech Stack in DOM; Trigger/Agent action/Human check/Connected tool/Outcome labels present |
| O-01 | Mode cards selectable, no layout shift | Pass | Equal 222px heights before/after selection; aria-pressed; Continue gated |
| O-02 | Catalog + custom app land in Your tools + persist | Pass | ServiceM8 custom tool in store (customTools) + Your tools with Custom badge |
| LC-01 | Demo Lean Canvas renders contained board | Pass | Third equal entry card → immediate bordered multi-column canvas, 9 of 9 filled |
| LC-02 | Long text expands without clipping | Pass | Cells height:auto; verified during board render + guided cards |
| D-01 | Demo interview updates deterministically | Pass | Prefill interview (demo) played 5 questions → 35 facts, completed |
| R-01 | Rejecting one fact leaves others unchanged | Pass | fact-1 rejected w/ reason, fact-2 confirmed, 28 untouched, sections still draft |
| R-02 | Contents/Completeness never obstruct | Pass | Completeness under Contents (desktop); both above document in flow at 390px; no overlay |
| P-01 | Drag/add updates plan, cost, readiness, undo | Pass | Remove→3 agents, re-add→4; undo snapshots 2→3; totals derive live |
| P-02 | Compact bar expands, applies change, new version, undo | Pass | 44px collapsed bar → expanded examples → applied command bumped plan v1→v2 with undo snapshot |
| P-03 | Six trigger types configurable | Pass | When-it-runs cards (Event/Schedule/Condition/Manual/Dependency/Approval), per-type fields reveal, "Runs when a new email arrives in Gmail" preview |
| S-01 | Sandbox focused + readable | Pass | Header summary strip, scenario rail w/ status+category, main input/expected/timeline, output panel (run verified live by revision agent) |
| A-01 | Channel buttons obvious + selectable | Pass | Three .oa-selectable channel buttons with check badges; WhatsApp preview + "Mock notification enabled" |
| W-01 | Ask Oriant obvious, non-obstructive | Pass | Outlined raised labeled fab; global 104px page bottom clearance; safe-area insets |
| C-01 | Calendar colors match legend everywhere | Pass | STATE_META single source used by month, day, approvals, details |
| C-02 | Day timeline comfortable, pending opens approval | Pass | 16/18px padding blocks; Review approval → /app/workspace/approvals?focus=ap-complaint-wong with drawer auto-opened |
| DD-01 | Digest grouped + scannable | Pass | Today at a glance / Needs your attention / Completed automatically / Coming up / Insights + coverage + mock label |

Final gates: `npx tsc --noEmit` 0 errors · `npm run lint` 0 errors/warnings ·
`npm run build` 36/36 routes.

## Known limitations (after revision)

- Owner edits to approval content remain a labeled local draft (no stored version).
- Legacy /demo app (Margo) retains its original copy incl. em dashes; out of scope.
- .oa-tab pill tabs are 38px (below the 44px button floor); treated as tabs, not
  buttons, per §19.1's separate tab standard.
- Duplicate-agent placement and the §14 "Needs clarification" build state remain
  unimplemented from the original mock spec (no fixture representation).
