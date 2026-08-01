"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Circle, Headphones, Mic2, PhoneOff } from "lucide-react";
import VoiceAnswer from "@/components/mock/ui/VoiceAnswer";
import { speakAgent, cancelSpeech } from "@/lib/speech";
import { useDemoStore } from "@/lib/mock/store";
import styles from "./voice-call.module.css";

type CallStage = "onboarding" | "interview" | "clarifications" | "complete";
type CallQuestion = { id: string; section: string; question: string; helper?: string; examples?: string[] };

const STARTER_QUESTIONS: CallQuestion[] = [
  { id: "organization_shape", section: "Getting oriented", question: "Is it just you, or are you setting this up with a team?", helper: "A quick answer is fine. You can say just me, or me and my team." },
  { id: "setup_builder", section: "Getting oriented", question: "Who will build your first workflow?", helper: "You can build it yourself, or invite someone else to help." },
  { id: "company_intro", section: "Your business", question: "Tell me briefly about your business and what takes too much time.", helper: "Speak naturally. We will capture the useful details." },
  { id: "automation_scope", section: "Your starting point", question: "Would you like to improve one business area, start with one task, or look across the whole business?", helper: "There is no wrong answer. This helps us keep the first conversation focused." },
  { id: "business_area", section: "Your starting point", question: "Which part of the business takes up the most time today?", helper: "For example, operations, customer service, finance, sales, or marketing." },
  { id: "repetitive_task", section: "Your starting point", question: "Which specific task feels the most repetitive or frustrating?", helper: "Choose the task that would make the biggest difference if it became easier." },
  { id: "current_workflow", section: "How work happens", question: "How do you handle that task today, from start to finish?", helper: "Tell me what really happens, including tools, handoffs, and manual checks." },
];

function toQuestion(item: { id: string; question: string; reason?: string; helperText?: string; examples?: string[] }): CallQuestion {
  return { id: item.id, section: "Your workflow interview", question: item.question, helper: item.helperText ?? item.reason, examples: item.examples };
}

function derivePatch(questionId: string, answer: string) {
  const lower = answer.toLowerCase();
  if (questionId === "organization_shape") {
    return { organizationShape: /just me|solo|only me|myself/.test(lower) ? "solo" : "owner_with_team" };
  }
  if (questionId === "setup_builder") {
    return { workflowBuilder: /someone|invite|team|other/.test(lower) ? "invite" : "self" };
  }
  if (questionId === "automation_scope") {
    const automationScope = /whole|entire|everything|business/.test(lower)
      ? "whole_business"
      : /task|small|one thing/.test(lower)
        ? "start_small"
        : "focus_area";
    return { automationScope };
  }
  return null;
}

