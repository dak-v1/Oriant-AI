"use client";
import { useEffect, useMemo, useState } from "react";
import {
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ClipboardList,
  Cog,
  FileSpreadsheet,
  FolderKanban,
  HandCoins,
  Headset,
  Megaphone,
  Pencil,
  PenSquare,
  RotateCcw,
  Sparkles,
  Wrench,
} from "lucide-react";
import VoiceAnswer from "@/components/mock/ui/VoiceAnswer";
import VoiceFieldButton from "@/components/mock/ui/VoiceFieldButton";
import type { AutomationScope, OrganizationShape } from "@/lib/mock/types";
import { DEMO_INTRO_ANSWER } from "@/lib/mock/fixtures/demo-company";
import styles from "./onboarding.module.css";

const INTRO_PROMPT =
  "Tell us briefly about your business.";

const AREA_OPTIONS: Record<AutomationScope, string[]> = {
  start_small: [
    "Answering customer questions",
    "Scheduling appointments",
    "Following up with leads",
    "Preparing reports",
    "Sending invoices or chasing payment",
    "Something else",
  ],
  focus_area: [
    "Marketing",
    "Customer service",
    "Operations",
    "Finance",
    "Sales",
    "Something else",
  ],
  whole_business: [
    "Customer service",
    "Operations",
    "Marketing",
    "Finance",
    "Sales",
    "Admin",
  ],
};

const TASK_OPTIONS: Record<string, string[]> = {
  Marketing: [
    "Creating social media captions",
    "Scheduling posts",
    "Repurposing content",
    "Preparing campaign reports",
    "Collecting content from teammates",
    "Something else",
  ],
  "Customer service": [
    "Responding to customer enquiries",
    "Following up with customers",
    "Summarising conversations",
    "Preparing replies",
    "Routing requests",
    "Something else",
  ],
  Operations: [
    "Scheduling appointments",
    "Rescheduling bookings",
    "Updating job sheets",
    "Coordinating technicians",
    "Confirming customer availability",
    "Something else",
  ],
  Finance: [
    "Sending invoices",
    "Chasing payment",
    "Reconciling payments",
    "Preparing finance reports",
    "Checking overdue accounts",
    "Something else",
  ],
  Sales: [
    "Following up with leads",
    "Preparing proposals",
    "Updating CRM records",
    "Booking sales calls",
    "Sending reminders",
    "Something else",
  ],
  Admin: [
    "Collecting forms",
    "Updating spreadsheets",
    "Preparing internal reports",
    "Sending reminders",
    "Organising documents",
    "Something else",
  ],
  "Something else": [
    "A manual task I repeat often",
    "A task that slows my team down",
    "A task that needs checking every time",
  ],
};

function scopeLabel(scope: AutomationScope | null): string {
  switch (scope) {
    case "start_small":
      return "Start small";
    case "focus_area":
      return "Focus one area";
    case "whole_business":
      return "Whole business";
    default:
      return "Discovery";
  }
}

interface TailoredQuestionPayload {
  question: string;
  helper: string;
  voicePrompt: string;
  suggestions: string[];
}

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]+/g, " ").replace(/\s+/g, " ").trim();
}

function bestOptionMatch(input: string, options: string[]): string | null {
  const target = normalise(input);
  if (!target) return null;

  let best: { option: string; score: number } | null = null;
  for (const option of options) {
    if (option === "Something else") continue;
    const candidate = normalise(option);
    if (target === candidate || target.includes(candidate) || candidate.includes(target)) {
      return option;
    }
    const targetWords = new Set(target.split(" "));
    const candidateWords = candidate.split(" ");
    const overlap = candidateWords.filter((word) => targetWords.has(word)).length;
    const score = overlap / Math.max(candidateWords.length, 1);
    if (!best || score > best.score) best = { option, score };
  }
  return best && best.score >= 0.5 ? best.option : null;
}

