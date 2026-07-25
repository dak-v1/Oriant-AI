# Outcrowd Reference Audit → Oriant.ai Adaptation

**Reference:** https://www.outcrowd.io/ (homepage), studied 2026-07-22.

**Observation method.** The reference was inspected live in the in-app browser
at 1280px and 390px viewports via DOM, computed-style, and structural analysis:
section inventory with heights and backgrounds, sticky/fixed element detection,
typography measurements, per-element transform sampling, animation-machinery
detection, and full text extraction. This environment could not render
screenshots or scrub scroll playback (hidden compositor tab), so **motion
behaviours below are labelled either [observed] (structural evidence: element
kind, sticky geometry, per-layer class sets, live transform matrices, library
presence) or [inferred] (the standard behaviour of the detected machinery —
GSAP ScrollTrigger, Lenis, Lottie, Webflow interactions — applied to that
structure).** No Outcrowd content, artwork, code, or layout is copied; the
table's last column is the original Oriant.ai translation.

**Machinery detected:** Webflow + GSAP + ScrollTrigger + Lenis smooth scroll +
Lottie (SVG clip-mask animations) + jQuery; custom cursor ×2; full-screen
preloader; fixed 51px header; page height 15,601px at 1280×720 (≈21 viewports).

**Deliberately not adopted** (brief §21/§22 exclusions or out of character for
Oriant): the preloader, the custom cursor pair, jQuery/GSAP/Lenis stack (we
keep one architecture: framer-motion + native sticky), marketing performance
statistics ($300m/60+/100M/24% — replaced by product principles).

## Audit table

| Reference area | Composition | Motion behaviour | Oriant.ai adaptation |
|---|---|---|---|
| Navigation | Slim fixed header (51px) with 4 links + email + Contact pill; logo left; generous empty middle | Link labels are duplicated in the DOM ("CasesCases") — a hover text-swap where the second copy slides in [observed structure, inferred motion]; header stays fixed while sections scroll behind a fixed top-gradient scrim [observed] | Two-state nav: full row integrated into the hero surface (logo, 6 links, CTA) that contracts into a floating pill capsule (logo mark + Contact + Start Free Discovery + menu) after leaving the hero; blur + border + shadow deepen on contraction; link hover uses a small y-swap of label copies; no hide/show jerk |
| Hero | 2,016px tall at 1280×720 (~1.6 viewports of choreography before the next section); oversized medium-weight headline (56.8px ≈ 4.4vw, weight 500, line-height 1.0, tracking −0.01em); **7–11 independent artwork layers** (`hero-paralax set-1…set-7`) — Lottie SVGs with clip-path masks — scattered around and overlapping the headline, partially cropped at the edges; a central 599px video; one small gradient stat card | Each `set-N` layer carries its own transform matrix (sampled: differing live offsets/scales per layer) → per-layer parallax rates and idle drift [observed matrices, inferred rates]; extra scroll height implies the hero plays a scroll-out sequence before releasing [observed geometry, inferred behaviour] | Near-full-viewport hero on #F3F4F0: display headline `clamp(4.5rem, 8vw, 9rem)` revealed line-by-line through overflow clip masks; an original **orchestrator field** — large central Orchestrator node (25–35% larger, slightly right of centre) orbited by 7 agent nodes as layered soft cards at 3 depth tiers with different scroll-parallax rates, curved SVG connectors drawn progressively, small data packets, edge-cropped outer nodes; scroll-out: headline drifts up and fades to ~25%, field scales to ~1.12 while outer nodes drift outward, crossfading into the video section |
| Dark manifesto band | #080808 section (1,040px): one conversational statement (~41px) + **four giant numerals** (99.5px ≈ 7.8vw) each with a one-line caption | Section flips page rhythm light→dark immediately after the hero; numerals are the composition [observed structure] | Manifesto section: two-sentence editorial statement at `clamp(2.8rem, 5vw, 6rem)` revealed line-by-line via clip masks with one emphasised word; below, **four product principles** (01 Discovery / 02 Planning tiers / Human-controlled / One workspace) set as oversized numerals/keywords with captions — principles, not invented statistics; background shifts subtly (#F3F4F0 → #E9EDE8) as the section enters |
| Stage narrative | "Stages of startup development": 2,880px dark section containing a **720px (viewport-height) `position: sticky` wrap** (`cases-sticky-wrap`, top: 0); stage labels (Pre-seed Bootstrapped…) each with a paragraph | The inner panel pins while ~3 viewports of scroll drive stage changes; inactive stages remain in DOM (emphasis shift, not unmount) [observed sticky geometry; inferred stage-switch mechanics] | "From business context to a working AI workforce": a ~350vh section whose inner viewport-height panel is native-sticky; left rail lists 7 stages (Discover→Stay Connected) with number, title, one sentence; right panel holds one large visual that crossfades/mask-swaps per stage (Lean Canvas fragments, tiered plan, approval card, generated files, sandboxed deploy, workspace, messaging paths); scroll progress drives the active stage + a continuous progress line; mobile = plain vertical stage cards, no pinning |
| Project showcases | Second dark section 2,803px with 13 large media frames in sequence; each case = oversized visual + short meta | Long scroll rhythm — one big visual at a time, generous spacing [observed structure] | Three **workflow showcases** (Customer ops / Finance ops / Marketing ops): each a tall block with an oversized original product composition (agents involved, human approval point, expected result), alternating light `#FAFAF7` and dark `#111827` panels; visuals scale-reveal inside masked containers as they enter |
| Services display heading | Standalone display heading section — "Services" at 124.4px (≈ 9.7vw) — followed by a conversational subheading paragraph section (450px) on light | Oversized single-word typography as a full section beat [observed] | The same editorial-beat idea carries the problems→solution section: display-scale statement ("Growing businesses know AI matters. Most still do not know where to begin."), a five-line problem list set as large editorial text lines that sharpen from muted→ink as they cross the viewport centre, then the solution statement with a compact capability index |
| Light relief sections | Clients (1,640px) and testimonial (982px) on #FFF between dark bands — a deliberate light/dark alternation across the page | Rhythm: light hero → dark ×3 → light ×2 → dark ×4 [observed] | Same alternation grammar with the Oriant palette (never pure white): #F3F4F0 hero/video → #E9EDE8 shift in manifesto → light stages → #FAFAF7 capability grid → light marquee → alternating showcases → #111827 approvals → light improvement → #E9EDE8 technology → light FAQ → #111827 CTA + footer |
| FAQ | Dark accordion, 13 toggle rows, plain question rows | Webflow dropdown toggles [observed structure] | Light accessible accordion, 10 Oriant questions, grid-rows height animation, single-open, full keyboard + `aria-expanded`/`aria-controls` |
| Final CTA | Dark section, ~100px heading, two actions (Write us / Book a call) | Oversized close, no card chrome [observed] | Dark #111827 closer: "Turn how your business works into a workforce that works with you." at display scale over a restrained ambient workflow drift (few slow nodes/paths), primary + secondary CTA |
| Footer | Dark footer with nav, social links, email | — | Dark #111827 footer: logo, one-line descriptor, Product/Company link columns, Privacy/Terms, © line; no invented social links |
| Motion system | GSAP + ScrollTrigger + Lenis momentum scrolling + Lottie masks; custom cursor | Site-wide smooth-scroll interpolation and pinned timelines [observed libraries] | One architecture: framer-motion (`useScroll`, `useTransform`, `useInView`, MotionConfig) + native `position: sticky` + CSS clip/mask reveals; native scrolling preserved (no Lenis) with `scroll-behavior: smooth` for anchors; all choreography reduced-motion-safe |
| Mobile (390px) | h1 42px; hero collapses 2,016 → 814px (scroll choreography removed); 7 of 11 artwork layers retained; zero horizontal overflow | Choreography simplified rather than shrunk [observed] | Same policy: mobile recomposes each visual (stacked hero, vertical stage cards, simplified showcases, 3 slower marquee rows), removes parallax/pinning, keeps every piece of content |

