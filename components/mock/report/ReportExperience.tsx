"use client";
/**
 * ReportExperience — the company report + Human Approval Gate 1 (spec §10,
 * improvement spec §11).
 *
 * Split layout at ≥1024px: sticky left column (Contents + Completeness) ·
 * editable document paper (centre) · evidence rail for the active section
 * (right). Below 1024px the left column renders above the document in normal
 * flow and evidence opens in a Drawer. Review progress is fact-based
 * ("18 of 30 facts confirmed"); the approval bar sits in normal flow at the
 * end of the report so nothing ever obstructs content (R-02).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, ChevronUp, FileCheck2, TriangleAlert } from "lucide-react";
import type { OnboardingState, ReportSectionId } from "@/lib/mock/types";
import type { CompanyReport } from "@/lib/contracts";
import { useDemoStore } from "@/lib/mock/store";
import { atLeast } from "@/lib/mock/state-machine";
import { DEMO_TODAY } from "@/lib/mock/fixtures/ids";
import { DUR, EASE } from "@/lib/mock/motion";
import Drawer from "@/components/mock/ui/Drawer";
import StatusBadge from "@/components/mock/ui/StatusBadge";
import { toast } from "@/components/mock/ui/Toaster";
import ReportOutline from "./ReportOutline";
import ReportSectionCard from "./ReportSectionCard";
import EvidencePanel from "./EvidencePanel";
import ReportFooterBar from "./ReportFooterBar";
import { effectiveFactStatus } from "./ReportFactList";
import {
  buildDynamicReportFacts,
  buildDynamicReportSections,
  factsBySection,
} from "./report-data";
import { formatDemoDate, formatDemoDateTime } from "./report-utils";
import styles from "./report.module.css";

const INTERNAL_HANDOFF_ID = "internal-json-handoff" as const;
type ReportPaneSectionId = ReportSectionId | typeof INTERNAL_HANDOFF_ID;

/** Viewport line (px from top) that decides which section is "active". */
const SCROLL_LINE = 170;

