"use client";
/**
 * ReportExperience — the company report + Human Approval Gate 1 (spec §10).
 *
 * Split layout at ≥1024px: sticky outline (left) · editable document paper
 * (centre) · evidence rail for the active section (right). Below 1024px the
 * outline becomes a horizontal strip and evidence opens in a Drawer overlay.
 * A sticky footer carries completeness, fact totals, the gaps line and the
 * single primary action — Approve and send to Planner.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { FileCheck2, TriangleAlert } from "lucide-react";
import type { ReportSectionId } from "@/lib/mock/types";
import { useDemoStore } from "@/lib/mock/store";
import { atLeast } from "@/lib/mock/state-machine";
import { REPORT_SECTIONS, REPORT_SECTION_ORDER } from "@/lib/mock/fixtures/company-report";
import { DISCOVERY_QUESTIONS } from "@/lib/mock/fixtures/discovery-questions";
import { DEMO_COMPANY } from "@/lib/mock/fixtures/demo-company";
import { DEMO_TODAY } from "@/lib/mock/fixtures/ids";
import { DUR, EASE } from "@/lib/mock/motion";
import Drawer from "@/components/mock/ui/Drawer";
import StatusBadge from "@/components/mock/ui/StatusBadge";
import { toast } from "@/components/mock/ui/Toaster";
import ReportOutline from "./ReportOutline";
import ReportSectionCard from "./ReportSectionCard";
import EvidencePanel from "./EvidencePanel";
import ReportFooterBar from "./ReportFooterBar";
import { formatDemoDate, formatDemoDateTime } from "./report-utils";
import styles from "./report.module.css";

const SECTION_BY_ID = new Map(REPORT_SECTIONS.map((s) => [s.id, s]));

/** Viewport line (px from top) that decides which section is "active". */
const SCROLL_LINE = 170;