## Type & rhythm facts used

- Reference display scale at 1280: h1 56.8px, section h2 42–57px, display beats 99–124px, all **weight 500, line-height ≈1.0, tracking ≈−0.01em** → Oriant uses Manrope 650–750 (not 800) at `clamp(4.5rem, 8vw, 9rem)` display / `clamp(2.8rem, 5vw, 6rem)` sections, line-height 0.98–1.05, tracking −0.02em.
- Section heights routinely 1.4–4× viewport → Oriant sections get 120–220px desktop padding (72–112px mobile) and the stage/showcase sections get real scroll room instead of viewport-squeezed cards.

## Section-by-section implementation plan

1. **Tokens & motion constants** — new palette (#F3F4F0 / #E9EDE8 / #FAFAF7 / #101828 / #667085 / #3157D5 / #2647B8 / #20A392 / #E8EDFC / #DFF3EF / #D8DDD6 / #111827 / #B8C0CC) in `app/landing.css`; shared easing `cubic-bezier(0.22,1,0.36,1)` + duration scale in `components/landing/motion.ts`. No red-pink tokens remain; no pure-white section backgrounds.
2. **LandingNavbar** — hero-integrated full row → floating compact capsule past the hero; eased width/padding/blur morph; mobile menu; CTA always visible.
3. **HeroSection + OrchestratorField** — line-mask headline reveal → staged field build (nodes layer in, connectors draw, packets start last) → scroll-out zoom/fade crossfade into the video section; 3 parallax tiers; ≤6px pointer drift, desktop only.
4. **VideoRevealSection** — tall (~220vh) sequence: sticky frame scales 0.82→1, radius 32→20px, ambient light sweep; `/video/oriant-product-demo.mp4` (legacy `/videos/` fallback) with designed placeholder; never autoplays audio.
5. **ManifestoSection** — line-clipped manifesto + four principle numerals, staggered.
6. **ProblemSolutionEditorial** — editorial problem lines (muted→ink emphasis on scroll) + solution statement + capability index; no card grid.
7. **StageJourney** — 7-stage pinned narrative (sticky panel + rail + per-stage visual crossfades); vertical cards on mobile.
8. **CapabilityComposition** — varied modular grid (2-col, tall, 2×medium, wide, compact) with per-card micro-animations and varied reveal directions.
9. **TriplePlatformMarquee** — 3 seamless rows (L→R, R→L, L→R) at three speeds, edge masks, hover slow/pause + keyboard pause, static grid under reduced motion.
10. **WorkflowShowcases** — three tall alternating showcases with masked visual reveals.
11. **ApprovalsDark** — dark narrative: queue + calendar + messaging notification with an 8-step choreographed loop; labelled, colour-independent statuses (amber outline Pending / teal fill Approved / blue outline Review requested).
12. **ImprovementLoop** — Run→Observe→Recommend→Review→Approve→Improve cycle around a central agent card; teal = approved improvements; one cycle animates on entry.
13. **TechStack** — layered operating-stack diagram (Business context → AI planning (AI&) → Agent build (Doubleword) → Safe validation (Daytona) → Deployment & operations, plus Nosana for compute-heavy work) in owner language.
14. **FAQSection** — 10 questions, accessible accordion.
15. **FinalCTA + LandingFooter** — dark display-scale closer + dark footer.
16. **Sweep** — reduced-motion pass, 5-breakpoint responsive pass, keyboard pass, lint/typecheck/build, then remove superseded components.