export default function VoiceDiscoveryCall() {
  const router = useRouter();
  const syncDiscoveryFromServer = useDemoStore((state) => state.syncDiscoveryFromServer);
  const setJourney = useDemoStore((state) => state.setJourney);
  const setCallInProgress = useDemoStore((state) => state.setCallInProgress);
  const [callStarted, setCallStarted] = useState(false);
  const [stage, setStage] = useState<CallStage>("onboarding");
  const [questions, setQuestions] = useState<CallQuestion[]>(STARTER_QUESTIONS);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [liveTranscript, setLiveTranscript] = useState("");
  const [captured, setCaptured] = useState<Array<{ id: string; section: string; answer: string }>>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loadingNext, setLoadingNext] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const greetedRef = useRef(false);

  const activeQuestion = questions[activeIndex] ?? null;
  useEffect(() => {
    setLiveTranscript("");
  }, [activeQuestion?.id]);

  useEffect(() => {
    if (!callStarted || !activeQuestion || stage === "complete") return;
    if (!greetedRef.current) {
      greetedRef.current = true;
      void speakAgent("Hello, I’m Oriant. I’ll ask a few questions about your business and listen for what could be made easier. Let’s start.", () => {
        void speakAgent(activeQuestion.question);
      });
    } else {
      void speakAgent(activeQuestion.question);
    }
    return () => cancelSpeech();
  }, [activeQuestion, callStarted, stage]);

  const finishCall = async () => {
    setLoadingNext(true);
    setError(null);
    try {
      const response = await fetch("/api/onboarding/voice/complete", { method: "POST" });
      if (!response.ok) throw new Error("Supabase could not finish this call.");
      setCallInProgress(false);
      setJourney("discovery");
      setCallStarted(false);
      setStage("complete");
      router.push("/app/discovery/review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not finish this call.");
    } finally {
      setLoadingNext(false);
    }
  };

  const saveAnswer = async (question: CallQuestion, answer: string) => {
    const trimmed = answer.trim();
    if (!trimmed) return;
    setError(null);
    setLoadingNext(true);
    setAnswers((current) => ({ ...current, [question.id]: trimmed }));

    try {
      if (stage === "onboarding") {
        const response = await fetch("/api/onboarding/voice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questionId: question.id, transcript: trimmed, confirmedAnswer: trimmed, language: "en" }),
        });
        if (!response.ok) throw new Error("Supabase could not save this answer.");
        const patch = derivePatch(question.id, trimmed);
        if (patch) {
          const patchResponse = await fetch("/api/onboarding/session", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          });
          if (!patchResponse.ok) throw new Error("Supabase could not update your setup preference.");
        }
      } else if (stage === "interview") {
        const response = await fetch("/api/discovery/voice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questionId: question.id, transcript: trimmed, confirmedAnswer: trimmed, language: "en" }),
        });
        if (!response.ok) throw new Error("Supabase could not save this interview answer.");
        syncDiscoveryFromServer({ answers: { [question.id]: trimmed } });
      } else {
        const response = await fetch("/api/discovery/clarifications/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questionId: question.id, answer: trimmed }),
        });
        if (!response.ok) throw new Error("Supabase could not save this clarification.");
      }

      setCaptured((current) => [
        ...current.filter((item) => item.id !== question.id),
        { id: question.id, section: question.section, answer: trimmed },
      ]);

      if (activeIndex < questions.length - 1) {
        setActiveIndex((index) => index + 1);
      } else if (stage === "onboarding") {
        setLoadingNext(true);
        const response = await fetch("/api/discovery/questions", { cache: "no-store" });
        if (!response.ok) throw new Error("Could not prepare the tailored interview.");
        const data = await response.json() as { questions?: Array<{ id: string; question: string; reason?: string; helperText?: string; examples?: string[] }> };
        setQuestions((data.questions ?? []).map(toQuestion));
        setAnswers({});
        setActiveIndex(0);
        setStage("interview");
      } else if (stage === "interview") {
        const response = await fetch("/api/discovery/clarifications", { method: "POST" });
        if (!response.ok) throw new Error("Could not check the interview for missing details.");
        const data = await response.json() as { questions?: Array<{ id: string; question: string; reason?: string; helperText?: string; examples?: string[] }> };
        const next = (data.questions ?? []).map(toQuestion);
        if (next.length === 0) await finishCall();
        else {
          setQuestions(next);
          setAnswers({});
          setActiveIndex(0);
          setStage("clarifications");
        }
      } else {
        await finishCall();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this answer.");
      setAnswers((current) => {
        const next = { ...current };
        delete next[question.id];
        return next;
      });
      setCaptured((current) => current.filter((item) => item.id !== question.id));
    } finally {
      setLoadingNext(false);
    }
  };

  if (stage === "complete") {
    return (
      <main className={styles.page}>
        <section className={styles.completeCard}>
          <span className={styles.completeIcon}><Check size={24} aria-hidden /></span>
          <p className={styles.eyebrow}>Conversation complete</p>
          <h1>We have a clear first picture.</h1>
          <p>Your onboarding, tailored interview, and clarification answers are saved. Review them before Oriant prepares the company report.</p>
          <a className={styles.primaryAction} href="/app/discovery/review">Review answers <ArrowRight size={16} aria-hidden /></a>
        </section>
      </main>
    );
  }

  if (!callStarted) {
    return (
      <main className={styles.page}>
        <section className={styles.preCallCard}>
          <span className={styles.completeIcon}><Headphones size={24} aria-hidden /></span>
          <p className={styles.eyebrow}>One guided conversation</p>
          <h1>Ready when you are.</h1>
          <p>Oriant will ask about your business, how work happens, and what you would like to improve. Your answers will appear as cards while you talk.</p>
          <div className={styles.preCallDetails}>
            <span><Mic2 size={16} aria-hidden /> Live transcript</span>
            <span><Check size={16} aria-hidden /> Answers saved as you go</span>
            <span><Circle size={16} aria-hidden /> You can finish with the answers you have</span>
          </div>
          <button type="button" className={styles.primaryAction} onClick={() => setCallStarted(true)}>
            <Mic2 size={17} aria-hidden /> Start call
          </button>
          <p className={styles.preCallNote}>Your microphone will only be requested after you press Start call.</p>
        </section>
      </main>
    );
  }

  const stageLabel = stage === "onboarding" ? "Getting to know you" : stage === "interview" ? "Understanding your workflow" : "Closing the last gaps";
  const stageIndex = stage === "onboarding" ? 0 : stage === "interview" ? 1 : 2;
  const overallNumber = captured.length;

  return (
    <main className={styles.page}>
      <div className={styles.callLayout}>
        <div className={styles.callWorkspace}>
          <div className={styles.callHeader}>
            <div className={styles.railBrand}><span className={styles.railMark}><Headphones size={15} /></span><span>One guided call</span></div>
            <span className={styles.callTopActions}>
              <span className={styles.progress}>{overallNumber} captured</span>
              <button type="button" className={styles.endCall} onClick={() => void finishCall()} disabled={loadingNext}>
                <PhoneOff size={15} aria-hidden />
                End call
              </button>
            </span>
          </div>
          <div className={styles.stageList}>
            {["Getting to know you", "Workflow interview", "Clarification check"].map((label, index) => {
              const active = index === stageIndex;
              const done = index < stageIndex;
              return <div key={label} className={`${styles.stageItem} ${active ? styles.stageActive : ""}`}><span>{done ? <Check size={13} /> : <Circle size={10} />}</span>{label}</div>;
            })}
          </div>

          <div className={styles.callColumns}>
            <section className={styles.transcriptPanel} aria-live="polite">
              <p className={styles.eyebrow}>Live transcript</p>
              <h2>Speak naturally.</h2>
              <p className={styles.transcriptHint}>Your words will appear here as Oriant listens.</p>
              <div className={styles.transcriptStream}>
                {captured.length === 0 && !liveTranscript ? (
                  <p className={styles.transcriptEmpty}>Your conversation will appear here once you start speaking.</p>
                ) : null}
                {captured.map((item) => (
                  <div className={styles.transcriptTurn} key={item.id}>
                    <span className={styles.transcriptLabel}>You</span>
                    <p>{item.answer}</p>
                  </div>
                ))}
                {liveTranscript ? (
                  <div className={styles.transcriptTurn}>
                    <span className={styles.transcriptLabel}>You · listening</span>
                    <p className={styles.transcriptInterim}>{liveTranscript}</p>
                  </div>
                ) : null}
              </div>
              <div className={styles.transcriptStatus}><span className={styles.statusDot} />{loadingNext ? "Saving your answer…" : "Listening for your answer"}</div>
            </section>

            <section className={styles.callMain}>
          <div className={styles.callTop}>
            <span className={styles.eyebrow}>{stageLabel}</span>
          </div>
          <div className={styles.questionPanel}>
            <div className={styles.questionNumber}>{activeIndex + 1}</div>
            <p className={styles.sectionLabel}>{activeQuestion?.section}</p>
            <h1>{activeQuestion?.question}</h1>
            <p className={styles.helper}>{activeQuestion?.helper}</p>
            <VoiceAnswer
              answer={activeQuestion?.question ?? ""}
              onConfirm={(answer) => void saveAnswer(activeQuestion!, answer)}
              onLiveTextChange={setLiveTranscript}
              confirmLabel={loadingNext ? "Saving…" : "Save answer"}
              placeholder="Or type your answer here…"
            />
            {error ? <p className={styles.error} role="alert">{error}</p> : null}
          </div>
          <div className={styles.capturedPanel}>
            <div className={styles.capturedHeader}><span>Answers captured live</span><span>{captured.length} / {questions.length}</span></div>
            {questions.map((question) => {
              const item = captured.find((capturedItem) => capturedItem.id === question.id);
              const active = question.id === activeQuestion?.id;
              return (
                <div className={`${styles.cardRow} ${active ? styles.cardRowActive : ""}`} key={question.id}>
                  <span className={styles.cardStatus}>{item ? <Check size={13} /> : active ? <Mic2 size={13} /> : <Circle size={9} />}</span>
                  <span><strong>{question.question}</strong><em>{item?.answer ?? (active ? liveTranscript || "Listening for your answer" : "Not answered yet")}</em></span>
                </div>
              );
            })}
          </div>
          <p className={styles.footerNote}><Mic2 size={14} aria-hidden /> Oriant will read each question aloud when you move forward.</p>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