export default function ReportExperience() {
  const router = useRouter();
  const reduced = useReducedMotion();

  const report = useDemoStore((s) => s.report);
  const setSectionNote = useDemoStore((s) => s.setSectionNote);

  const [activeId, setActiveId] = useState<ReportSectionId>(REPORT_SECTION_ORDER[0]);
  const [drawerFor, setDrawerFor] = useState<ReportSectionId | null>(null);

  const sectionEls = useRef<Partial<Record<ReportSectionId, HTMLElement | null>>>({});

  /* ── derived totals (fixture counts, spec §10 bottom bar) ── */
  const confirmedCount = REPORT_SECTION_ORDER.filter(
    (id) => report.sections[id].status === "confirmed",
  ).length;

  const factTotals = useMemo(
    () =>
      REPORT_SECTIONS.reduce(
        (acc, s) => ({
          confirmed: acc.confirmed + s.confirmedFacts,
          assumptions: acc.assumptions + s.assumptions,
        }),
        { confirmed: 0, assumptions: 0 },
      ),
    [],
  );

  const gapCount = SECTION_BY_ID.get("missing-information")?.bullets.length ?? 0;

  const statuses = useMemo(() => {
    const out = {} as Record<ReportSectionId, "draft" | "confirmed" | "rejected">;
    for (const id of REPORT_SECTION_ORDER) out[id] = report.sections[id].status;
    return out;
  }, [report.sections]);

  /* ── scroll-position → active outline section ── */
  useEffect(() => {
    let raf = 0;
    const compute = () => {
      raf = 0;
      let current: ReportSectionId = REPORT_SECTION_ORDER[0];
      for (const id of REPORT_SECTION_ORDER) {
        const el = sectionEls.current[id];
        if (el && el.getBoundingClientRect().top <= SCROLL_LINE) current = id;
      }
      setActiveId((prev) => (prev === current ? prev : current));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(compute);
    };
    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const jumpTo = useCallback(
    (id: ReportSectionId) => {
      setActiveId(id);
      sectionEls.current[id]?.scrollIntoView({
        behavior: reduced ? "auto" : "smooth",
        block: "start",
      });
    },
    [reduced],
  );

  /* ── approval flow (Gate 1) ── */
  const handleApprove = () => {
    const store = useDemoStore.getState();
    const wasStale = store.report.stale;
    store.approveReport();
    const next = useDemoStore.getState();
    // approveReport lands on "report_approved"; the planner route opens at
    // "planning" — advance only if the journey is not already past it.
    if (!atLeast(next.journey, "planning")) store.setJourney("planning");
    toast({
      title: `Company Report v${next.report.version} — Approved`,
      detail: wasStale
        ? "The Workforce Planner will regenerate from this version."
        : "Sent to the AI Workforce Planner.",
      tone: "ok",
    });
    router.push("/app/planner");
  };

  const handleSaveDraft = () =>
    toast({ title: "Draft saved", detail: "Autosave is on — every change is already kept.", tone: "ok" });

  const appendNote = (id: ReportSectionId, text: string) => {
    const existing = useDemoStore.getState().report.sections[id].ownerNote;
    setSectionNote(id, existing ? `${existing}\n${text}` : text);
  };

  const approved = report.status === "approved";
  const activeDef = SECTION_BY_ID.get(activeId) ?? REPORT_SECTIONS[0];
  const activeIndex = REPORT_SECTION_ORDER.indexOf(activeDef.id);
  const drawerDef = drawerFor ? SECTION_BY_ID.get(drawerFor) : undefined;

  return (
    <>
      <div className={styles.wrap}>
        {/* ── Left: outline ── */}
        <ReportOutline
          statuses={statuses}
          activeId={activeId}
          confirmedCount={confirmedCount}
          onJump={jumpTo}
        />

        {/* ── Centre: the document ── */}
        <div className={styles.centre} style={{ maxWidth: 760 }}>
          {/* Stale / approved banners */}
          <AnimatePresence initial={false}>
            {report.stale && (
              <motion.div
                key="stale"
                className={`${styles.banner} ${styles.bannerStale}`}
                role="status"
                initial={reduced ? false : { opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: DUR.card, ease: EASE }}
              >
                <TriangleAlert size={16} className={styles.bannerIcon} aria-hidden />
                <p className={styles.bannerText}>
                  <strong>Editing an approved report re-opens it</strong> — the workforce plan is
                  marked stale and will need regeneration after you re-approve.
                </p>
              </motion.div>
            )}
            {approved && report.approvedAt && (
              <motion.div
                key="approved"
                className={`${styles.banner} ${styles.bannerApproved}`}
                role="status"
                initial={reduced ? false : { opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: DUR.card, ease: EASE }}
              >
                <FileCheck2 size={16} className={styles.bannerIcon} aria-hidden />
                <p className={styles.bannerText}>
                  <strong>Company Report v{report.version} — Approved</strong> on{" "}
                  {formatDemoDateTime(report.approvedAt)}. Sections are locked; editing any section
                  re-opens the report as a new draft.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.article
            className={`oa-card ${styles.paper}`}
            initial={reduced ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DUR.page, ease: EASE }}
          >
            {/* Document header */}
            <header className={styles.docHead}>
              <p className="oa-eyebrow">{DEMO_COMPANY.name}</p>
              <div className={styles.docHeadTop}>
                <h2 className={styles.docTitle}>
                  Company <span className="oa-serif">Understanding</span> Report
                </h2>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={`${report.status}-${report.version}-${report.stale}`}
                    initial={reduced ? false : { opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    transition={{ duration: DUR.micro, ease: EASE }}
                  >
                    {approved ? (
                      <StatusBadge status="approved" label={`Company Report v${report.version} — Approved`} />
                    ) : (
                      <span className={styles.versionChip}>
                        Draft v{report.version}
                        {report.stale ? " — re-opened" : ""}
                      </span>
                    )}
                  </motion.span>
                </AnimatePresence>
              </div>
              <p className={styles.docDateLine}>
                {approved && report.approvedAt
                  ? `Approved ${formatDemoDateTime(report.approvedAt)}`
                  : `Prepared ${formatDemoDate(DEMO_TODAY)}`}
                <span aria-hidden>·</span>
                {REPORT_SECTIONS.length} sections
                <span aria-hidden>·</span>
                Built from onboarding, your Lean Canvas and {DISCOVERY_QUESTIONS.length} interview
                answers
              </p>
            </header>

            {/* Sections */}
            {REPORT_SECTIONS.map((def, i) => (
              <ReportSectionCard
                key={def.id}
                def={def}
                state={report.sections[def.id]}
                index={i}
                reportApproved={approved}
                onOpenEvidence={() => {
                  setActiveId(def.id);
                  setDrawerFor(def.id);
                }}
                sectionRef={(el) => {
                  sectionEls.current[def.id] = el;
                }}
              />
            ))}
          </motion.article>

          {/* Sticky approval footer */}
          <ReportFooterBar
            confirmedCount={confirmedCount}
            factTotals={factTotals}
            gapCount={gapCount}
            reportStatus={report.status}
            stale={report.stale}
            version={report.version}
            onSaveDraft={handleSaveDraft}
            onApprove={handleApprove}
            onOpenPlanner={() => router.push("/app/planner")}
          />
        </div>

        {/* ── Right: evidence rail (≥1024px) ── */}
        <aside className={styles.rail} aria-label="Evidence for the active section">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeDef.id}
              className={`oa-card oa-card--flat ${styles.railCard}`}
              initial={reduced ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: DUR.micro, ease: EASE }}
            >
              <EvidencePanel
                def={activeDef}
                state={report.sections[activeDef.id]}
                sectionNumber={activeIndex + 1}
                onAddNote={(text) => appendNote(activeDef.id, text)}
              />
            </motion.div>
          </AnimatePresence>
        </aside>
      </div>

      {/* Evidence drawer (below 1024px) */}
      <Drawer
        open={drawerFor !== null}
        onClose={() => setDrawerFor(null)}
        title={drawerDef?.title ?? ""}
        eyebrow="Evidence & notes"
      >
        {drawerDef && (
          <EvidencePanel
            def={drawerDef}
            state={report.sections[drawerDef.id]}
            sectionNumber={REPORT_SECTION_ORDER.indexOf(drawerDef.id) + 1}
            onAddNote={(text) => appendNote(drawerDef.id, text)}
          />
        )}
      </Drawer>
    </>
  );
}
