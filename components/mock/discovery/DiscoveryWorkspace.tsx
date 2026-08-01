"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, BookOpen, CheckCircle2, LoaderCircle, WandSparkles } from "lucide-react";
import { useDemoStore } from "@/lib/mock/store";
import type { DiscoveryQuestion } from "@/lib/mock/types";
import { DEMO_COMPANY } from "@/lib/mock/fixtures/demo-company";
import StatusBadge from "@/components/mock/ui/StatusBadge";
import { DUR, EASE } from "@/lib/mock/motion";
import CardsMode from "./CardsMode";
import CompileOverlay from "./CompileOverlay";
import DiscoveryReviewOverlay from "./DiscoveryReviewOverlay";
import styles from "./discovery.module.css";

type PrefillSnapshot = Record<string, string | null>;

interface GeneratedQuestion {
  id: string;
  question: string;
  reason: string;
  helperText?: string;
  examples?: string[];
}

const INTERVIEW_LOADING_SECONDS = 20;

function toDiscoveryQuestion(item: GeneratedQuestion): DiscoveryQuestion {
  return {
    id: item.id,
    question: item.question,
    reason: item.reason,
    answer: "",
    factIds: [],
    sections: [],
    helperText: item.helperText,
    examples: item.examples,
  };
}

function buildMockAnswer(question: DiscoveryQuestion, onboarding: ReturnType<typeof useDemoStore.getState>["onboarding"]) {
  const area = onboarding.businessArea || "Operations";
  const task = onboarding.repetitiveTask || "this workflow";
  const workflow = onboarding.currentWorkflow || "The owner checks requests manually, updates tools, and follows up one by one.";
  const examples = question.examples?.slice(0, 2) ?? [];

  if (/trigger/i.test(question.id) || /trigger/i.test(question.question)) {
    return `This usually starts when a customer request comes in for ${task.toLowerCase()}, either by email, phone, or WhatsApp.`;
  }
  if (/steps/i.test(question.id) || /start to finish/i.test(question.question)) {
    return `First we receive the request, then we review the details, update the right tools, confirm the next action, and close the loop manually. ${workflow}`;
  }
  if (/handoff|switch|touches/i.test(question.id + question.question)) {
    return onboarding.organizationShape === "solo"
      ? `I usually switch between Gmail, the calendar, and our tracking notes to keep ${task.toLowerCase()} moving.`
      : `The work usually passes between the owner, the ${area.toLowerCase()} lead, and whoever updates the customer or internal record.`;
  }
  if (/input|document/i.test(question.id + question.question)) {
    return `We usually need the customer details, timing information, any previous notes, and the latest status from the tools involved.`;
  }
  if (/decision|person/i.test(question.id + question.question)) {
    return examples.length
      ? examples.join(", ") + ", should still stay with a person."
      : `Anything customer-facing, financial, or sensitive should still stay with a person.`;
  }
  if (/outcome|worked better|success/i.test(question.id + question.question)) {
    return `A good outcome would be faster turnaround, fewer manual updates, and a clearer handoff so ${task.toLowerCase()} does not depend on constant follow-up.`;
  }
  return `Today ${task.toLowerCase()} still takes manual coordination, and we want a safer, faster process for ${area.toLowerCase()}.`;
}