async function submitVoiceTranscript(questionId: string, transcript: string) {
  await fetch("/api/onboarding/voice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      questionId,
      transcript,
      confirmedAnswer: transcript,
      language: "en",
    }),
  });
}

function areaMeta(option: string): { title: string; note: string; icon: typeof BriefcaseBusiness } {
  switch (option) {
    case "Marketing":
      return { title: option, note: "Campaigns, content, and outreach", icon: Megaphone };
    case "Customer service":
      return { title: option, note: "Support requests and customer replies", icon: Headset };
    case "Operations":
      return { title: option, note: "Scheduling, coordination, and delivery", icon: Cog };
    case "Finance":
      return { title: option, note: "Invoices, payments, and reporting", icon: HandCoins };
    case "Sales":
      return { title: option, note: "Leads, follow-ups, and proposals", icon: FolderKanban };
    case "Admin":
      return { title: option, note: "Back-office work and internal coordination", icon: ClipboardList };
    case "Answering customer questions":
      return { title: option, note: "Messages, enquiries, and first responses", icon: Headset };
    case "Scheduling appointments":
      return { title: option, note: "Bookings, reminders, and calendar changes", icon: CalendarDays };
    case "Following up with leads":
      return { title: option, note: "Lead nurturing and timely follow-up", icon: FolderKanban };
    case "Preparing reports":
      return { title: option, note: "Manual summaries and recurring updates", icon: FileSpreadsheet };
    case "Sending invoices or chasing payment":
      return { title: option, note: "Billing tasks and payment follow-up", icon: HandCoins };
    default:
      return { title: option, note: "Add a custom area that fits your business", icon: Sparkles };
  }
}

function taskMeta(option: string): { title: string; note: string; icon: typeof BriefcaseBusiness } {
  switch (option) {
    case "Creating social media captions":
      return { title: option, note: "Writing content from scratch repeatedly", icon: PenSquare };
    case "Scheduling posts":
      return { title: option, note: "Publishing content across channels", icon: CalendarDays };
    case "Repurposing content":
      return { title: option, note: "Turning one piece into many formats", icon: Megaphone };
    case "Preparing campaign reports":
      return { title: option, note: "Collecting results into regular updates", icon: FileSpreadsheet };
    case "Collecting content from teammates":
      return { title: option, note: "Chasing assets and approvals internally", icon: ClipboardList };
    case "Responding to customer enquiries":
      return { title: option, note: "Replying to inbound questions quickly", icon: Headset };
    case "Following up with customers":
      return { title: option, note: "Closing loops after service or support", icon: FolderKanban };
    case "Summarising conversations":
      return { title: option, note: "Turning calls and chats into usable notes", icon: ClipboardList };
    case "Preparing replies":
      return { title: option, note: "Drafting common responses over and over", icon: PenSquare };
    case "Routing requests":
      return { title: option, note: "Sending the right request to the right person", icon: Cog };
    case "Scheduling appointments":
    case "Rescheduling bookings":
    case "Confirming customer availability":
      return { title: option, note: "Calendar coordination done manually", icon: CalendarDays };
    case "Updating job sheets":
    case "Coordinating technicians":
      return { title: option, note: "Operational updates that need constant checking", icon: Wrench };
    case "Sending invoices":
    case "Chasing payment":
    case "Reconciling payments":
    case "Checking overdue accounts":
      return { title: option, note: "Finance follow-up that repeats often", icon: HandCoins };
    case "Preparing finance reports":
    case "Updating spreadsheets":
    case "Preparing internal reports":
      return { title: option, note: "Manual reporting and spreadsheet work", icon: FileSpreadsheet };
    case "Following up with leads":
    case "Preparing proposals":
    case "Updating CRM records":
    case "Booking sales calls":
    case "Sending reminders":
      return { title: option, note: "Sales admin that slows the team down", icon: FolderKanban };
    case "Collecting forms":
    case "Organising documents":
      return { title: option, note: "Admin work that depends on repetitive handling", icon: ClipboardList };
    default:
      return { title: option, note: "Add a custom task in your own words", icon: Sparkles };
  }
}

