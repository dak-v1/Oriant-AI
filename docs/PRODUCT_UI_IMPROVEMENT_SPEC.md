# Oriant.ai — Full Product UI/UX Improvement Spec (v1.0)

> Source: `docs/reference/Oriant_AI_Full_Product_UI_UX_Improvement_Master_Prompt.docx`.
> Revision specification for the EXISTING app: improve, don't rebuild. Deterministic
> hardcoded mock stays; no backend. Inspect → implement → click through → verify.

## 0.1 Non-negotiable outcomes

- Every selectable card looks selectable BEFORE click: default, hover, focus,
  selected, disabled, completed states.
- Every button looks like a button. No text-that-becomes-clickable-on-hover.
- Shared padding/alignment/heights: buttons+inputs ≥44px, icon buttons 44px target.
- Hierarchy + progressive disclosure: one dominant decision per screen; advanced
  detail behind tabs/drawers/Advanced.
- Motion clarifies state; no decorative noise. Respect reduced motion.
- No dead controls. Everything clickable works.
- **Remove every em dash (—) from user-facing copy** (landing + app). Replace with
  comma, colon, full stop, parentheses, or hyphen as reads best. Never damage code.
- No MCP/API-key/YAML/sandbox internals surfaced before the relevant setup or
  Advanced view.
- Product name is **Oriant** (never "Orient").

## 2. Global system

Spacing tokens: 4 icon-label · 8 small internal · 12 dense groups · 16 default +
mobile card padding · 20-24 desktop card padding · 32 major groups · 48-72 section
separation. Shared max-width container; consistent page header (eyebrow, title,
short description, ONE primary action); content-driven card heights; button groups
share a baseline; selection must never change card height or reflow content.

Controls: Primary = solid fill, ≥44px, hover+focus+disabled. Secondary = 1-1.5px
outline. Tertiary = text+icon with hover surface. Selectable card = border, hover
tint/elevation, radio/check indicator, selected border + tinted bg. Channel choice
= icon, label, short description, outline, selected checkmark. Icon button = 44px
target, tooltip, aria-label.

Professional direction: fewer gradients/glow/sparkle icons; neutral surfaces; one
content-card style, one compact list style, one status panel style; realistic
operational visuals (queues, calendars, timelines, documents, statuses).

Motion: page entry short fade + 8-16px rise (stagger major blocks only);
selectable cards 120-180ms transitions; command input expands without layout jump;
DnD lift/shadow/placeholder/smooth reorder; staged deterministic progress, no fake
loops.

## 3. Landing page

- **3.1 How Oriant Works, Build stage**: revise to show connecting the approved
  workflow to external tools alongside generated files. Sequence: Generate
  configuration → connect tools → validate permissions → test in sandbox → ready
  for activation. Show "Connect tools" (email, calendar, CRM, accounting, storage,
  messaging, an MCP connection). Owner-approved connections only.
- **3.2 Orchestration visual** (section below the first AI-node visual): move the
  Human Approval card ABOVE the central black Orchestrator card (escalation goes
  upward to a person). Person icon, neutral surface, "Owner review" label; clean
  connectors; recomposes on mobile.
- **3.3 Workflow Showcase redesign**: remove glowing nodes/sparkles/generic AI
  imagery. Fewer items at larger scale; each = one business problem + one
  understandable workflow with labels Trigger / Agent action / Human check /
  Connected tool / Outcome; restrained animation that pauses at human approval.
- **3.4 Remove the Tech Stack section** from the landing entirely; sponsor
  attribution may live in a subtle footer note only.

## 5. Discovery progress presentation

During discovery: compact progress + captured facts only; NEVER a long list of
empty required fields; positive wording (Captured / In progress / We will clarify
this next). Full structured checklist (incl. missing info) moves to the Company
Report / final review. Live overview compact: Company, Team, Goals, Tools,
Guardrails with only known facts.

## 6. Operating mode selection

Assist / Operate / Not sure: three equal-height selectable cards with radio
indicator, icon, short description; selected = stronger outline + tint + checkmark
+ NO layout movement; Continue below the group, disabled until a choice exists.

## 7. Tools + "Add app"

