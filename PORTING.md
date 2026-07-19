# Porting guide — Margo.dc.html → React components

The design source is `reference/Margo.dc.html`. It is the **final look** — port
it with exact visual fidelity: same inline styles, same copy (keep unicode
punctuation `’ “ ” — ✶ ◇ ⚙ ✎ ⬆ ↺ ＋`), same spacing values.

## Conversion rules

1. **File header**: every screen component starts with `"use client";`.
2. **Inline styles** → `style={sx({ … })}` with `import { sx } from "@/lib/ui"`.
   Convert CSS names to camelCase (`font-family` → `fontFamily`). Numbers may
   stay numbers where unitless px is fine (`fontSize: 14.5` is valid → becomes px).
   Keep `var(--…)` strings verbatim.
3. **`style-hover="…"`** → utility classes + CSS vars (defined in `app/globals.css`):
   - `background:X` → class `hv-bg`, prop `"--hv-bg": "X"`
   - `color:X` → `hv-fg` + `--hv-fg`
   - `border-color:X` → `hv-bd` + `--hv-bd`
   - `border-style:X` → `hv-bs` + `--hv-bs`
   - `transform:X` → `hv-tf` + `--hv-tf`
   - `opacity:X` → `hv-op` + `--hv-op`
   - `box-shadow:X` → `hv-sh` + `--hv-sh`
   - `filter:X` → `hv-fil` + `--hv-fil`
   Multiple properties → multiple classes joined with spaces.
   Example: `style-hover="background:var(--ember);transform:translateY(-2px)"` →
   `className="hv-bg hv-tf" style={sx({ …, "--hv-bg": "var(--ember)", "--hv-tf": "translateY(-2px)" })}`.
4. **`<sc-if value="{{ x }}">…</sc-if>`** → `{v.x && (…)}`.
5. **`<sc-for list="{{ xs }}" as="x">…</sc-for>`** → `{v.xs.map((x, i) => (…))}` with a sensible `key`.
6. **`{{ expr }}`** → `{v.expr}` where `v` is the screen's view-model (see table).
7. **`onClick="{{ fn }}"`** → `onClick={v.fn}` or a store action (see table).
8. **Scroll reveal**: the design uses
   `animation:revUp .9s ease both;animation-timeline:view();animation-range:…`
   inline. Drop those three properties from the inline style and add
   `className="reveal"` instead (defined in globals.css, progressive enhancement).
9. **contentEditable** → `contentEditable suppressContentEditableWarning`.
10. Entities: `&amp;` → `&`  (write plain `&` in JSX text), keep `’` etc.
11. Inputs in the design use `value` + `onChange` — make them controlled React
    inputs (`e.target.value`).
12. Do NOT add UI beyond the design except where a screen's notes below say so.

## View-models and actions

State/store: `import { useApp } from "@/lib/store";` — call `const s = useApp();`
View-models: `import { … } from "@/lib/vals";` — pure functions of `s`, e.g.
`const v = callVals(s);`. Property names in the vals objects match the design's
template variables 1:1 (check `lib/vals.ts` for the exact list).

| Screen file (components/…) | Design lines | View-model | Key store actions |
|---|---|---|---|
| `Landing.tsx` | 48–225 | local consts (copy data from design lines 1455–1488) | `s.enterApp`, `s.toggleFaq`, `s.faqOpen` |
| `screens/CallScreen.tsx` | 273–369 | `callVals(s)` | `s.callAnswerVoice`, `s.callNext`, `s.callPick` (via `v.optionList[].pick`), `s.callUpload`, `s.callBuild`, `s.callMute`, `s.callToggleTx`, `s.callTxTabSet`, `s.endCall`, `s.resumeCall`, `s.callToReport` → `s.go("report")`, `s.callTypeInstead`, `s.callSetDraft`, `s.callConfirmDraft` |
| `screens/ReportScreen.tsx` | 372–529 | `reportVals(s)` | `s.saveReportExec` (onBlur of §01 paragraph), `s.approveReport` |
| `screens/PlannerScreen.tsx` | 532–698 | `plannerVals(s)` | `s.plTab`, `s.plSetNl`, `s.plPreview`, `s.plApplyDiff`, `s.plDiscardDiff`, `s.plUndo`, `s.addCustom`, `s.dropOnList`, `s.confirmWorkflow`, `s.plConfigBack`, `s.plConfigSave`, card callbacks live on `v.plTeamCards[]` / `v.plLibrary[]` / `v.plNodes[]` |
| `screens/DesignScreen.tsx` | 701–759 | `designVals(s)` | `s.dFill`, `s.dSay`, `s.dNext`, `s.dUpload`, `s.endDesign`, `s.resumeDesign`, `s.finishDesign`, `v.dList[].jump` |
| `screens/BuildScreen.tsx` | 762–815 | `buildVals(s)` | `s.startBuild`, `s.gotoValidate` |
| `screens/ValidateScreen.tsx` | 817–853 | `validateVals(s)` | `s.activate` |
| `screens/WorkspaceScreen.tsx` | 855–899 | `workspaceVals(s)` | `s.go("approvals")` |
| `screens/ApprovalsScreen.tsx` | 901–963 | `approvalsVals(s)` | `s.decide("approved" | "rejected")`, row `select` callbacks on `v.apRows[]` |