export default function DiscoveryWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const reduced = useReducedMotion();
  const reviewRequested = useRef(false);
  const isReviewStage = pathname === "/app/discovery/review";

  const journey = useDemoStore((s) => s.journey);
  const onboarding = useDemoStore((s) => s.onboarding);
  const discovery = useDemoStore((s) => s.discovery);
  const confirmAnswer = useDemoStore((s) => s.confirmAnswer);
  const completeDiscovery = useDemoStore((s) => s.completeDiscovery);
  const replaceDiscoveryAnswers = useDemoStore((s) => s.replaceDiscoveryAnswers);
  const syncDiscoveryFromServer = useDemoStore((s) => s.syncDiscoveryFromServer);

  const [justConfirmed, setJustConfirmed] = useState<DiscoveryQuestion | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [questions, setQuestions] = useState<DiscoveryQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingRemaining, setLoadingRemaining] = useState(INTERVIEW_LOADING_SECONDS);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [providerNotice, setProviderNotice] = useState<string | null>(null);
  const [prefillSnapshot, setPrefillSnapshot] = useState<PrefillSnapshot | null>(null);
  const [prefillReview, setPrefillReview] = useState(false);
  const [clarificationQuestions, setClarificationQuestions] = useState<DiscoveryQuestion[]>([]);
  const [clarificationAnswers, setClarificationAnswers] = useState<Record<string, string>>({});
  const [clarificationReview, setClarificationReview] = useState(false);
  const [reviewingClarifications, setReviewingClarifications] = useState(false);
  const [clarificationNotice, setClarificationNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!loading) return;
    setLoadingRemaining(INTERVIEW_LOADING_SECONDS);
    const timer = window.setInterval(() => {
      setLoadingRemaining((remaining) => Math.max(0, remaining - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [loading]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const run = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [questionsRes, sessionRes] = await Promise.all([
          fetch("/api/discovery/questions", { cache: "no-store", signal: controller.signal }),
          fetch("/api/discovery/session", { cache: "no-store", signal: controller.signal }),
        ]);
        if (!questionsRes.ok) throw new Error("Could not load interview questions.");
        const data = (await questionsRes.json()) as { questions: GeneratedQuestion[]; mode?: "live" | "fixture"; error?: string };
        const sessionData = sessionRes.ok
          ? (await sessionRes.json()) as {
              answers?: Record<string, string>;
              report?: unknown;
              clarificationQuestions?: GeneratedQuestion[];
              clarificationAnswers?: Record<string, string>;
            }
          : null;
        if (!cancelled) {
          setQuestions((data.questions ?? []).map(toDiscoveryQuestion));
          setProviderNotice(data.mode === "fixture"
            ? data.error
              ? `AI& was unavailable, so Oriant loaded its workflow-specific backup questions. (${data.error})`
              : "AI& was unavailable, so Oriant loaded its workflow-specific backup questions."
            : null);
          if (sessionData?.answers) {
            const savedCount = Object.keys(sessionData.answers).length;
            syncDiscoveryFromServer({
              answers: sessionData.answers,
              completed: savedCount > 0 && savedCount >= (data.questions?.length ?? 0),
            });
          }
          if (isReviewStage && sessionData?.clarificationQuestions?.length) {
            setClarificationQuestions(sessionData.clarificationQuestions.map(toDiscoveryQuestion));
            setClarificationAnswers(sessionData.clarificationAnswers ?? {});
            setClarificationReview(true);
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Could not load interview questions.");
          setQuestions([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isReviewStage, syncDiscoveryFromServer]);

  const answers = discovery.answers;
  const total = questions.length;
  const answeredCount = useMemo(
    () => questions.filter((q) => Boolean(answers[q.id])).length,
    [answers, questions],
  );
  const completed = total > 0 && answeredCount >= total;
  const clarificationsComplete = clarificationQuestions.length === 0
    || clarificationQuestions.every((q) => Boolean(clarificationAnswers[q.id]?.trim()));
  const showCompletionCard = completed && !justConfirmed && !prefillReview && !clarificationReview;
  const reportExists = journey === "report_review" || journey === "report_approved";

  const handleConfirm = (q: DiscoveryQuestion, text: string) => {
    confirmAnswer(q.id, text);
    void fetch("/api/discovery/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId: q.id, answer: text }),
    });
    setJustConfirmed(q);
    window.setTimeout(() => setJustConfirmed(null), reduced ? 500 : 1500);
  };

  const compileReport = async () => {
    const goals: Record<string, boolean> = {};
    if (onboarding.businessArea.trim()) goals[onboarding.businessArea.trim()] = true;
    if (onboarding.repetitiveTask.trim()) goals[onboarding.repetitiveTask.trim()] = true;
    const systems = Object.fromEntries(onboarding.selectedToolIds.map((id) => [id, true]));

    try {
      const response = await fetch("/api/call/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: { ...answers, ...clarificationAnswers },
          goals,
          systems,
          canvasUploaded: false,
        }),
      });
      if (!response.ok) throw new Error("Supabase could not save the company report.");
    } catch {
      setLoadError("Supabase could not save the company report. Check your connection and try again.");
      return;
    }

    completeDiscovery();
    router.push("/app/discovery/report");
  };

  const beginClarificationReview = async () => {
    setClarificationNotice(null);
    setPrefillReview(false);
    try {
      const response = await fetch("/api/discovery/clarifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error("Could not review the interview answers.");
      const data = (await response.json()) as {
        questions?: GeneratedQuestion[];
        mode?: "live" | "fixture";
        error?: string;
      };
      const nextQuestions = (data.questions ?? []).map(toDiscoveryQuestion);
      setClarificationQuestions(nextQuestions);
      setClarificationAnswers({});
      setClarificationNotice(data.mode === "fixture" && data.error
        ? `The review agent used a local safety check. (${data.error})`
        : null);
      if (nextQuestions.length === 0) {
        setReviewingClarifications(false);
        setCompiling(true);
      }
      else {
        setReviewingClarifications(false);
        router.replace("/app/discovery/review");
        setClarificationReview(true);
      }
    } catch (err) {
      setReviewingClarifications(false);
      setLoadError(err instanceof Error ? err.message : "Could not review the interview answers.");
    }
  };

  const startClarificationReview = () => {
    setReviewingClarifications(true);
    void beginClarificationReview();
  };

  const handleClarificationConfirm = (q: DiscoveryQuestion, text: string) => {
    setClarificationAnswers((current) => ({ ...current, [q.id]: text }));
    void fetch("/api/discovery/clarifications/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId: q.id, answer: text }),
    });
  };

  useEffect(() => {
    if (!isReviewStage || loading || reviewRequested.current || reportExists) return;
    if (clarificationReview) return;
    reviewRequested.current = true;
    startClarificationReview();
    // The review request is intentionally started once when this stage opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReviewStage, loading, reportExists, clarificationReview]);

  const prefillInterview = async () => {
    const unanswered = questions.filter((q) => !answers[q.id]);
    if (!unanswered.length) {
      setPrefillReview(true);
      return;
    }

    const snapshot: PrefillSnapshot = {};
    for (const question of unanswered) {
      snapshot[question.id] = answers[question.id] ?? null;
      const text = buildMockAnswer(question, onboarding);
      confirmAnswer(question.id, text);
      void fetch("/api/discovery/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: question.id, answer: text }),
      });
    }
    setPrefillSnapshot(snapshot);
    setPrefillReview(true);
  };

  const undoPrefill = async () => {
    if (!prefillSnapshot) return;

    const restoredAnswers = { ...answers };
    for (const [questionId, previousAnswer] of Object.entries(prefillSnapshot)) {
      if (previousAnswer?.trim()) restoredAnswers[questionId] = previousAnswer.trim();
      else delete restoredAnswers[questionId];
    }

    replaceDiscoveryAnswers(restoredAnswers, total > 0 && Object.keys(restoredAnswers).length >= total);
    await Promise.all(
      Object.entries(prefillSnapshot).map(([questionId, previousAnswer]) =>
        fetch("/api/discovery/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questionId, answer: previousAnswer ?? "" }),
        }),
      ),
    );
    setPrefillSnapshot(null);
    setPrefillReview(false);
  };

  return (
    <main className="oa-page">
      <header className="oa-between" style={{ marginBottom: 24 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <p className="oa-eyebrow">Discovery · {isReviewStage || clarificationReview ? "Review" : "Interview"}</p>
          <h1 className="oa-h1">
            {isReviewStage || clarificationReview
              ? <>Discovery <span className="oa-serif">review</span></>
              : <>Tailored workflow <span className="oa-serif">interview</span></>}
          </h1>
          <p className="oa-lead">
            {isReviewStage || clarificationReview
              ? `Oriant is checking the captured answers before preparing ${DEMO_COMPANY.name}'s company report.`
              : `Oriant generated follow-up questions from your onboarding answers for ${DEMO_COMPANY.name}.`}
          </p>
        </div>
        {showCompletionCard ? (
          <StatusBadge status="completed" label="Interview complete" />
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {prefillSnapshot ? (
              <button type="button" className="oa-btn oa-btn--ghost oa-btn--sm" onClick={() => void undoPrefill()}>
                Undo prefill
              </button>
            ) : null}
            <button type="button" className="oa-btn oa-btn--ghost oa-btn--sm" onClick={prefillInterview}>
              <WandSparkles size={14} aria-hidden />
              Prefill mock data
            </button>
            <span className="oa-micro">
              {answeredCount} of {total || 0} answered
            </span>
          </div>
        )}
      </header>

      <div className={styles.wrap}>
        <div>
          <div className={styles.interview}>
            {loading ? (
              <section className={`oa-card ${styles.loadingCard}`} aria-busy="true" aria-live="polite">
                <div className={styles.loadingHeader}>
                  <span className={styles.loadingOrb} aria-hidden>
                    <WandSparkles size={20} />
                  </span>
                  <div className={styles.loadingCopy}>
                    <p className={styles.loadingEyebrow}>Discovery agent</p>
                    <h2 className="oa-h3">Discovery Agent is preparing your interview</h2>
                    <p className="oa-sub">
                      Oriant is reading your onboarding answers and tailoring the questions to your workflow.
                    </p>
                    <p className={styles.loadingTime}>
                      {loadingRemaining > 0
                        ? `About ${loadingRemaining} seconds left`
                        : "Taking a little longer than expected…"}
                    </p>
                  </div>
                  <LoaderCircle className={styles.loadingSpinner} size={20} aria-label="Loading" />
                </div>
                <div className={styles.loadingProgress} aria-hidden>
                  <span className={styles.loadingProgressActive} />
                </div>
                <div className={styles.loadingStages} aria-hidden>
                  <span className={styles.loadingStageActive}>Reading onboarding</span>
                  <span>Finding the workflow gaps</span>
                  <span>Preparing interview cards</span>
                </div>
                <div className={styles.loadingSkeletons} aria-hidden>
                  <span />
                  <span />
                  <span />
                </div>
              </section>
            ) : loadError ? (
              <section className={`oa-card ${styles.callCard}`}>
                <p className="oa-sub" style={{ color: "var(--oa-red-ink)" }}>{loadError}</p>
              </section>
            ) : showCompletionCard ? (
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
                <h2 className="oa-h2">Interview complete</h2>
                <p className="oa-sub" style={{ maxWidth: 480 }}>
                  Oriant now has the deeper workflow detail needed to draft your company report for review.
                </p>
                <div className="oa-cluster" style={{ justifyContent: "center" }}>
                  {reportExists ? (
                    <button type="button" className="oa-btn oa-btn--primary" onClick={() => router.push("/app/discovery/report")}>
                      <BookOpen size={15} aria-hidden />
                      Open company report
                    </button>
                  ) : (
                    <button type="button" className="oa-btn oa-btn--primary" onClick={startClarificationReview}>
                      Check for missing details
                      <ArrowRight size={15} aria-hidden />
                    </button>
                  )}
                </div>
              </motion.section>
            ) : (
              <>
                {providerNotice ? (
                  <section className={`oa-card ${styles.callCard}`} role="status">
                    <p className="oa-sub" style={{ margin: 0 }}>{providerNotice}</p>
                  </section>
                ) : null}
                {prefillReview ? (
                  <section className={`oa-card oa-card--flat ${styles.reviewBanner}`}>
                    <div className={styles.reviewBannerCopy}>
                      <p className={styles.reviewBannerEyebrow}>Mock answers ready for review</p>
                      <h2 className="oa-h3" style={{ margin: 0 }}>Check every card before compiling the company report</h2>
                      <p className="oa-sub" style={{ margin: 0 }}>
                        You can open any answer, edit it, or undo the prefill and go back to a blank interview.
                      </p>
                    </div>
                    <div className={styles.reviewBannerActions}>
                      <button type="button" className="oa-btn oa-btn--primary" onClick={startClarificationReview} disabled={!completed}>
                        Review answers &amp; clarify
                        <ArrowRight size={15} aria-hidden />
                      </button>
                      {prefillSnapshot ? (
                        <button type="button" className="oa-btn oa-btn--ghost" onClick={() => void undoPrefill()}>
                          Undo prefill
                        </button>
                      ) : null}
                    </div>
                  </section>
                ) : null}

                {clarificationReview ? (
                  <section className={`oa-card oa-card--flat ${styles.reviewBanner}`}>
                    <div className={styles.reviewBannerCopy}>
                      <p className={styles.reviewBannerEyebrow}>Discovery review</p>
                      <h2 className="oa-h3" style={{ margin: 0 }}>Help Oriant close the last gaps</h2>
                      <p className="oa-sub" style={{ margin: 0 }}>
                        Oriant checked your onboarding and interview answers. These are the only gaps that could change the workflow recommendation.
                      </p>
                    </div>
                    <div className={styles.reviewBannerActions}>
                      <button type="button" className="oa-btn oa-btn--primary" onClick={() => setCompiling(true)} disabled={!clarificationsComplete}>
                        {clarificationsComplete ? "Compile company report" : "Answer clarification questions"}
                        <ArrowRight size={15} aria-hidden />
                      </button>
                    </div>
                  </section>
                ) : null}

                {clarificationNotice ? (
                  <section className={`oa-card ${styles.callCard}`} role="status">
                    <p className="oa-sub" style={{ margin: 0 }}>{clarificationNotice}</p>
                  </section>
                ) : null}

                {clarificationReview ? (
                  <section className={styles.clarificationSection}>
                    <div className={styles.clarificationHeading}>
                      <span className={styles.loadingOrb} aria-hidden><WandSparkles size={16} /></span>
                      <div>
                        <p className={styles.reviewBannerEyebrow}>Before the report</p>
                        <h2 className="oa-h3" style={{ margin: 0 }}>A few details need clarifying</h2>
                      </div>
                    </div>
                    <CardsMode questions={clarificationQuestions} answers={clarificationAnswers} justConfirmed={null} onConfirm={handleClarificationConfirm} />
                  </section>
                ) : null}

                {!clarificationReview ? (
                  <CardsMode questions={questions} answers={answers} justConfirmed={justConfirmed} onConfirm={handleConfirm} />
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {reviewingClarifications && <DiscoveryReviewOverlay />}
        {compiling && <CompileOverlay onFinished={() => void compileReport()} />}
      </AnimatePresence>
    </main>
  );
}