Group by business function (Communication, Calendar, Customer Management, Finance,
Marketing, Storage, Commerce, Project Management, Other). Search + category
filters. Selected tools first in a "Your tools" area. Each row/card: icon, name,
category, short purpose, selected/connected state. Clearly outlined `+ Add app`
button in header AND at list end. Add-app drawer tabs: App catalog (searchable
hardcoded) / MCP connections (plain language) / Custom app (name, category,
purpose → local item with Custom badge) / Connected apps (status chips + Remove).
Persist in store/localStorage. No credentials.

## 8. "What we have captured" card

Intentional info panel: 1.5px border, subtle tint, title row, captured-fact count,
last-updated label; compact groups with icons (Company, Team, Goals, Tools,
Automation preference, Guardrails); small "Updated" badge when voice adds info; no
empty placeholders; only captured facts + ONE "Oriant will ask about this next".

## 9. Lean Canvas

Three EQUAL entry options: Upload / Build with Oriant / **Use demo company**
(prefills everything). Guided cards: height auto (min-height for balance only),
20-24px desktop padding, examples in muted expandable area, Back/Continue fixed to
page grid. Completed canvas = a real Lean Canvas board: outer border, outlined
cells with shared borders, recognisable multi-column desktop layout, logical
stacking on mobile, inline Edit + Confirm per cell, content wraps (never clips).

## 10. Discovery interview

Visible `Use demo company / Prefill interview` option that simulates a short voice
conversation (progressive transcript + knowledge updates). Voice emphasized but
Text/Cards/Upload/Invite clearly available. Knowledge tab shows captured facts
only. Completion → transitions into the Company Report.

## 11. Company Report

- Buttons: Edit, Confirm, Reject, Add context, Mark confidential, Ask another
  question = real labeled buttons (icon + outline/fill + hover/focus/tooltip).
- **Fact-level review**: every fact row has its own status + actions:
  unreviewed (neutral; Confirm/Edit/Reject) · confirmed (teal badge, timestamp,
  Undo) · edited (blue badge, current value, previous-value view, Confirm edit) ·
  rejected (muted/red tint, reason field, Ask Oriant to clarify) · confidential
  (lock + visibility note, still visible to owner). Section "Confirm all" is a
  convenience only. Progress by facts, e.g. "18 of 22 confirmed".
- **Completeness placement**: left column directly below Contents (sticky desktop
  only when not covering content); shows confirmed, needs review, missing info +
  one "jump to next unresolved fact" button. Mobile: Contents + Completeness above
  the report in normal flow. No floating overlay.

## 12. Workforce Plan

Structure top→bottom: 1 header (name, version, costs, approval readiness);
2 outcome summary (2-4 outcomes + supporting workflows); 3 workflow canvas
(readable agents, human steps, triggers, connected tools, outcomes); 4 selected-
agent drawer/panel; 5 compact reconfiguration command bar; 6 agent library +
custom tray for DnD; 7 approval footer (unresolved count + Confirm).

- **12.2 DnD**: real deterministic drag from library into plan (updates state,
  price, readiness, undo history); reorder existing agents; visible drop target +
  placeholder; keyboard alternative (Move up/Move down/Add); Undo/Redo ≥10
  snapshots.
- **12.3 Compact "Describe a change"**: collapsed single-line bar 52-60px —
  [icon] placeholder ("Describe a change, for example \"Add a weekly
  overdue-invoice summary\"") [mic] [send]; clear border; looks typable without
  hover; aligned to content width, adjacent to the canvas. Expands smoothly on
  focus: larger textarea, three example prompts, voice input, proposed-change
  preview. Collapses on blur when empty. Submit = new mock plan version + Undo.
- **12.4 Readability**: canvas cards = name, role, one-line purpose, status, cost
  only; full config in the panel; distinct visual types for Agent / Human approval
  / Trigger / Connected app / Outcome; no overlapping lines/labels; List view
  alternative for small screens.
- **12.5 Triggers**: "When it runs" = Event / Schedule / Condition / Manual /
  Dependency / Approval; relevant fields appear only after type selection;
  plain-language preview ("Runs when a new customer enquiry arrives").

## 13. Agent setup

Presets: clean dropdowns/multi-choice, trigger selection, permissions, connected
tools, approval rules, budget, test scenarios. Custom: focused interview +
editable report (no repeated Phase-1 questions). Integrations + mock credential
placeholders only AFTER the agent plan is approved; "Connection required" with
Connect later / Use mock connection. Never ask for real keys.