export default function IntroStep({
  variant = "all",
  intro,
  channel,
  organizationShape,
  automationScope,
  businessArea,
  repetitiveTask,
  onConfirmIntro,
  onEditIntro,
  onBusinessAreaChange,
  onRepetitiveTaskChange,
}: {
  variant?: "intro" | "focus" | "all";
  intro: string;
  channel: "typed" | "voice";
  organizationShape: OrganizationShape;
  automationScope: AutomationScope | null;
  businessArea: string;
  repetitiveTask: string;
  onConfirmIntro: (text: string) => void;
  onEditIntro: (text: string) => void;
  onBusinessAreaChange: (area: string) => void;
  onRepetitiveTaskChange: (task: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [areaOtherValue, setAreaOtherValue] = useState("");
  const [taskOtherValue, setTaskOtherValue] = useState("");
  const [areaOtherOpen, setAreaOtherOpen] = useState(false);
  const [taskOtherOpen, setTaskOtherOpen] = useState(false);
  const [areaPrompt, setAreaPrompt] = useState<TailoredQuestionPayload | null>(null);
  const [taskPrompt, setTaskPrompt] = useState<TailoredQuestionPayload | null>(null);
  const hasIntro = intro.trim().length > 0;
  const areaOptions = automationScope ? AREA_OPTIONS[automationScope] : AREA_OPTIONS.start_small;
  const businessAreaIsCustom =
    businessArea.trim().length > 0 && !areaOptions.includes(businessArea);
  const taskOptions = useMemo(
    () => TASK_OPTIONS[businessArea] ?? TASK_OPTIONS["Something else"],
    [businessArea],
  );
  const repetitiveTaskIsCustom =
    repetitiveTask.trim().length > 0 && !taskOptions.includes(repetitiveTask);

  useEffect(() => {
    if (businessAreaIsCustom) {
      setAreaOtherOpen(true);
      setAreaOtherValue(businessArea);
      return;
    }
    if (businessArea === "Something else") {
      setAreaOtherOpen(true);
      return;
    }
    setAreaOtherOpen(false);
  }, [businessArea, businessAreaIsCustom]);

  useEffect(() => {
    if (repetitiveTaskIsCustom) {
      setTaskOtherOpen(true);
      setTaskOtherValue(repetitiveTask);
      return;
    }
    if (repetitiveTask === "Something else") {
      setTaskOtherOpen(true);
      return;
    }
    setTaskOtherOpen(false);
  }, [repetitiveTask, repetitiveTaskIsCustom]);

  useEffect(() => {
    if (variant === "intro") return;
    let cancelled = false;
    const run = async () => {
      const res = await fetch("/api/onboarding/discovery-agent?target=business_area", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as TailoredQuestionPayload;
      if (!cancelled) setAreaPrompt(data);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [automationScope, intro, variant]);

  useEffect(() => {
    if (variant === "intro") return;
    let cancelled = false;
    const run = async () => {
      const res = await fetch("/api/onboarding/discovery-agent?target=repetitive_task", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as TailoredQuestionPayload;
      if (!cancelled) setTaskPrompt(data);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [businessArea, automationScope, intro, variant]);

  const showIntro = variant === "intro" || variant === "all";
  const showFocus = variant === "focus" || variant === "all";

  return (
    <div style={{ display: "grid", gap: 22 }}>
      {showIntro && (
        <>
          <div style={{ display: "grid", gap: 8 }}>
            <span className="oa-micro">{scopeLabel(automationScope)}</span>
            <p className={styles.promptQuote}>“{INTRO_PROMPT}”</p>
            <p className="oa-sub">
              {channel === "voice"
                ? "A short answer is enough. We&apos;ll tailor the next questions from there."
                : "Keep this brief. We just need enough context to understand the business first."}
            </p>
          </div>

          {!hasIntro ? (
            <VoiceAnswer
              answer={DEMO_INTRO_ANSWER}
              confirmLabel="Save business summary"
              onConfirm={onConfirmIntro}
            />
          ) : (
            <div className={styles.capturedCard}>
              <div className="oa-between">
                <span className="oa-status oa-status--completed">Captured</span>
                <div className="oa-cluster">
                  {!editing && (
                    <button
                      type="button"
                      className="oa-btn oa-btn--ghost oa-btn--sm"
                      onClick={() => {
                        setDraft(intro);
                        setEditing(true);
                      }}
                    >
                      <Pencil size={12} aria-hidden />
                      Edit text
                    </button>
                  )}
                  <button
                    type="button"
                    className="oa-btn oa-btn--ghost oa-btn--sm"
                    onClick={() => {
                      setEditing(false);
                      onEditIntro("");
                    }}
                  >
                    <RotateCcw size={12} aria-hidden />
                    Re-record
                  </button>
                </div>
              </div>

              {editing ? (
                <div style={{ display: "grid", gap: 8 }}>
                  <textarea
                    className="oa-textarea"
                    rows={4}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    aria-label="Edit your business summary"
                    autoFocus
                  />
                  <div className="oa-cluster" style={{ justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      className="oa-btn oa-btn--ghost oa-btn--sm"
                      onClick={() => setEditing(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="oa-btn oa-btn--soft oa-btn--sm"
                      disabled={!draft.trim()}
                      onClick={() => {
                        onEditIntro(draft.trim());
                        setEditing(false);
                      }}
                    >
                      <Check size={13} aria-hidden />
                      Save changes
                    </button>
                  </div>
                </div>
              ) : (
                <p>{intro}</p>
              )}
            </div>
          )}
        </>
      )}

      {showFocus && (
        <div className={styles.discoveryPanel}>
        <div className={styles.discoveryQuestionCard}>
          <div className={styles.questionHeader}>
            <div style={{ display: "grid", gap: 4 }}>
              <h3 className="oa-h3">{areaPrompt?.question ?? "Which part of the business takes up the most time?"}</h3>
              <p className="oa-sub" style={{ margin: 0 }}>
                {areaPrompt?.helper ?? "Pick the area you want to improve first."}
              </p>
            </div>
            <VoiceFieldButton
              label="Answer with voice"
              onTranscript={async (transcript) => {
                const match = bestOptionMatch(transcript, areaOptions);
                if (match) {
                  setAreaOtherOpen(false);
                  onBusinessAreaChange(match);
                } else {
                  setAreaOtherOpen(true);
                  setAreaOtherValue(transcript);
                  onBusinessAreaChange(transcript);
                }
                await submitVoiceTranscript("business_area", transcript);
              }}
            />
          </div>
          <div className={styles.choiceGrid}>
            {areaOptions.map((option) => {
              const selected =
                businessArea === option
                || (option === "Something else" && (areaOtherOpen || businessAreaIsCustom));
              const meta = areaMeta(option);
              const Icon = meta.icon;
              return (
                <button
                  key={option}
                  type="button"
                  className={`oa-selectable ${styles.optionCard} ${selected ? "oa-selectable--selected" : ""}`}
                  aria-pressed={selected}
                  onClick={() => {
                    if (option === "Something else") {
                      setAreaOtherOpen(true);
                      onBusinessAreaChange(areaOtherValue.trim() || "Something else");
                      return;
                    }
                    setAreaOtherOpen(false);
                    onBusinessAreaChange(option);
                  }}
                >
                  <span className={styles.optionCardBody}>
                    <span className={styles.optionCardTop}>
                      <span className={styles.optionCardIcon}>
                        <Icon size={16} aria-hidden />
                      </span>
                      <span className="oa-radio" aria-hidden />
                    </span>
                    <span className={styles.optionCardText}>
                      <span className={styles.optionCardTitle}>{meta.title}</span>
                      <span className="oa-sub">{meta.note}</span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          {areaOtherOpen && (
            <div className={styles.optionOtherInput}>
              <label className="oa-label" htmlFor="business-area-other">
                Tell us the area
              </label>
              <input
                id="business-area-other"
                type="text"
                className="oa-input"
                placeholder="e.g. Procurement, Legal, Warehouse operations"
                value={areaOtherValue}
                onChange={(e) => {
                  const value = e.target.value;
                  setAreaOtherValue(value);
                  onBusinessAreaChange(value.trim() || "Something else");
                }}
              />
            </div>
          )}
          {areaPrompt?.suggestions?.length ? (
            <div className={styles.promptSuggestions}>
              {areaPrompt.suggestions.map((item) => (
                <span key={item} className="oa-chip">{item}</span>
              ))}
            </div>
          ) : null}
        </div>

        <div className={styles.discoveryQuestionCard}>
          <div className={styles.questionHeader}>
            <div style={{ display: "grid", gap: 4 }}>
              <h3 className="oa-h3">{taskPrompt?.question ?? "Which specific task feels the most repetitive or frustrating?"}</h3>
              <p className="oa-sub" style={{ margin: 0 }}>
                {taskPrompt?.helper ?? "Choose the task that would make the biggest difference if it became easier."}
              </p>
            </div>
            <VoiceFieldButton
              label="Answer with voice"
              onTranscript={async (transcript) => {
                const match = bestOptionMatch(transcript, taskOptions);
                if (match) {
                  setTaskOtherOpen(false);
                  onRepetitiveTaskChange(match);
                } else {
                  setTaskOtherOpen(true);
                  setTaskOtherValue(transcript);
                  onRepetitiveTaskChange(transcript);
                }
                await submitVoiceTranscript("repetitive_task", transcript);
              }}
            />
          </div>
          <div className={styles.choiceGrid}>
            {taskOptions.map((option) => {
              const selected =
                repetitiveTask === option
                || (option === "Something else" && (taskOtherOpen || repetitiveTaskIsCustom));
              const meta = taskMeta(option);
              const Icon = meta.icon;
              return (
                <button
                  key={option}
                  type="button"
                  className={`oa-selectable ${styles.optionCard} ${selected ? "oa-selectable--selected" : ""}`}
                  aria-pressed={selected}
                  onClick={() => {
                    if (option === "Something else") {
                      setTaskOtherOpen(true);
                      onRepetitiveTaskChange(taskOtherValue.trim() || "Something else");
                      return;
                    }
                    setTaskOtherOpen(false);
                    onRepetitiveTaskChange(option);
                  }}
                >
                  <span className={styles.optionCardBody}>
                    <span className={styles.optionCardTop}>
                      <span className={styles.optionCardIcon}>
                        <Icon size={16} aria-hidden />
                      </span>
                      <span className="oa-radio" aria-hidden />
                    </span>
                    <span className={styles.optionCardText}>
                      <span className={styles.optionCardTitle}>{meta.title}</span>
                      <span className="oa-sub">{meta.note}</span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          {taskOtherOpen && (
            <div className={styles.optionOtherInput}>
              <label className="oa-label" htmlFor="task-other">
                Tell us the task
              </label>
              <input
                id="task-other"
                type="text"
                className="oa-input"
                placeholder="e.g. Sending contractor reminders before each job"
                value={taskOtherValue}
                onChange={(e) => {
                  const value = e.target.value;
                  setTaskOtherValue(value);
                  onRepetitiveTaskChange(value.trim() || "Something else");
                }}
              />
            </div>
          )}
          {taskPrompt?.suggestions?.length ? (
            <div className={styles.promptSuggestions}>
              {taskPrompt.suggestions.map((item) => (
                <span key={item} className="oa-chip">{item}</span>
              ))}
            </div>
          ) : null}
          {organizationShape !== "solo" && (
            <span className="oa-sim-note">
              Keep it narrow first. You can bring in teammates later if needed.
            </span>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
