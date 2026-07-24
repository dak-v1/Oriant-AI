"use client";
/**
 * DiscoveryWorkspace — the Discovery interview + What Oriant knows page
 * (spec §9, §10). Two tabs: the live call-like interview (voice / text /
 * cards / more modes) and the live knowledge model. "Prefill interview
 * (demo)" plays a fast simulated conversation through every unanswered
 * question (D-01). A floating call bar keeps the interview reachable while
 * the knowledge tab is open mid-question, and the compile overlay hands off
 * to the company report.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  FastForward,
  LayoutGrid,
  MessageSquareText,
  Mic,
  PhoneCall,
  Plus,
} from "lucide-react";
import { useDemoStore } from "@/lib/mock/store";
import { atLeast } from "@/lib/mock/state-machine";
import type { DiscoveryQuestion } from "@/lib/mock/types";
import { DISCOVERY_QUESTIONS } from "@/lib/mock/fixtures/discovery-questions";
import { DEMO_COMPANY } from "@/lib/mock/fixtures/demo-company";
import StatusBadge from "@/components/mock/ui/StatusBadge";
import Waveform from "@/components/mock/ui/Waveform";
import {
  runTimeline,
  type StepSpec,
  type TimelineHandle,
} from "@/lib/mock/services/timeline";
import { DUR, EASE } from "@/lib/mock/motion";
import VoiceMode from "./VoiceMode";
import TextMode from "./TextMode";
import CardsMode from "./CardsMode";
import MorePanel from "./MorePanel";
import KnowledgePanel from "./KnowledgePanel";
import CompileOverlay from "./CompileOverlay";
import styles from "./discovery.module.css";

type Tab = "interview" | "knowledge";
type Segment = "voice" | "text" | "cards" | "more";

/** One step of the simulated prefill conversation (spec §10, D-01). */
type PrefillEmit =
  | { kind: "show"; q: DiscoveryQuestion }
  | { kind: "words"; q: DiscoveryQuestion; count: number }
  | { kind: "confirm"; q: DiscoveryQuestion };

/** ~1.2s per question: show (160ms) + 5 word chunks (150ms each) + confirm (290ms). */
function prefillSteps(questions: DiscoveryQuestion[]): StepSpec<PrefillEmit>[] {
  const steps: StepSpec<PrefillEmit>[] = [];
  for (const q of questions) {
    steps.push({ delay: 160, emit: { kind: "show", q } });
    const words = q.answer.split(" ");
    const chunks = 5;
    const per = Math.ceil(words.length / chunks);
    for (let c = 1; c <= chunks; c += 1) {
      steps.push({
        delay: 150,
        emit: { kind: "words", q, count: Math.min(words.length, c * per) },
      });
    }
    steps.push({ delay: 290, emit: { kind: "confirm", q } });
  }
  return steps;
}

const SEGMENTS: { id: Segment; label: string; icon: React.ComponentType<{ size?: number | string; "aria-hidden"?: boolean }> }[] = [
  { id: "voice", label: "Voice", icon: Mic },
  { id: "text", label: "Text", icon: MessageSquareText },
  { id: "cards", label: "Cards", icon: LayoutGrid },
  { id: "more", label: "More", icon: Plus },
];