## 14. Sandbox

Focused validation workspace: LEFT rail = scenario list (status, category,
pass/fail count, ≤5 visible, filters/groups for more); MAIN = selected scenario,
input, expected behavior, Run test, step timeline (Preparing → Running trigger →
Agent action → Human checkpoint → Result); RIGHT panel/drawer = output, approval
checkpoints, warnings, evidence; HEADER summary = passed, remaining, critical
failures, Ready-for-activation status. Passed / Needs review / Failed via labels +
icons, not color alone. Start/Stop/Run again/Continue aligned.

## 15. Activation

Step 7 channels: In app, WhatsApp, Email as clearly selectable channel buttons
(outline, platform icon, label, short description, selected checkmark, multiple
selection). WhatsApp + Email show small mock notification previews labeled "Mock
notification enabled". Activate Workforce stays separate + visually dominant.

## 16. Operations workspace

Hierarchy: 1 top summary (active workflows, approvals needed, workflows at risk,
today's scheduled work); 2 primary column (Approval Inbox / team activity);
3 secondary column (today's schedule, next runs, recent outcomes); 4 team tabs;
5 compact universal command bar with examples; 6 secondary sections (activity,
connected tools, cost summary, weekly outcomes). One dominant grid; no cards in
cards in cards; every number has a label + timeframe.

**Ask Oriant fab**: unmistakably a button (visible outline/boundary, raised
surface, icon + label, hover elevation, focus ring, ≥44px); panel must not obscure
critical actions; respect mobile safe areas + bottom nav.

## 17. Calendar

Event icon/icon-background colors match the legend, consistent across month view,
day view, approvals panel, and details (pending amber, approved teal/dark navy,
needs review blue, failed red) + text labels always. Day timeline blocks: ~16px
vertical / 18-20px horizontal padding desktop, 10-12px gaps, time column, title,
agent, status, quick action; clicking a pending block opens/focuses its approval;
long titles wrap to two lines.

## 18. Daily Digest

Grouped summary, not a feed: Today at a glance (completed, approvals needed,
exceptions, est. time saved, mock AI cost) / Needs your attention (priority + due
sorted) / Completed automatically (grouped by team) / Coming up / Insights (1-2
concise recommendations). Expandable details; date, coverage period, "Generated
from mock activity" label.

## 19. Global sweep

Buttons ≥44px, consistent padding/radius/focus/loading; inputs ≥44px with aligned
labels/helper/error spacing; cards 16 mobile / 20-24 desktop padding,
content-driven height; selects same height as inputs; tabs visible active state +
keyboard; footer actions stable; icon buttons 44px + tooltip + aria-label. Icons
never change button height. Mobile wraps intentionally, ≥8px gaps. Remove one-off
inline padding where a token should be used.

## 22. Acceptance tests

G-01 no em dashes in visible copy · G-02 4 breakpoints no overflow/clipping ·
G-03 all controls have visible states + consistent padding · L-01 Build stage
shows tool/MCP connection · L-02 Human Approval above Orchestrator · L-03 Tech
Stack gone, Showcase operational · O-01 mode cards selectable, no layout shift ·
O-02 catalog + custom app both land in Your tools and persist · LC-01 demo canvas
renders contained board · LC-02 long text expands without clipping · D-01 demo
interview updates transcript/facts/report · R-01 rejecting one fact leaves others
unchanged · R-02 Contents/Completeness never obstruct · P-01 drag agent → plan,
cost, readiness, undo update · P-02 compact bar expands, applies change, new
version, undo · P-03 all six trigger types configurable · S-01 sandbox timeline
readable + aligned · A-01 channel buttons look like buttons · W-01 Ask Oriant
obvious, panel non-obstructive · C-01 calendar colors match legend everywhere ·
C-02 day timeline comfortable + opens approvals · DD-01 digest grouped + scannable.

## 24. Deliverables

Implemented changes; `docs/PRODUCT_UI_REVISION_AUDIT.md` (route audit + before
issues + verification); per-route summary; shared components/tokens changed list;
known limitations; before/after screenshots; acceptance test results; lint +
type-check + production build results.
