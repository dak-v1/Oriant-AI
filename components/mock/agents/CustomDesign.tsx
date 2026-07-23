"use client";
/**
 * CustomDesign — the custom-agent configuration cycle (spec §11.5), a mini
 * discovery with the same soul as Phase 1:
 *
 *   overview (why custom + rough proposal)
 *     → design call (voice questions + live Agent knowledge rail)
 *       → editable Agent Design Report + required setup checklist
 *         → Approve custom agent design
 *
 * Refresh-safe: if designAnswers exist we open straight at the report; if the
 * design is approved everything renders read-only.
 */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Ban,
  CheckCircle2,
  FileText,
  HelpCircle,
  Info,
  Phone,
  Scale,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  Zap,
} from "lucide-react";
import type { AgentDef, AgentDesignAnswers, PlanAgent } from "@/lib/mock/types";
import { useDemoStore } from "@/lib/mock/store";
import { INTEGRATIONS } from "@/lib/mock/fixtures/integrations";
import { money } from "@/lib/mock/pricing";
import { DUR, EASE } from "@/lib/mock/motion";
import VoiceAnswer from "@/components/mock/ui/VoiceAnswer";
import { toast } from "@/components/mock/ui/Toaster";
import AgentKnowledgePanel, { type KnowledgeGroupData } from "./AgentKnowledgePanel";
import DesignReport from "./DesignReport";
import SetupChecklist from "./SetupChecklist";
import styles from "./agents.module.css";

type Stage = "overview" | "call" | "review";

/* Design-call questions map onto AgentDesignAnswers fields in fixture order
   (objective, trigger, inputs, actions, escalation, success). */
const FIELD_ORDER: (keyof AgentDesignAnswers)[] = [
  "objective",
  "trigger",
  "inputs",
  "permittedActions",
  "escalation",
  "successCriteria",
];

type GroupId =
  | "objective"
  | "trigger"
  | "inputs"
  | "decisions"
  | "actions"
  | "escalation"
  | "systems"
  | "success";

const GROUPS: { id: GroupId; label: string }[] = [
  { id: "objective", label: "Objective" },
  { id: "trigger", label: "Trigger" },
  { id: "inputs", label: "Inputs" },
  { id: "decisions", label: "Decisions" },
  { id: "actions", label: "Actions" },
  { id: "escalation", label: "Escalation" },
  { id: "systems", label: "Systems" },
  { id: "success", label: "Success" },
];

/** Short chips distilled from each confirmed fixture answer (by question index). */
const KNOWLEDGE_UNLOCKS: { group: GroupId; chips: string[] }[][] = [
  [
    { group: "objective", chips: ["One decision-ready case file", "Fair resolution proposed"] },
    { group: "decisions", chips: ["Compensation stays with the owner"] },
  ],
  [
    { group: "trigger", chips: ["High-severity complaint", "High-value compensation request"] },
    { group: "decisions", chips: ["Routine complaints stay with Customer Care"] },
  ],
  [
    { group: "inputs", chips: ["Customer history", "Job record", "Invoice status", "Technician notes"] },
    { group: "systems", chips: ["HubSpot", "QuickBooks", "Slack"] },
  ],
  [
    {
      group: "actions",
      chips: ["Gather case context", "Draft resolution + compensation", "Never issues refunds", "Never promises compensation"],
    },
  ],
  [
    { group: "escalation", chips: ["Missing information → owner", "Persistent negative sentiment → owner"] },
  ],
  [
    { group: "success", chips: ["Complete case file within hours", "Customer answer within one business day"] },
  ],
];