export default function DiscoveryWorkspace() {
  const router = useRouter();
  const reduced = useReducedMotion();

  const journey = useDemoStore((s) => s.journey);
  const discovery = useDemoStore((s) => s.discovery);
  const confirmAnswer = useDemoStore((s) => s.confirmAnswer);
  const setDiscoveryMode = useDemoStore((s) => s.setDiscoveryMode);
  const completeDiscovery = useDemoStore((s) => s.completeDiscovery);

  const [tab, setTab] = useState<Tab>("interview");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [justConfirmed, setJustConfirmed] = useState<DiscoveryQuestion | null>(null);
  const [compiling, setCompiling] = useState(false);
  /** Non-null while the prefill simulation plays (question + revealed words). */
  const [prefill, setPrefill] = useState<{ q: DiscoveryQuestion; words: number } | null>(null);
  const flyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefillHandle = useRef<TimelineHandle | null>(null);

  useEffect(
    () => () => {
      if (flyTimer.current) clearTimeout(flyTimer.current);
      prefillHandle.current?.cancel();
    },
    [],
  );

  const answers = discovery.answers;
  const total = DISCOVERY_QUESTIONS.length;
  const answeredCount = Object.keys(answers).length;
  const completed = discovery.completed;
  const reportExists = atLeast(journey, "report_review");

  /* The current unanswered question: explicit selection → first unskipped → first unanswered. */
  const activeQ = useMemo<DiscoveryQuestion | null>(() => {
    const unanswered = DISCOVERY_QUESTIONS.filter((q) => !answers[q.id]);
    if (unanswered.length === 0) return null;
    return (
      (activeId && unanswered.find((q) => q.id === activeId)) ||
      unanswered.find((q) => !skipped.includes(q.id)) ||
      unanswered[0]
    );
  }, [answers, activeId, skipped]);

  const displayQ = justConfirmed ?? activeQ;
  const qNumber = displayQ
    ? DISCOVERY_QUESTIONS.findIndex((x) => x.id === displayQ.id) + 1
    : total;

  /* Segment ⇄ store mode mapping ("upload"/"invite" both live under More). */
  const segment: Segment =
    discovery.mode === "upload" || discovery.mode === "invite"
      ? "more"
      : (discovery.mode as Segment);
  const pickSegment = (s: Segment) =>
    setDiscoveryMode(s === "more" ? "upload" : s);

  /* ── Interview actions ── */

  const handleConfirm = (q: DiscoveryQuestion, text: string) => {
    confirmAnswer(q.id, text);
    setSkipped((prev) => prev.filter((id) => id !== q.id));
    setJustConfirmed(q);
    if (flyTimer.current) clearTimeout(flyTimer.current);
    flyTimer.current = setTimeout(
      () => {
        setJustConfirmed(null);
        setActiveId(null);
      },
      reduced ? 600 : 2100,
    );
  };

  const handleSkip = () => {
    if (!activeQ) return;
    const current = activeQ;
    setSkipped((prev) => (prev.includes(current.id) ? prev : [...prev, current.id]));
    const idx = DISCOVERY_QUESTIONS.findIndex((q) => q.id === current.id);
    const rotated = [
      ...DISCOVERY_QUESTIONS.slice(idx + 1),
      ...DISCOVERY_QUESTIONS.slice(0, idx),
    ];
    const next = rotated.find((q) => !answers[q.id]);
    setActiveId(next ? next.id : null);
  };

  const handleJump = (questionId: string) => {
    if (answers[questionId]) return;
    setActiveId(questionId);
    setTab("interview");
  };

  /* ── Prefill simulation (spec §10, D-01) ──
     Plays every unanswered question as a short conversation: question shown,
     transcript revealed progressively, then confirmAnswer with the fixture
     answer so facts and the knowledge count tick up live. Skippable; instant
     under reduced motion; cancelled on unmount. */
  const startPrefill = () => {
    if (prefillHandle.current || completed) return;
    const unanswered = DISCOVERY_QUESTIONS.filter(
      (q) => !useDemoStore.getState().discovery.answers[q.id],
    );
    if (unanswered.length === 0) return;
    if (flyTimer.current) clearTimeout(flyTimer.current);
    setJustConfirmed(null);
    setTab("interview");
    const handle = runTimeline(
      prefillSteps(unanswered),
      (e) => {
        if (e.kind === "show") setPrefill({ q: e.q, words: 0 });
        else if (e.kind === "words") setPrefill({ q: e.q, words: e.count });
        else confirmAnswer(e.q.id, e.q.answer);
      },
      { instant: Boolean(reduced) },
    );
    prefillHandle.current = handle;
    handle.done.then(() => {
      prefillHandle.current = null;
      setPrefill(null);
    });
  };

  const skipPrefill = () => {
    prefillHandle.current?.cancel();
    prefillHandle.current = null;
    const answersNow = useDemoStore.getState().discovery.answers;
    for (const q of DISCOVERY_QUESTIONS) {
      if (!answersNow[q.id]) confirmAnswer(q.id, q.answer);
    }
    setPrefill(null);
  };

  const prefilling = prefill !== null;

  const finishCompile = () => {
    completeDiscovery();
    router.push("/app/discovery/report");
  };

  /* Tabs: two-tab list with arrow-key support. */
  const onTabKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      setTab((t) => (t === "interview" ? "knowledge" : "interview"));
    }
  };

  const showCallBar = tab === "knowledge" && !completed && Boolean(activeQ) && !prefilling;
  const showCompletion = completed && !justConfirmed && !prefilling;

  return (
    <main className="oa-page">
      <header className="oa-between" style={{ marginBottom: 24 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <p className="oa-eyebrow">Discovery · Voice interview</p>
          <h1 className="oa-h1">
            The discovery <span className="oa-serif">interview</span>
          </h1>
          <p className="oa-lead">
            Five short questions about how {DEMO_COMPANY.name} runs. Watch what
            Oriant learns build up live.
          </p>
        </div>
        {completed ? (
          <StatusBadge status="completed" label="Interview complete" />
        ) : (
          <span className="oa-micro">
            {answeredCount} of {total} answered
          </span>
        )}
      </header>

      <div className={styles.wrap}>
        <div className={styles.tabsRow}>
          <div
            className={`oa-tabs ${styles.tabs}`}
            role="tablist"
            aria-label="Discovery views"
            onKeyDown={onTabKey}
          >
            <button
              type="button"
              role="tab"
              id="tab-interview"
              aria-selected={tab === "interview"}
              aria-controls="panel-interview"
              tabIndex={tab === "interview" ? 0 : -1}
              className={`oa-tab ${tab === "interview" ? "oa-tab--active" : ""}`}
              onClick={() => setTab("interview")}
            >
              Live interview
            </button>
            <button
              type="button"
              role="tab"
              id="tab-knowledge"
              aria-selected={tab === "knowledge"}
              aria-controls="panel-knowledge"
              tabIndex={tab === "knowledge" ? 0 : -1}
              className={`oa-tab ${tab === "knowledge" ? "oa-tab--active" : ""}`}
              onClick={() => setTab("knowledge")}
            >
              What Oriant knows
              <motion.span
                key={discovery.factIds.length}
                className={styles.tabBadge}
                initial={reduced ? false : { scale: 0.6 }}
                animate={{ scale: 1 }}
                transition={{ duration: DUR.micro, ease: EASE }}
                aria-label={`${discovery.factIds.length} facts`}
              >
                {discovery.factIds.length}
              </motion.span>
            </button>
          </div>

          {tab === "interview" && !showCompletion && (
            <div className="oa-cluster" style={{ justifyContent: "flex-end" }}>
              <div className={styles.seg} role="group" aria-label="Interview mode">
                {SEGMENTS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    className={`${styles.segBtn} ${segment === id ? styles.segBtnOn : ""}`}
                    aria-pressed={segment === id}
                    disabled={prefilling}
                    onClick={() => pickSegment(id)}
                  >
                    <Icon size={13} aria-hidden />
                    {label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="oa-btn oa-btn--ghost oa-btn--sm"
                onClick={startPrefill}
                disabled={prefilling}
              >
                <FastForward size={13} aria-hidden />
                Prefill interview (demo)
              </button>
            </div>
          )}
        </div>

        {/* Interview panel stays mounted (hidden) so voice capture, upload and
            invite timers keep running while the knowledge tab is open. */}
        <div
          role="tabpanel"
          id="panel-interview"
          aria-labelledby="tab-interview"
          hidden={tab !== "interview"}
        >
          <div className={styles.interview}>
            {prefilling && prefill ? (
              <motion.section
                className={`oa-card ${styles.callCard}`}
                initial={reduced ? false : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: DUR.card, ease: EASE }}
                aria-label="Simulated interview playback"
              >
                <div className={styles.orbRow}>
                  <div className={styles.orbId}>
                    <span className={styles.avatar} aria-hidden>
                      O
                    </span>
                    <div style={{ display: "grid", gap: 1 }}>
                      <span style={{ fontSize: 14, fontWeight: 750 }}>
                        Oriant Orchestrator
                      </span>
                      <span className="oa-sub">
                        Playing the interview with prepared demo answers
                      </span>
                    </div>
                  </div>
                  <div className={styles.progressBlock}>
                    <div className="oa-between" style={{ gap: 8 }}>
                      <span className="oa-micro">
                        Question{" "}
                        {DISCOVERY_QUESTIONS.findIndex((x) => x.id === prefill.q.id) + 1}{" "}
                        of {total}
                      </span>
                      <span className="oa-sub">{answeredCount} answered</span>
                    </div>
                    <div className="oa-progress" aria-hidden>
                      <span style={{ width: `${(answeredCount / total) * 100}%` }} />
                    </div>
                  </div>
                </div>

                <div className={styles.question}>
                  <h2 className="oa-h2">{prefill.q.question}</h2>
                  <div className={styles.prefillTranscript} aria-live="polite">
                    <span className="oa-micro">You (demo answer)</span>
                    <p>
                      {prefill.q.answer.split(" ").slice(0, prefill.words).join(" ")}
                      {prefill.words === 0 && (
                        <span className="oa-sub" style={{ fontStyle: "italic" }}>
                          Listening…
                        </span>
                      )}
                    </p>
                  </div>
                  <Waveform
                    active={!reduced && prefill.words < prefill.q.answer.split(" ").length}
                    bars={17}
                    height={22}
                  />
                </div>

                <div className="oa-between">
                  <span className="oa-sim-note">
                    Simulated conversation. Prepared demo answers, no microphone used.
                  </span>
                  <button
                    type="button"
                    className="oa-btn oa-btn--ghost oa-btn--sm"
                    onClick={skipPrefill}
                  >
                    Skip to the finished interview
                  </button>
                </div>
              </motion.section>
            ) : showCompletion ? (
              <>
                <motion.section
                  className={`oa-card ${styles.completeCard}`}
                  initial={reduced ? false : { opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: DUR.card, ease: EASE }}
                  aria-label="Discovery complete"
                >
                  <span className={styles.completeIcon} aria-hidden>
                    <CheckCircle2 size={26} />
                  </span>
                  <h2 className="oa-h2">
                    Discovery complete: {discovery.factIds.length} facts captured
                  </h2>
                  <p className="oa-sub" style={{ maxWidth: 480 }}>
                    {reportExists
                      ? "Your company report is ready. Open it to review, edit and approve what Oriant understood."
                      : "Next, Oriant compiles everything it learned into an editable company report. You review each fact and approve the report before any planning starts."}
                  </p>
                  <div className="oa-cluster" style={{ justifyContent: "center" }}>
                    {reportExists ? (
                      <Link href="/app/discovery/report" className="oa-btn oa-btn--primary">
                        <BookOpen size={15} aria-hidden />
                        Open company report
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className="oa-btn oa-btn--primary"
                        onClick={() => setCompiling(true)}
                      >
                        Compile company report
                        <ArrowRight size={15} aria-hidden />
                      </button>
                    )}
                    <button
                      type="button"
                      className="oa-btn oa-btn--ghost"
                      onClick={() => setTab("knowledge")}
                    >
                      Review what Oriant knows
                    </button>
                  </div>
                </motion.section>

                {!reportExists && (
                  <div style={{ display: "grid", gap: 10 }}>
                    <p className="oa-sub" style={{ margin: 0 }}>
                      Want the report to start from more than the interview? Add context first:
                    </p>
                    <MorePanel />
                  </div>
                )}
              </>
            ) : segment === "voice" ? (
              <VoiceMode
                q={activeQ}
                qNumber={qNumber}
                answeredCount={answeredCount}
                answers={answers}
                skipped={skipped}
                justConfirmed={justConfirmed}
                onConfirm={handleConfirm}
                onSkip={handleSkip}
                onJump={handleJump}
              />
            ) : segment === "text" ? (
              <TextMode
                q={activeQ}
                answers={answers}
                justConfirmed={justConfirmed}
                onConfirm={handleConfirm}
                onSkip={handleSkip}
              />
            ) : segment === "cards" ? (
              <CardsMode
                answers={answers}
                justConfirmed={justConfirmed}
                onConfirm={handleConfirm}
              />
            ) : (
              <MorePanel />
            )}
          </div>
        </div>

        <div
          role="tabpanel"
          id="panel-knowledge"
          aria-labelledby="tab-knowledge"
          hidden={tab !== "knowledge"}
        >
          {tab === "knowledge" && <KnowledgePanel factIds={discovery.factIds} />}
        </div>
      </div>

      {/* Floating call bar — the interview stays one tap away (spec §9.3). */}
      <AnimatePresence>
        {showCallBar && activeQ && (
          <motion.div
            className={styles.callBar}
            initial={reduced ? false : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: DUR.card, ease: EASE }}
            role="region"
            aria-label="Interview in progress"
          >
            <Waveform active={false} bars={9} height={18} />
            <div className={styles.callBarText}>
              <span className="oa-micro">
                In interview · Question {qNumber} of {total}
              </span>
              <p className={styles.callBarSnippet}>{activeQ.question}</p>
            </div>
            <button
              type="button"
              className="oa-btn oa-btn--soft oa-btn--sm"
              onClick={() => setTab("interview")}
            >
              <PhoneCall size={13} aria-hidden />
              Return to call
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {compiling && <CompileOverlay onFinished={finishCompile} />}
    </main>
  );
}
