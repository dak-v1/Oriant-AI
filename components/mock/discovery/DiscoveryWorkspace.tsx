"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, BookOpen, CheckCircle2, WandSparkles } from "lucide-react";
import { useDemoStore } from "@/lib/mock/store";
import type { DiscoveryQuestion } from "@/lib/mock/types";
import { DEMO_COMPANY } from "@/lib/mock/fixtures/demo-company";
import StatusBadge from "@/components/mock/ui/StatusBadge";
import { DUR, EASE } from "@/lib/mock/motion";
import CardsMode from "./CardsMode";
import CompileOverlay from "./CompileOverlay";
import styles from "./discovery.module.css";

type PrefillSnapshot = Record<string, string | null>;

interface GeneratedQuestion {
  id: string;
  question: string;
  reason: string;
  helperText?: string;
  examples?: string[];
}

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
  const reduced = useReducedMotion();

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [prefillSnapshot, setPrefillSnapshot] = useState<PrefillSnapshot | null>(null);
  const [prefillReview, setPrefillReview] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [questionsRes, sessionRes] = await Promise.all([
          fetch("/api/discovery/questions", { cache: "no-store" }),
          fetch("/api/discovery/session", { cache: "no-store" }),
        ]);
        if (!questionsRes.ok) throw new Error("Could not load interview questions.");
        const data = (await questionsRes.json()) as { questions: GeneratedQuestion[] };
        const sessionData = sessionRes.ok
          ? (await sessionRes.json()) as { answers?: Record<string, string>; report?: unknown }
          : null;
        if (!cancelled) {
          setQuestions((data.questions ?? []).map(toDiscoveryQuestion));
          if (sessionData?.answers) {
            const savedCount = Object.keys(sessionData.answers).length;
            syncDiscoveryFromServer({
              answers: sessionData.answers,
              completed: savedCount > 0 && savedCount >= (data.questions?.length ?? 0),
            });
          }
        }
      } catch (err) {
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
    };
  }, [syncDiscoveryFromServer]);

  const answers = discovery.answers;
  const total = questions.length;
  const answeredCount = useMemo(
    () => questions.filter((q) => Boolean(answers[q.id])).length,
    [answers, questions],
  );
  const completed = total > 0 && answeredCount >= total;
  const showCompletionCard = completed && !justConfirmed && !prefillReview;
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

  const finishCompile = async () => {
    const goals: Record<string, boolean> = {};
    if (onboarding.businessArea.trim()) goals[onboarding.businessArea.trim()] = true;
    if (onboarding.repetitiveTask.trim()) goals[onboarding.repetitiveTask.trim()] = true;
    const systems = Object.fromEntries(onboarding.selectedToolIds.map((id) => [id, true]));

    try {
      await fetch("/api/call/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers,
          goals,
          systems,
          canvasUploaded: false,
        }),
      });
    } catch {
      // Best-effort compile handoff; the UI can still continue to the report screen.
    }

    completeDiscovery();
    router.push("/app/discovery/report");
  };

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
          <p className="oa-eyebrow">Discovery · Interview</p>
          <h1 className="oa-h1">
            Tailored workflow <span className="oa-serif">interview</span>
          </h1>
          <p className="oa-lead">
            Oriant generated follow-up questions from your onboarding answers for {DEMO_COMPANY.name}.
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
              <section className={`oa-card ${styles.callCard}`}>
                <p className="oa-sub">Generating tailored interview questions from the onboarding answers…</p>
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
                    <button type="button" className="oa-btn oa-btn--primary" onClick={() => setCompiling(true)}>
                      Compile company report
                      <ArrowRight size={15} aria-hidden />
                    </button>
                  )}
                </div>
              </motion.section>
            ) : (
              <>
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
                      {reportExists ? (
                        <button type="button" className="oa-btn oa-btn--primary" onClick={() => router.push("/app/discovery/report")}>
                          <BookOpen size={15} aria-hidden />
                          Open company report
                        </button>
                      ) : (
                        <button type="button" className="oa-btn oa-btn--primary" onClick={() => setCompiling(true)} disabled={!completed}>
                          Compile company report
                          <ArrowRight size={15} aria-hidden />
                        </button>
                      )}
                      {prefillSnapshot ? (
                        <button type="button" className="oa-btn oa-btn--ghost" onClick={() => void undoPrefill()}>
                          Undo prefill
                        </button>
                      ) : null}
                    </div>
                  </section>
                ) : null}

                <CardsMode
                  questions={questions}
                  answers={answers}
                  justConfirmed={justConfirmed}
                  onConfirm={handleConfirm}
                />
              </>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {compiling && <CompileOverlay onFinished={() => void finishCompile()} />}
      </AnimatePresence>
    </main>
  );
}