## Screen-specific notes (small functional additions — keep the design language)

- **CallScreen**
  - Compose area: in addition to the design's five compose states, render
    `v.composeReview`: a rounded card (`background:var(--card);border:1px solid var(--line2);border-radius:14px;padding:12px 14px;width:100%;max-width:480px`)
    containing a borderless `<textarea>` bound to `v.reviewDraft`
    (`onChange={(e)=>s.callSetDraft(e.target.value)}`, placeholder `v.reviewPh`)
    and a right-aligned ink pill button `Send →` (`onClick={s.callConfirmDraft}`,
    disabled-looking when empty). This is the transcript-review / typed path.
  - Under the mic button (composeVoice), add a small link:
    `<span onClick={s.callTypeInstead} style={…mono 11px, color:var(--ink3), cursor:pointer}>⌨ type instead</span>` (hover → ink).
  - Mic button: when `v.recording`, the inner mic glyph turns `var(--ember)` and
    label text says "Stop". When `v.transcribing` show the spinner animation
    (`animation:"spin .7s linear infinite"` ring) inside the button.
  - Done state ("Great call."): the CTA button reads `Read the brief →`; while
    `v.generating || !v.reportReady` render it with `background:var(--paper3);color:var(--ink3);cursor:default`
    and text `Writing the brief…` (with spin ring); onClick only when ready:
    `() => { void s.callToReport(); }` then `s.go("report")` happens in the action
    when the report exists — simply call `s.callToReport()`.
  - Transcript footer text: `Powered by Nosana · Whisper transcription` when
    `v.voiceLive`, else `Powered by Margo · demo transcription`.
- **ReportScreen**
  - If `!v.hasReport`: render a centered writing state (M avatar + spin ring +
    "Margo is writing your brief…" mono caption) instead of the document.
  - §01 paragraph: `contentEditable suppressContentEditableWarning`,
    `onBlur={(e) => s.saveReportExec(e.currentTarget.textContent ?? "")}`,
    children `{v.repExec}`.
  - Header version chip: `{v.repVersion}` instead of the hardcoded `v3 · draft`.
  - "Export DOCX / PDF" button → `onClick={() => window.print()}`.
- **PlannerScreen**
  - Version chip shows `Plan {v.plVer}`; if `v.plStale`, add after it a chip
    `border:1px solid var(--ochre);color:var(--ochre)` reading `Brief changed — replan`.
  - NL input: `onKeyDown` Enter triggers `s.plPreview()`. While `v.plNlBusy` the
    Preview button shows the spin ring.
  - Drag & drop: on draggable elements call the vals `dragStart` callback in React
    `onDragStart` (also `e.dataTransfer.setData("text/plain", id)` in try/catch);
    `onDragOver={(e)=>e.preventDefault()}`; drops call vals `drop`/`s.dropOnList`.
  - Config save button: `onClick={s.plConfigSave}` (labeled `Save & mark ready →`).
- **BuildScreen**
  - Provider line: `DOUBLEWORD · async inference · {v.doublewordLive ? "live" : "fixture"}`;
    dot color `var(--forest)` when live else `var(--ochre)`.
  - Generated-files card title: `{v.buildFilesAgent} · generated files`.
- **ValidateScreen**
  - Card title: `{v.firstAgentName}`; chip `Validated` only when `v.allValidated`,
    else chip text `Validating…` with `color:var(--ochre);border-color:var(--ochre)`.
  - Manifest values: `v.sandboxId`, `v.artifactHash`, `v.testsLabel`, `v.warningsLabel`.
  - Bottom bar: when `v.allValidated` exactly as designed; otherwise swap the ✓
    circle for a spin ring and text `Running sandbox validation…` and render the
    Activate button in the disabled style (`background:var(--paper3);color:var(--ink3)`).
  - Add under the manifest card a mono provider line like BuildScreen:
    `DAYTONA · sandbox validation · {v.validationMode}`.
- **ApprovalsScreen**
  - "Ask agent to revise" stays visual-only (no onClick).

## Definition of done per component

- Compiles under `strict` TypeScript (no `any` leaks; vals types are inferred).
- Every `{{ var }}`, `sc-if`, `sc-for`, `onClick`, `style-hover` from the design
  range is represented.
- No fetch calls inside components — all server work goes through store actions.
