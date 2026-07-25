# Oriant.ai mock — screen-building conventions

Read this BEFORE building any screen. It is the contract that keeps every
screen looking like one product.

## The stack you build on (already done — do not modify)

| File | What it gives you |
|---|---|
| `app/app/app.css` | `.oa` design system: tokens + every shared primitive class |
| `app/app/layout.tsx` | The persistent shell (side nav, top bar, progress, ⌘K palette). Your page renders inside `.oa` → just export a page component |
| `lib/mock/types.ts` | All contracts |
| `lib/mock/store.ts` | `useDemoStore` — ALL state + actions. Never invent local copies of journey state |
| `lib/mock/state-machine.ts` | `atLeast`, `homeRouteFor`, `PROGRESS_PHASES` |
| `lib/mock/services/index.ts` | Deterministic timed services; `{ instant }` opt for reduced motion / fast paths |
| `lib/mock/services/timeline.ts` | `runTimeline`, `stageSteps` for bespoke sequences |
| `lib/mock/motion.ts` | `EASE`, `DUR`, `STAGGER`, `fadeUp` |
| `lib/mock/pricing.ts` | `planTotals`, `money` |
| `lib/mock/fixtures/*` | All content. NEVER hardcode content strings in components that exist in a fixture |

Shared components (`components/mock/ui/`):
- `VoiceAnswer` — the voice capture interaction. USE IT for every voice moment.
- `Drawer` — right-hand panel (config, review, evidence). Props: open, onClose, title, eyebrow?, wide?, footer?
- `Waveform` — voice bars (active, height?, bars?, color?)
- `CodeViewer` — tabbed YAML/JSON/MD viewer (files: ArtifactFile[])
- `StatusBadge` — status → labeled badge. Use for EVERY status; never a bare dot.
- `ProvenanceChip` — fact source + confidence.
- `Toaster` — already mounted by the shell. Fire with
  `import { toast } from "@/components/mock/ui/Toaster"` →
  `toast({ title, detail?, tone: "ok" | "info", action?: { label, onClick } })`.
  Use for change summaries, autosave notes and mock actions; supports Undo.

## Page skeleton

Every page is a client component:

```tsx
"use client";
export default function XPage() {
  const journey = useDemoStore((s) => s.journey);
  // page content
  return (
    <main className="oa-page">
      <header className="oa-between" style={{ marginBottom: 24 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <p className="oa-eyebrow">Phase · Step</p>
          <h1 className="oa-h1">Screen title</h1>
          <p className="oa-lead">One-sentence purpose in plain business language.</p>
        </div>
        {/* the ONE primary action for this screen, right-aligned */}
      </header>
      …
    </main>
  );
}
```

- `oa-page` = padded, max 1480px. `oa-page--narrow` (980px) for document-like
  screens (onboarding, report). Wide layouts (planner, calendar) use `oa-page`.
- ONE `oa-btn--primary` visible per screen state. Everything else ghost/soft/sm.
- Headings: page = `oa-h1`, card/section = `oa-h3`, big section = `oa-h2`.
  Use `<span className="oa-serif">` for at most ONE italic accent word in a
  page title (landing style), optional.

## CSS

- Colocate a CSS Module per experience folder (e.g. `components/mock/planner/planner.module.css`).
- Use `.oa-*` primitives for anything generic; module classes ONLY for layout
  (grids, splits, timeline geometry). Always use `var(--oa-*)` tokens — never
  raw hex. Radii: cards 18px (`--oa-r-card`), inner 14px, chips round.
- Responsive per spec §21: check your layout at 1440 / 1024 / 768 / 390.
  Grid → single column at ≤768px. No horizontal page overflow: wide content
  gets its own `overflow-x: auto` container.

## Motion (spec §20)

- framer-motion, easing `EASE`, durations from `DUR`. One primary motion
  concept per screen (see spec §20 table).
- Entrances: `initial={{opacity:0, y:12}} animate={{opacity:1, y:0}}` with
  small stagger. Lists that reorder: `<motion.div layout>` + `AnimatePresence`.
- ALWAYS call `useReducedMotion()` and collapse travel/waveform/path motion to
  instant state changes. Timed services: pass `{ instant: Boolean(reduced) }`
  where a wait would block reading content.
- Never gate a button behind an animation finishing.

## Simulation honesty (spec IMPORTANT)

Any simulated capability shows a quiet label: `<span className="oa-sim-note">`
("Simulated build", "Prepared demo result", "No real message is sent").
The shell already shows the global Interactive Demo badge — screen labels are
for the specific simulated act, not the whole page.

## Accessibility (spec §21)

- Real `<button>`/`<a>` semantics; keyboard operable everything.
- `aria-live="polite"` on streaming regions (transcripts, build logs, status).
- Tabs use `role="tablist"/"tab"` + `aria-selected` (see CodeViewer).
- Status always text + icon/badge, never colour alone (use StatusBadge).
- Label icon-only buttons with `aria-label`.

## Store rules

- Read state with selectors: `useDemoStore((s) => s.plan)`.
- Mutate ONLY via store actions. If an action you need is missing, add it to
  `lib/mock/store.ts` ONLY if you own that slice per your brief; otherwise
  note it in your report.
- Journey transitions: use the dedicated actions (approveReport,
  approvePlan, finishBuildPhase, …) — never setJourney directly except in
  fast-forward code.
- Cleanup: every service handle you start in an effect must be cancelled on
  unmount (`return () => handle.cancel()`).

## File ownership

You own ONLY: your route files under `app/app/<your-routes>/` and your
component folder `components/mock/<your-area>/`. Shared files (store, types,
fixtures, ui/, shell/, app.css) are read-only for you unless your brief says
otherwise. Report any shared-file need instead of editing.