export default function ReportExperience() {
  const router = useRouter();
  const reduced = useReducedMotion();

  const report = useDemoStore((s) => s.report);
  const setSectionNote = useDemoStore((s) => s.setSectionNote);
  const syncOnboardingFromServer = useDemoStore((s) => s.syncOnboardingFromServer);
  const syncDiscoveryFromServer = useDemoStore((s) => s.syncDiscoveryFromServer);

  const onboarding = useDemoStore((s) => s.onboarding);
  const discovery = useDemoStore((s) => s.discovery);
  const [organizationName, setOrganizationName] = useState("Organization");
  const [sourceReport, setSourceReport] = useState<CompanyReport | null>(null);
  const sections = useMemo(() => buildDynamicReportSections(onboarding, discovery, sourceReport), [onboarding, discovery, sourceReport]);
  const sectionById = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections]);
  const visibleSectionOrder = useMemo(() => sections.map((section) => section.id), [sections]);
  const reportFacts = useMemo(() => buildDynamicReportFacts(onboarding, discovery), [onboarding, discovery]);
  const reportFactsBySection = useMemo(() => factsBySection(reportFacts), [reportFacts]);
  const [handoffJson, setHandoffJson] = useState<Record<string, unknown> | null>(null);
  const [handoffError, setHandoffError] = useState<string | null>(null);

  const [activeId, setActiveId] = useState<ReportPaneSectionId>(sections[0]?.id ?? "company-overview");
  const [drawerFor, setDrawerFor] = useState<ReportSectionId | null>(null);
  const [handoffExpanded, setHandoffExpanded] = useState(false);

  const sectionEls = useRef<Partial<Record<ReportPaneSectionId, HTMLElement | null>>>({});

  const approved = report.status === "approved";

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetch("/api/onboarding/session", { cache: "no-store" }),
      fetch("/api/discovery/session", { cache: "no-store" }),
      fetch("/api/report/handoff", { cache: "no-store" }),
    ]).then(async ([onboardingRes, discoveryRes, handoffRes]) => {
      if (cancelled) return;
      if (onboardingRes.ok) {
        const data = await onboardingRes.json() as {
          organizationName?: string;
          session?: {
            preferredChannel?: "typed" | "voice";
            organization?: { shape?: OnboardingState["organizationShape"]; employeeCount?: number; approvalOwner?: string; employeeEmails?: string[] };
            selectedToolIds?: string[];
            consentAccepted?: boolean;
            answers?: Record<string, { value: unknown }>;
          };
          };
        setOrganizationName(data.organizationName ?? "Organization");
        const session = data.session;
        if (session) {
          const answers = session.answers ?? {};
          const value = (id: string) => answers[id]?.value;
          syncOnboardingFromServer({
            channel: session.preferredChannel ?? "typed",
            organizationShape: session.organization?.shape ?? "solo",
            employeeCount: typeof session.organization?.employeeCount === "number" ? String(session.organization.employeeCount) : "",
            approvalOwner: session.organization?.approvalOwner ?? "",
            employeeEmails: session.organization?.employeeEmails ?? [],
            intro: typeof value("company_intro") === "string" ? value("company_intro") as string : "",
            businessArea: typeof value("business_area") === "string" ? value("business_area") as string : "",
            repetitiveTask: typeof value("repetitive_task") === "string" ? value("repetitive_task") as string : "",
            currentWorkflow: typeof value("current_workflow") === "string" ? value("current_workflow") as string : "",
            selectedToolIds: session.selectedToolIds ?? [],
            consentAccepted: session.consentAccepted ?? false,
          });
        }
      }
      if (discoveryRes.ok) {
        const data = await discoveryRes.json() as {
          answers?: Record<string, string>;
          clarificationAnswers?: Record<string, string>;
          clarificationQuestions?: Array<{ id: string; question: string }>;
          report?: CompanyReport | null;
          completedAt?: string | null;
        };
        setSourceReport(data.report ?? null);
        syncDiscoveryFromServer({
          answers: data.answers ?? {},
          clarificationAnswers: data.clarificationAnswers ?? {},
          clarificationQuestions: data.clarificationQuestions ?? [],
          completed: Boolean(data.completedAt),
        });
      }
      if (handoffRes.ok) {
        setHandoffJson(await handoffRes.json() as Record<string, unknown>);
        setHandoffError(null);
      } else {
        const error = await handoffRes.json().catch(() => ({})) as { error?: string };
        setHandoffError(error.error ?? "The internal handoff could not be loaded.");
      }
    }).catch(() => {
      setHandoffError("The Supabase-backed internal handoff could not be loaded.");
    });
    return () => { cancelled = true; };
  }, [syncDiscoveryFromServer, syncOnboardingFromServer]);

  /* ── fact-level review totals (improvement spec §11.2/§11.3) ── */
  const factStats = useMemo(() => {
    let confirmed = 0;
    let unresolved = 0;
    for (const fact of reportFacts) {
      const status = effectiveFactStatus(report.facts[fact.id], approved);
      if (status === "confirmed") confirmed += 1;
      if (status === "unreviewed" || status === "rejected") unresolved += 1;
    }
    return {
      total: reportFacts.length,
      confirmed,
      needsReview: reportFacts.length - confirmed,
      unresolved,
      missingInfoCount: sectionById.get("missing-information")?.bullets.length ?? 0,
    };
  }, [approved, report.facts, reportFacts, sectionById]);

  const statuses = useMemo(() => {
    const out = {} as Record<ReportSectionId, "draft" | "confirmed" | "rejected">;
    for (const id of visibleSectionOrder) out[id] = report.sections[id].status;
    return out;
  }, [report.sections, visibleSectionOrder]);

  /* ── scroll-position → active outline section ── */
  useEffect(() => {
    let raf = 0;
    const compute = () => {
      raf = 0;
      let current: ReportPaneSectionId = visibleSectionOrder[0] ?? "company-overview";
      for (const id of [...visibleSectionOrder, INTERNAL_HANDOFF_ID]) {
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
  }, [visibleSectionOrder]);

  const jumpTo = useCallback(
    (id: ReportPaneSectionId) => {
      setActiveId(id);
      sectionEls.current[id]?.scrollIntoView({
        behavior: reduced ? "auto" : "smooth",
        block: "start",
      });
    },
    [reduced],
  );

  /* "Go to next unresolved fact": first unreviewed or rejected fact in
     document order (improvement spec §11.3). */
  const jumpToUnresolved = useCallback(() => {
    const facts = useDemoStore.getState().report.facts;
    const isApproved = useDemoStore.getState().report.status === "approved";
    for (const sectionId of visibleSectionOrder) {
      for (const fact of reportFactsBySection[sectionId]) {
        const status = effectiveFactStatus(facts[fact.id], isApproved);
        if (status === "unreviewed" || status === "rejected") {
          setActiveId(sectionId);
          const el = document.getElementById(`fact-row-${fact.id}`);
          if (el) {
            el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
            el.focus({ preventScroll: true });
          }
          return;
        }
      }
    }
  }, [reduced, reportFactsBySection, visibleSectionOrder]);

  /* ── approval flow (Gate 1) ── */
  const handleApprove = async () => {
    const store = useDemoStore.getState();
    const wasStale = store.report.stale;
    try {
      const response = await fetch("/api/report/approve", { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error || "The company report could not be approved.");
      }
      // The server is authoritative. This only refreshes the in-memory view
      // after the Supabase-backed mutation succeeds.
      store.approveReport();
      const next = useDemoStore.getState();
      if (!atLeast(next.journey, "planning")) store.setJourney("planning");
      toast({
        title: `Company Report v${next.report.version} approved`,
        detail: wasStale ? "The Workforce Planner will regenerate from this version." : "Sent to the AI Workforce Planner.",
        tone: "ok",
      });
      router.push("/app/planner");
    } catch (error) {
      toast({ title: "Approval was not saved", detail: error instanceof Error ? error.message : "Try again.", tone: "info" });
    }
  };

  const handleSaveDraft = () =>
    toast({ title: "Draft saved", detail: "Autosave is on; every change is already kept.", tone: "ok" });

  const appendNote = (id: ReportSectionId, text: string) => {
    const existing = useDemoStore.getState().report.sections[id].ownerNote;
    setSectionNote(id, existing ? `${existing}\n${text}` : text);
  };

  const activeDef = activeId === INTERNAL_HANDOFF_ID
    ? sections[sections.length - 1]
    : (sectionById.get(activeId) ?? sections[0]);
  const activeIndex = visibleSectionOrder.indexOf(activeDef.id);
  const drawerDef = drawerFor ? sectionById.get(drawerFor) : undefined;

  return (
    <>
      <div className={styles.wrap}>
        {/* ── Left: Contents + Completeness ── */}
        <ReportOutline
          sections={sections}
          statuses={statuses}
          activeId={activeId}
          completeness={factStats}
          onJump={jumpTo}
          onJumpToUnresolved={jumpToUnresolved}
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
                  <strong>Editing an approved report re-opens it.</strong> The workforce plan is
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
                  <strong>Company Report v{report.version} approved</strong> on{" "}
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
              <p className="oa-eyebrow">{organizationName}</p>
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
                      <StatusBadge status="approved" label={`Approved · v${report.version}`} />
                    ) : (
                      <span className={styles.versionChip}>
                        Draft v{report.version}
                        {report.stale ? " · re-opened" : ""}
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
                {sections.length + 1} sections · {reportFacts.length} facts
                <span aria-hidden>·</span>
                Built from onboarding and {Object.keys(discovery.answers).length} captured interview answers
              </p>
            </header>

            {/* Sections */}
            {sections.map((def, i) => (
              <ReportSectionCard
                key={def.id}
                def={def}
                state={report.sections[def.id]}
                index={i}
                sectionFacts={reportFactsBySection[def.id]}
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

            <section
              id={`report-${INTERNAL_HANDOFF_ID}`}
              ref={(el) => {
                sectionEls.current[INTERNAL_HANDOFF_ID] = el;
              }}
              className={styles.section}
              aria-labelledby={`report-h-${INTERNAL_HANDOFF_ID}`}
            >
              <button
                type="button"
                className={styles.sectionToggle}
                aria-expanded={handoffExpanded}
                aria-controls={`report-panel-${INTERNAL_HANDOFF_ID}`}
                onClick={() => setHandoffExpanded((value) => !value)}
              >
                <div className={styles.sectionHead}>
                  <span className={styles.secNum}>13</span>
                  <h3 className="oa-h3" id={`report-h-${INTERNAL_HANDOFF_ID}`}>
                    Internal Json handoff
                  </h3>
                </div>
                <span className={styles.sectionToggleIcon} aria-hidden>
                  {handoffExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </span>
              </button>

              <AnimatePresence initial={false}>
                {handoffExpanded ? (
                  <motion.div
                    key="handoff-content"
                    id={`report-panel-${INTERNAL_HANDOFF_ID}`}
                    className={styles.sectionContent}
                    initial={reduced ? false : { opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: DUR.card, ease: EASE }}
                    style={{ overflow: "hidden" }}
                  >
                    <div className={styles.sectionBody}>
                      <p>
                        This structured payload is for internal handoff into the next agentic flow layer. It combines the onboarding setup, discovery answers, and current report state in one place.
                      </p>
                      <details className={styles.handoffBox}>
                        <summary className={styles.handoffToggle}>Open internal handoff JSON</summary>
                        {handoffError ? (
                          <p role="alert">{handoffError}</p>
                        ) : (
                          <pre className={styles.handoffPre}>{handoffJson ? JSON.stringify(handoffJson, null, 2) : "Loading the Supabase-backed handoff..."}</pre>
                        )}
                      </details>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </section>
          </motion.article>

          {/* Approval bar in normal flow at the end of the report (R-02) */}
          <ReportFooterBar
            factConfirmed={factStats.confirmed}
            factTotal={factStats.total}
            needsReview={factStats.needsReview}
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
            sectionNumber={visibleSectionOrder.indexOf(drawerDef.id) + 1}
            onAddNote={(text) => appendNote(drawerDef.id, text)}
          />
        )}
      </Drawer>
    </>
  );
}
