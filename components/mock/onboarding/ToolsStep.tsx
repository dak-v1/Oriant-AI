"use client";
import { useEffect, useState } from "react";
import { Check, FileUp, Info, Plus } from "lucide-react";
import { useDemoStore } from "@/lib/mock/store";
import AppIcon from "@/components/mock/ui/AppIcon";
import VoiceFieldButton from "@/components/mock/ui/VoiceFieldButton";
import type { AutomationScope } from "@/lib/mock/types";
import {
  TOOL_CATALOG,
  TOOL_CATEGORY_LABELS,
  type CatalogTool,
} from "@/lib/mock/fixtures/demo-company";
import AddAppDrawer, { type AddAppTab } from "./AddAppDrawer";
import styles from "./onboarding.module.css";

const BY_ID = new Map(TOOL_CATALOG.map((tool) => [tool.id, tool]));

interface TailoredQuestionPayload {
  question: string;
  helper: string;
  voicePrompt: string;
  suggestions: string[];
}

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]+/g, " ").replace(/\s+/g, " ").trim();
}

function matchToolsFromTranscript(transcript: string): CatalogTool[] {
  const target = normalise(transcript);
  if (!target) return [];
  return TOOL_CATALOG.filter((tool) => {
    const name = normalise(tool.name);
    const id = normalise(tool.id.replace(/-/g, " "));
    return target.includes(name) || target.includes(id) || name.includes(target);
  });
}

async function submitVoiceTranscript(questionId: string, transcript: string) {
  const response = await fetch("/api/onboarding/voice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      questionId,
      transcript,
      confirmedAnswer: transcript,
      language: "en",
    }),
  });
  if (!response.ok) throw new Error("Supabase could not save the voice transcript.");
}

function recommendationFor(scope: AutomationScope | null, area: string, task: string): string[] {
  if (!task.trim()) return [];
  if (scope === "whole_business") {
    return [
      `Map the current ${area || "business"} workflow into one shared structure`,
      `Highlight where ${task.toLowerCase()} currently slows the team down`,
      "Recommend the first low-risk automation milestone before a broader roadmap",
    ];
  }
  if (scope === "focus_area") {
    return [
      `Standardise how ${task.toLowerCase()} is handled today`,
      `Draft the first workflow for ${area || "that area"} with a human approval step`,
      "Start with the safest useful action before expanding further",
    ];
  }
  return [
    `Capture the current steps for ${task.toLowerCase()}`,
    "Remove the most repetitive manual step first",
    "Keep the first workflow narrow, reviewable and low-risk",
  ];
}