export default function CustomDesign({ def, agent }: { def: AgentDef; agent: PlanAgent }) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const submitDesignAnswers = useDemoStore((s) => s.submitDesignAnswers);
  const approveAgentDesign = useDemoStore((s) => s.approveAgentDesign);

  const proposal = def.customProposal;
  const questions = def.designQuestions ?? [];
  const approved = agent.designApproved;

  const [stage, setStage] = useState<Stage>(() => (agent.designAnswers ? "review" : "overview"));
  const [qIndex, setQIndex] = useState(0);
  const [given, setGiven] = useState<string[]>([]);
  const [knowledge, setKnowledge] = useState<Record<GroupId, string[]>>(() => {
    const empty = {} as Record<GroupId, string[]>;
    for (const g of GROUPS) empty[g.id] = [];
    return empty;
  });

  const groupData: KnowledgeGroupData[] = GROUPS.map((g) => ({
    id: g.id,
    label: g.label,
    chips: knowledge[g.id],
  }));

  const buildAnswers = (answers: string[]): AgentDesignAnswers => {
    const get = (field: keyof AgentDesignAnswers) => answers[FIELD_ORDER.indexOf(field)] ?? "";
    const decisions = (proposal?.decisions ?? []).join("; ");
    const systems = def.integrations
      .map((r) => INTEGRATIONS[r.integrationId])
      .filter((d): d is NonNullable<typeof d> => Boolean(d) && d!.kind === "app")
      .map((d) => d.name)
      .join(", ");
    return {
      objective: get("objective") || proposal?.objective || "",
      trigger: get("trigger") || proposal?.trigger || "",
      inputs: get("inputs") || (proposal?.requiredInputs ?? []).join(", "),
      decisions: decisions ? `${decisions}.` : "",
      permittedActions: get("permittedActions") || (proposal?.allowedActions ?? []).join("; "),
      escalation: get("escalation"),
      systems,
      successCriteria: get("successCriteria"),
    };
  };

  const handleConfirm = (text: string) => {
    const next = [...given, text];
    setGiven(next);
    setKnowledge((k) => {
      const updated = { ...k };
      for (const u of KNOWLEDGE_UNLOCKS[qIndex] ?? []) {
        updated[u.group] = [
          ...updated[u.group],
          ...u.chips.filter((c) => !updated[u.group].includes(c)),
        ];
      }
      return updated;
    });
    if (qIndex + 1 < questions.length) {
      setQIndex(qIndex + 1);
    } else {
      submitDesignAnswers(def.id, buildAnswers(next));
      setStage("review");
      toast({
        title: "Design call complete",
        detail: "Review and edit the Agent Design Report before approving.",
        tone: "ok",
      });
    }
  };

  const approve = () => {
    approveAgentDesign(def.id);
    toast({
      title: "Custom agent design approved",
      detail: `${def.name} is ready to build.`,
      tone: "ok",
    });
    router.push("/app/planner");
  };

  /* ── Approved: read-only state ── */
  if (approved && agent.designAnswers) {
    return (
      <div className={styles.docCol} style={{ maxWidth: 900 }}>
        <div
          className={`oa-card oa-card--flat ${styles.card}`}
          style={{ background: "var(--oa-soft-teal)", borderColor: "transparent" }}
        >
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <CheckCircle2 size={20} aria-hidden style={{ color: "var(--oa-teal-deep)", flex: "none", marginTop: 2 }} />
            <div style={{ display: "grid", gap: 4 }}>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 750, color: "var(--oa-teal-deep)" }}>
                Design approved
              </p>
              <p className="oa-sub" style={{ color: "var(--oa-teal-deep)" }}>
                This design is locked and queued for the build. To change it, revisit the workforce
                plan before confirming.
              </p>
            </div>
          </div>
        </div>
        <DesignReport
          agentName={def.name}
          answers={agent.designAnswers}
          editable={false}
          onSave={() => undefined}
        />
        <SetupChecklist def={def} agent={agent} readOnly />
        <div>
          <Link href="/app/planner" className="oa-btn oa-btn--ghost">
            Back to workforce plan
          </Link>
        </div>
      </div>
    );
  }

  /* ── Review: editable report + checklist + approve ── */
  if (stage === "review" && agent.designAnswers) {
    return (
      <motion.div
        className={styles.docCol}
        style={{ maxWidth: 900 }}
        initial={reduced ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DUR.card, ease: EASE }}
      >
        <DesignReport
          agentName={def.name}
          answers={agent.designAnswers}
          editable
          onSave={(field, value) =>
            submitDesignAnswers(def.id, { ...agent.designAnswers!, [field]: value })
          }
        />
        <SetupChecklist def={def} agent={agent} readOnly={false} />
        <div className={styles.stickyBar}>
          <div className={`oa-card ${styles.stickyInner}`}>
            <div className={styles.stickySummary}>
              <span style={{ fontSize: 13.5, fontWeight: 750 }}>
                {money(def.setupCost)} setup · {money(def.monthlyCost)}/month{" "}
                <span className="oa-sub" style={{ fontWeight: 600 }}>— illustrative pricing</span>
              </span>
              <span className={`oa-sub ${styles.stickyLine}`}>
                Approving hands this design to the Agent Factory exactly as written above.
              </span>
            </div>
            <button type="button" className="oa-btn oa-btn--primary" onClick={approve}>
              <CheckCircle2 size={15} aria-hidden />
              Approve custom agent design
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  /* ── Design call ── */
  if (stage === "call") {
    const q = questions[qIndex];
    return (
      <div className={styles.layout}>
        <div className={styles.docCol}>
          <section className={`oa-card ${styles.card}`} style={{ gap: 16 }}>
            <div className="oa-between" style={{ gap: 10 }}>
              <span className="oa-status oa-status--active">
                <Phone size={11} aria-hidden style={{ marginRight: 2 }} />
                Design call
              </span>
              <span className="oa-micro">
                Question {Math.min(qIndex + 1, questions.length)} of {questions.length}
              </span>
            </div>
            <div
              className="oa-progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={questions.length}
              aria-valuenow={given.length}
              aria-label="Design call progress"
            >
              <span style={{ width: `${(given.length / Math.max(1, questions.length)) * 100}%` }} />
            </div>
            <span className="oa-sim-note">
              Simulated design call — the answers are prepared demo content.
            </span>

            {given.length > 0 && (
              <div style={{ display: "grid", gap: 5 }}>
                {questions.slice(0, given.length).map((prev) => (
                  <span
                    key={prev.id}
                    className="oa-sub"
                    style={{ display: "flex", gap: 7, alignItems: "flex-start" }}
                  >
                    <CheckCircle2
                      size={13}
                      aria-hidden
                      style={{ flex: "none", marginTop: 3, color: "var(--oa-teal-deep)" }}
                    />
                    {prev.question}
                  </span>
                ))}
              </div>
            )}

            {q && (
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={q.id}
                  initial={reduced ? false : { opacity: 0, x: 26 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reduced ? undefined : { opacity: 0, x: -26 }}
                  transition={{ duration: DUR.card, ease: EASE }}
                  style={{ display: "grid", gap: 14 }}
                >
                  <div style={{ display: "grid", gap: 6 }}>
                    <h2 className="oa-h2">{q.question}</h2>
                    <p className="oa-sub" style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
                      <Info size={13} aria-hidden style={{ flex: "none", marginTop: 3 }} />
                      Why Oriant asks — {q.reason}
                    </p>
                  </div>
                  <VoiceAnswer answer={q.answer} onConfirm={handleConfirm} />
                </motion.div>
              </AnimatePresence>
            )}
          </section>
        </div>

        <div className={styles.rail}>
          <AgentKnowledgePanel groups={groupData} />
        </div>
      </div>
    );
  }

  /* ── Overview: why custom + rough proposal ── */
  if (!proposal) return null;

  const overviewBlocks: {
    icon: React.ReactNode;
    title: string;
    body?: string;
    items?: string[];
    chips?: string[];
  }[] = [
    { icon: <Target size={14} aria-hidden />, title: "Objective", body: proposal.objective },
    { icon: <Zap size={14} aria-hidden />, title: "Trigger", body: proposal.trigger },
    { icon: <Users size={14} aria-hidden />, title: "Teams involved", chips: proposal.teamsInvolved },
    { icon: <FileText size={14} aria-hidden />, title: "Required inputs", items: proposal.requiredInputs },
    { icon: <Scale size={14} aria-hidden />, title: "Decisions it prepares", items: proposal.decisions },
    { icon: <CheckCircle2 size={14} aria-hidden />, title: "Allowed actions", items: proposal.allowedActions },
    { icon: <Ban size={14} aria-hidden />, title: "Prohibited actions", items: proposal.prohibitedActions },
    { icon: <ShieldCheck size={14} aria-hidden />, title: "Approval points", items: proposal.approvalPoints },
  ];

  return (
    <motion.div
      className={styles.docCol}
      style={{ maxWidth: 900 }}
      initial={reduced ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR.card, ease: EASE }}
    >
      <section className={`oa-card ${styles.card}`} style={{ gap: 12 }}>
        <p className="oa-micro" style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
          <Sparkles size={13} aria-hidden style={{ color: "var(--oa-blue)" }} />
          Why this needs a custom agent
        </p>
        <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.65 }}>{proposal.whyCustom}</p>
      </section>

      <div className={styles.propGrid}>
        {overviewBlocks.map((b) => (
          <div key={b.title} className={styles.propBlock}>
            <p className="oa-micro" style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
              <span aria-hidden style={{ color: "var(--oa-muted-strong)", display: "inline-flex" }}>
                {b.icon}
              </span>
              {b.title}
            </p>
            {b.body && <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }}>{b.body}</p>}
            {b.chips && (
              <div className="oa-cluster" style={{ gap: 6 }}>
                {b.chips.map((c) => (
                  <span key={c} className="oa-chip" style={{ padding: "4px 11px", fontSize: 12 }}>
                    {c}
                  </span>
                ))}
              </div>
            )}
            {b.items && (
              <ul style={{ margin: 0, paddingLeft: 16, display: "grid", gap: 4 }}>
                {b.items.map((it) => (
                  <li key={it} className="oa-sub" style={{ color: "var(--oa-ink)", fontSize: 13 }}>
                    {it}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}

        <div
          className={`${styles.propBlock} ${styles.propWide}`}
          style={{ borderStyle: "dashed", borderColor: "var(--oa-amber-border)", background: "transparent" }}
        >
          <p
            className="oa-micro"
            style={{ display: "inline-flex", alignItems: "center", gap: 7, color: "var(--oa-amber-ink)" }}
          >
            <HelpCircle size={14} aria-hidden />
            Missing information — settled in the design call
          </p>
          <ul style={{ margin: 0, paddingLeft: 16, display: "grid", gap: 4 }}>
            {proposal.missingInformation.map((m) => (
              <li key={m} className="oa-sub" style={{ color: "var(--oa-ink)", fontSize: 13 }}>
                {m}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="oa-between" style={{ gap: 12 }}>
        <span className="oa-sub">
          {questions.length} questions · designed only for this agent · about two minutes
        </span>
        <button type="button" className="oa-btn oa-btn--primary oa-btn--lg" onClick={() => setStage("call")}>
          Start design call
          <ArrowRight size={16} aria-hidden />
        </button>
      </div>
    </motion.div>
  );
}