export default function ToolsStep({
  automationScope,
  businessArea,
  repetitiveTask,
  currentWorkflow,
  selectedToolIds,
  onCurrentWorkflowChange,
  onToggle,
}: {
  automationScope: AutomationScope | null;
  businessArea: string;
  repetitiveTask: string;
  currentWorkflow: string;
  selectedToolIds: string[];
  onCurrentWorkflowChange: (workflow: string) => void;
  onToggle: (toolId: string) => void;
}) {
  const customTools = useDemoStore((s) => s.onboarding.customTools);
  const selectedTools = selectedToolIds
    .map((id) => BY_ID.get(id))
    .filter((tool): tool is CatalogTool => Boolean(tool));
  const recommendations = recommendationFor(automationScope, businessArea, repetitiveTask);
  const [workflowPrompt, setWorkflowPrompt] = useState<TailoredQuestionPayload | null>(null);
  const [toolsPrompt, setToolsPrompt] = useState<TailoredQuestionPayload | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<AddAppTab>("catalog");

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const res = await fetch("/api/onboarding/discovery-agent?target=current_workflow", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as TailoredQuestionPayload;
      if (!cancelled) setWorkflowPrompt(data);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [businessArea, repetitiveTask]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const res = await fetch("/api/onboarding/discovery-agent?target=selected_tools", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as TailoredQuestionPayload;
      if (!cancelled) setToolsPrompt(data);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [businessArea, repetitiveTask, currentWorkflow]);

  return (
    <div style={{ display: "grid", gap: 22 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <h2 className="oa-h3">How do you handle this today?</h2>
        <p className="oa-sub">
          Walk us through the current process in plain language.
        </p>
      </div>

      <div className={styles.discoveryQuestionCard}>
        <div className={styles.questionHeader}>
          <div style={{ display: "grid", gap: 4 }}>
            <span className="oa-micro">Current workflow</span>
            <h3 className="oa-h3">{workflowPrompt?.question ?? "How does this task work today?"}</h3>
            <p className="oa-sub" style={{ margin: 0 }}>
              {workflowPrompt?.helper ?? "Walk us through the current process in plain language."}
            </p>
          </div>
          <VoiceFieldButton
            label="Answer with voice"
            onTranscript={async (transcript) => {
              onCurrentWorkflowChange(transcript);
              await submitVoiceTranscript("current_workflow", transcript);
            }}
          />
        </div>
        <textarea
          className={`oa-textarea ${styles.workflowTextarea}`}
          rows={6}
          value={currentWorkflow}
          onChange={(e) => onCurrentWorkflowChange(e.target.value)}
          placeholder="Walk us through what happens today, step by step."
        />
        {workflowPrompt?.suggestions?.length ? (
          <div className={styles.promptSuggestions}>
            {workflowPrompt.suggestions.map((item) => (
              <span key={item} className="oa-chip">{item}</span>
            ))}
          </div>
        ) : null}
        <div className={styles.uploadHintCard}>
          <div style={{ display: "grid", gap: 4 }}>
            <span className="oa-micro">Helpful uploads</span>
            <p className="oa-sub" style={{ margin: 0 }}>
              If you already have screenshots or docs, you can add them later.
            </p>
          </div>
          <button type="button" className="oa-btn oa-btn--ghost oa-btn--sm">
            <FileUp size={14} aria-hidden />
            Add evidence later
          </button>
        </div>
      </div>

      <div className={styles.discoveryQuestionCard}>
        <div className={styles.questionHeader}>
          <div style={{ display: "grid", gap: 4 }}>
            <h3 className="oa-h3">{toolsPrompt?.question ?? "Which tools are part of this workflow?"}</h3>
            <p className="oa-sub" style={{ margin: 0 }}>
              {toolsPrompt?.helper ?? `Select only the systems involved in ${repetitiveTask ? `"${repetitiveTask}"` : "this workflow"}.`}
            </p>
          </div>
          <VoiceFieldButton
            label="List tools with voice"
            onTranscript={async (transcript) => {
              const matches = matchToolsFromTranscript(transcript);
              for (const tool of matches) {
                if (!selectedToolIds.includes(tool.id)) onToggle(tool.id);
              }
              await submitVoiceTranscript("selected_tools", transcript);
            }}
          />
        </div>
        <div className={styles.workflowToolGrid}>
          {TOOL_CATALOG.slice(0, 12).map((tool) => {
            const selected = selectedToolIds.includes(tool.id);
            return (
              <button
                key={tool.id}
                type="button"
                className={`oa-selectable ${styles.workflowToolCard} ${selected ? "oa-selectable--selected" : ""}`}
                aria-pressed={selected}
                onClick={() => onToggle(tool.id)}
              >
                <AppIcon
                  name={tool.name}
                  slug={tool.iconSlug}
                  color={tool.iconColor}
                  className={styles.workflowToolIcon}
                />
                <span className={styles.modeBody}>
                  <span className={styles.modeTitle}>{tool.name}</span>
                  <span className="oa-sub">
                    {TOOL_CATEGORY_LABELS[tool.category]} · {tool.purpose}
                  </span>
                </span>
                <span className="oa-radio" aria-hidden />
              </button>
            );
          })}
          <button
            type="button"
            className={`oa-selectable ${styles.workflowToolCard} ${styles.workflowToolCardAdd}`}
            onClick={() => {
              setDrawerTab("catalog");
              setDrawerOpen(true);
            }}
          >
            <span className={styles.workflowToolAddIcon} aria-hidden>
              <Plus size={18} />
            </span>
            <span className={styles.modeBody}>
              <span className={styles.modeTitle}>+ Others</span>
              <span className="oa-sub">
                Search the full app catalog or add a custom tool.
              </span>
            </span>
          </button>
        </div>
        {customTools.length > 0 && (
          <div className={styles.customToolList}>
            {customTools.map((tool) => (
              <div key={tool.id} className={styles.customToolRow}>
                <span className={styles.customToolMeta}>
                  <strong>{tool.name}</strong>
                  <span className="oa-sub">
                    {TOOL_CATEGORY_LABELS[tool.category]} · {tool.purpose}
                  </span>
                </span>
                <span className="oa-tag oa-tag--amber">Custom</span>
              </div>
            ))}
          </div>
        )}
        {toolsPrompt?.suggestions?.length ? (
          <div className={styles.promptSuggestions}>
            {toolsPrompt.suggestions.map((item) => (
              <span key={item} className="oa-chip">{item}</span>
            ))}
          </div>
        ) : null}
        <span className="oa-sim-note">
          <Info size={12} aria-hidden />
          Nothing gets connected yet. This just helps Oriant understand the workflow.
        </span>
      </div>

      <div className={styles.blueprintCard}>
        <div style={{ display: "grid", gap: 4 }}>
          <h3 className="oa-h3">What should Oriant help with first?</h3>
          <p className="oa-sub" style={{ margin: 0 }}>
            We&apos;ll recommend a practical first step, not a giant automation jump.
          </p>
        </div>
        <ul className={styles.discoveryMethodList}>
          {recommendations.length > 0 ? (
            recommendations.map((item) => (
              <li key={item}>
                <Check size={14} aria-hidden />
                <span>{item}</span>
              </li>
            ))
          ) : (
            <li>
              <Check size={14} aria-hidden />
              <span>Choose the most repetitive task first so Oriant can recommend a clear starting point.</span>
            </li>
          )}
        </ul>
      </div>

      <AddAppDrawer
        open={drawerOpen}
        tab={drawerTab}
        onTabChange={setDrawerTab}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
