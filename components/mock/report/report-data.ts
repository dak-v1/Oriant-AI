"use client";

import type {
  CompanyReportState,
  DiscoveryState,
  FactSource,
  OnboardingState,
  ReportFactDef,
  ReportSectionDef,
  ReportSectionId,
} from "@/lib/mock/types";
import { DEMO_COMPANY } from "@/lib/mock/fixtures/demo-company";

function safeText(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function listOrFallback(items: string[], fallback: string[]) {
  return items.length > 0 ? items : fallback;
}

function evidenceOrFallback(
  items: ReportSectionDef["evidence"],
  fallback: ReportSectionDef["evidence"],
) {
  return items.length > 0 ? items : fallback;
}

function detectSource(hasValue: boolean, preferred: FactSource = "owner"): FactSource {
  return hasValue ? preferred : "inference";
}

function firstAnswer(discovery: DiscoveryState, patterns: string[]) {
  const entry = Object.entries(discovery.answers).find(([id]) => patterns.some((pattern) => id.includes(pattern)));
  return entry?.[1]?.trim() ?? "";
}

function scopeLabel(scope: OnboardingState["automationScope"]) {
  switch (scope) {
    case "start_small":
      return "Start with one task";
    case "focus_area":
      return "Improve one business area";
    case "whole_business":
      return "Analyse the whole business";
    default:
      return "Not set yet";
  }
}

function builderLabel(builder: OnboardingState["workflowBuilder"]) {
  switch (builder) {
    case "self":
      return "The owner will build the first workflow.";
    case "invite":
      return "The owner wants to invite someone else to build the first workflow.";
    default:
      return "Workflow ownership has not been set yet.";
  }
}

function teamLabel(shape: OnboardingState["organizationShape"]) {
  switch (shape) {
    case "solo":
      return "Just the owner";
    case "owner_with_team":
      return "Owner with a team";
    case "multi_role_team":
      return "Multi-role team";
    case "manager_led":
      return "Manager-led team";
    default:
      return "Not set yet";
  }
}

function builderLabelShort(builder: OnboardingState["workflowBuilder"]) {
  switch (builder) {
    case "self":
      return "owner_builds";
    case "invite":
      return "invite_builder";
    default:
      return "not_set";
  }
}

function orderedWorkflowSteps(currentWorkflow: string, stepsAnswer: string) {
  const combined = [stepsAnswer, currentWorkflow]
    .filter((item) => item.trim())
    .join(". ");

  const split = combined
    .split(/\n+|\. (?=[A-Z0-9])|, then | then | → | -> /i)
    .map((part) => part.trim())
    .filter(Boolean);

  return split.length > 0 ? split : [];
}

export function buildInternalHandoffJson(
  onboarding: OnboardingState,
  discovery: DiscoveryState,
  report: CompanyReportState,
) {
  const triggerAnswer = firstAnswer(discovery, ["trigger"]);
  const stepsAnswer = firstAnswer(discovery, ["steps"]);
  const handoffAnswer = firstAnswer(discovery, ["handoff"]);
  const inputsAnswer = firstAnswer(discovery, ["input", "document", "data_inputs"]);
  const decisionsAnswer = firstAnswer(discovery, ["decision", "human"]);
  const successAnswer = firstAnswer(discovery, ["success", "outcome"]);
  const tools = [...onboarding.selectedToolIds, ...onboarding.customTools.map((tool) => tool.name)];
  const missingInformation = [
    !onboarding.businessArea.trim() ? "Business area is missing." : "",
    !onboarding.repetitiveTask.trim() ? "Repetitive task is missing." : "",
    !onboarding.currentWorkflow.trim() ? "Current workflow summary is missing." : "",
    !triggerAnswer ? "Workflow trigger is still missing." : "",
    !stepsAnswer ? "Ordered workflow steps are still incomplete." : "",
    !inputsAnswer ? "Workflow inputs or required documents are still missing." : "",
    !decisionsAnswer ? "Human approval boundaries are still missing." : "",
    !tools.length ? "Workflow tools have not been confirmed yet." : "",
  ].filter(Boolean);
  const assumptions = [
    missingInformation.length > 0
      ? "Some workflow structure is inferred from partial onboarding and interview answers."
      : "",
    !onboarding.employeeCount.trim()
      ? "Team capacity and volume assumptions may change once employee count is confirmed."
      : "",
  ].filter(Boolean);
  const workflowSteps = orderedWorkflowSteps(onboarding.currentWorkflow, stepsAnswer);

  return {
    handoff_type: "discovery_findings",
    generated_at: "2026-07-30",
    raw_inputs: {
      company_name: DEMO_COMPANY.name,
      onboarding: {
        intro: onboarding.intro || null,
        organization_shape: onboarding.organizationShape,
        employee_count: onboarding.employeeCount || null,
        workflow_builder: onboarding.workflowBuilder,
        builder_access: onboarding.builderAccess,
        automation_scope: onboarding.automationScope,
        business_area: onboarding.businessArea || null,
        repetitive_task: onboarding.repetitiveTask || null,
        current_workflow: onboarding.currentWorkflow || null,
        selected_tools: onboarding.selectedToolIds,
        custom_tools: onboarding.customTools,
        employee_emails: onboarding.employeeEmails,
        approval_owner: onboarding.approvalOwner || null,
      },
      interview: {
        answered_count: Object.keys(discovery.answers).length,
        completed: discovery.completed,
        answers: discovery.answers,
        fact_ids: discovery.factIds,
      },
      report_meta: {
        version: report.version,
        status: report.status,
        stale: report.stale,
      },
    },
    structured_findings: {
      business_context: {
        company_name: DEMO_COMPANY.name,
        company_intro: onboarding.intro || null,
        organization_shape: onboarding.organizationShape,
        organization_label: teamLabel(onboarding.organizationShape),
        employee_count: onboarding.employeeCount || null,
        setup_ownership: builderLabelShort(onboarding.workflowBuilder),
        automation_scope: onboarding.automationScope || null,
        focus_area: onboarding.businessArea || null,
      },
      workflow_summary: {
        workflow_name: onboarding.repetitiveTask || null,
        current_workflow_summary: onboarding.currentWorkflow || null,
        trigger: triggerAnswer || null,
        inputs: inputsAnswer ? [inputsAnswer] : [],
        outputs: successAnswer ? [successAnswer] : [],
        handoffs: handoffAnswer ? [handoffAnswer] : [],
        tools,
        approval_owner: onboarding.approvalOwner || null,
        human_only_decisions: decisionsAnswer ? [decisionsAnswer] : [],
        success_outcomes: successAnswer ? [successAnswer] : [],
      },
      missing_information: missingInformation,
      assumptions,
      confidence: Math.max(0.35, Math.min(0.95, 1 - missingInformation.length * 0.08)),
    },
    workflow: {
      name: onboarding.repetitiveTask || "Unspecified workflow",
      focus_area: onboarding.businessArea || null,
      trigger: triggerAnswer || null,
      ordered_steps: workflowSteps,
      handoffs: handoffAnswer ? [handoffAnswer] : [],
      tools_involved: tools,
      inputs: inputsAnswer ? [inputsAnswer] : [],
      outputs: successAnswer ? [successAnswer] : [],
      approval_points: decisionsAnswer ? [decisionsAnswer] : [],
      failure_points: missingInformation,
      escalation_path: onboarding.approvalOwner ? [onboarding.approvalOwner] : [],
      frequency: null,
    },
  };
}

export function buildDynamicReportSections(
  onboarding: OnboardingState,
  discovery: DiscoveryState,
): ReportSectionDef[] {
  const intro = safeText(onboarding.intro, `${DEMO_COMPANY.name} is still gathering its business summary.`);
  const employeeCount = safeText(onboarding.employeeCount, "team size not yet specified");
  const area = safeText(onboarding.businessArea, "the selected business area");
  const task = safeText(onboarding.repetitiveTask, "the target workflow");
  const workflow = safeText(
    onboarding.currentWorkflow,
    "The current workflow has not been described yet, so Oriant is using the interview answers as the main source of process detail.",
  );
  const tools = [...onboarding.selectedToolIds, ...onboarding.customTools.map((tool) => tool.name)];
  const toolList = tools.length ? tools.join(", ") : "No tools have been selected yet";
  const triggerAnswer = firstAnswer(discovery, ["trigger"]);
  const stepsAnswer = firstAnswer(discovery, ["steps"]);
  const handoffAnswer = firstAnswer(discovery, ["handoff"]);
  const inputsAnswer = firstAnswer(discovery, ["input", "document", "data_inputs"]);
  const decisionsAnswer = firstAnswer(discovery, ["decision", "human"]);
  const successAnswer = firstAnswer(discovery, ["success", "outcome"]);

  const missingItems = [
    !onboarding.businessArea.trim() ? "A confirmed business area has not been captured yet." : "",
    !onboarding.repetitiveTask.trim() ? "The repetitive task to improve first is still missing." : "",
    !onboarding.currentWorkflow.trim() ? "A direct owner description of the current workflow is still missing." : "",
    !tools.length ? "The workflow tools have not been selected yet." : "",
    !inputsAnswer ? "The interview has not yet captured the exact inputs or documents needed each time." : "",
    !decisionsAnswer ? "The approval boundary for this workflow has not been fully captured yet." : "",
  ].filter(Boolean);

  const opportunities = listOrFallback(
    [
      task ? `Use Oriant to support ${task.toLowerCase()} with a clearer, step-based workflow.` : "",
      triggerAnswer ? `Use the trigger pattern already described: ${triggerAnswer}` : "",
      successAnswer ? `Optimise toward the stated success outcome: ${successAnswer}` : "",
      tools.length ? `Coordinate work across ${toolList} instead of replacing those tools.` : "",
    ].filter(Boolean),
    ["Continue discovery to identify the first automation candidate with stronger confidence."],
  );

  return [
    {
      id: "company-overview",
      title: "Company overview",
      body: [
        intro,
        `${DEMO_COMPANY.name} is currently set up as ${teamLabel(onboarding.organizationShape).toLowerCase()} with ${employeeCount}. The first workflow setup path is: ${builderLabel(onboarding.workflowBuilder).toLowerCase()}`,
      ],
      bullets: listOrFallback(
        [
          onboarding.approvalOwner ? `Approval owner: ${onboarding.approvalOwner}` : "",
          onboarding.employeeEmails.length ? `Team members invited or captured: ${onboarding.employeeEmails.join(", ")}` : "",
          onboarding.businessArea ? `Current focus area: ${onboarding.businessArea}` : "",
        ].filter(Boolean),
        ["Core business details are still being completed."],
      ),
      evidence: [
        { source: "Onboarding introduction", provenance: "owner_confirmed", quote: intro },
      ],
      confirmedFacts: 2,
      assumptions: 0,
    },
    {
      id: "team-structure",
      title: "Team structure",
      body: [
        `The organisation is currently described as ${teamLabel(onboarding.organizationShape).toLowerCase()}. Oriant will use that setup to decide whether the first workflow should stay owner-led or support a broader team handoff.`,
      ],
      bullets: listOrFallback(
        [
          onboarding.employeeCount ? `People involved: ${onboarding.employeeCount}` : "",
          onboarding.employeeEmails.length ? `Named team contacts: ${onboarding.employeeEmails.join(", ")}` : "",
          onboarding.approvalOwner ? `Sensitive approvals remain with: ${onboarding.approvalOwner}` : "",
        ].filter(Boolean),
        ["No extra team members have been captured yet beyond the owner path."],
      ),
      evidence: [
        { source: "Onboarding organisation setup", provenance: "owner_confirmed", quote: `Organisation type selected: ${teamLabel(onboarding.organizationShape)}` },
      ],
      confirmedFacts: onboarding.employeeCount || onboarding.employeeEmails.length ? 2 : 1,
      assumptions: onboarding.employeeCount || onboarding.employeeEmails.length ? 0 : 1,
    },
    {
      id: "current-processes",
      title: "Current processes",
      body: [
        workflow,
        stepsAnswer || "The interview has not yet captured a full start-to-finish workflow answer, so Oriant is still relying on the onboarding description above.",
      ],
      bullets: listOrFallback(
        [triggerAnswer, handoffAnswer, inputsAnswer].filter(Boolean),
        ["The current process still needs deeper step-by-step discovery."],
      ),
      evidence: evidenceOrFallback(
        [
          onboarding.currentWorkflow
            ? { source: "Onboarding workflow summary", provenance: "owner_confirmed" as const, quote: onboarding.currentWorkflow }
            : null,
          stepsAnswer
            ? { source: "Interview workflow steps", provenance: "owner_confirmed" as const, quote: stepsAnswer }
            : null,
        ].filter(Boolean) as ReportSectionDef["evidence"],
        [{ source: "Discovery status", provenance: "oriant_assumption", quote: "Current process detail is still incomplete." }],
      ),
      confirmedFacts: stepsAnswer ? 2 : onboarding.currentWorkflow ? 1 : 0,
      assumptions: stepsAnswer ? 0 : 2,
    },
    {
      id: "business-goals",
      title: "Business goals",
      body: [
        `The current goal is to improve ${area.toLowerCase()} by making ${task.toLowerCase()} easier to run and less manual.`,
        successAnswer || `Oriant will keep discovery focused on what a better outcome should look like for ${task.toLowerCase()}.`,
      ],
      bullets: listOrFallback(
        [
          onboarding.automationScope ? `How the owner wants to start: ${scopeLabel(onboarding.automationScope)}` : "",
          successAnswer || "",
        ].filter(Boolean),
        ["The target outcome still needs more definition."],
      ),
      evidence: [
        {
          source: successAnswer ? "Interview success outcome" : "Onboarding focus setup",
          provenance: successAnswer ? "owner_confirmed" : "owner_confirmed",
          quote: successAnswer || `Focus area: ${area}; task: ${task}`,
        },
      ],
      confirmedFacts: successAnswer || onboarding.businessArea ? 2 : 0,
      assumptions: successAnswer ? 0 : 1,
    },
    {
      id: "bottlenecks",
      title: "Bottlenecks",
      body: [
        `The main pressure point currently appears to be ${area.toLowerCase()}, especially around ${task.toLowerCase()}.`,
      ],
      bullets: listOrFallback(
        [triggerAnswer, handoffAnswer, stepsAnswer].filter(Boolean),
        ["The specific bottlenecks will become clearer once more interview answers are captured."],
      ),
      evidence: [
        {
          source: triggerAnswer ? "Interview trigger answer" : "Onboarding selection",
          provenance: triggerAnswer ? "owner_confirmed" : "owner_confirmed",
          quote: triggerAnswer || `The owner selected ${area} as the area to improve first.`,
        },
      ],
      confirmedFacts: triggerAnswer || handoffAnswer ? 2 : onboarding.businessArea ? 1 : 0,
      assumptions: triggerAnswer || handoffAnswer ? 0 : 1,
    },
    {
      id: "existing-systems",
      title: "Existing systems",
      body: [
        tools.length
          ? `${DEMO_COMPANY.name} currently expects this workflow to involve ${toolList}. Oriant should design around these systems rather than assuming a replacement project.`
          : "No workflow tools have been confirmed yet, so system recommendations are still provisional.",
      ],
      bullets: listOrFallback(tools.map((tool) => tool), ["No tools selected yet."]),
      evidence: [
        {
          source: "Onboarding tool selection",
          provenance: tools.length ? "selected_tool" : "oriant_assumption",
          quote: tools.length ? toolList : "No systems selected during onboarding yet.",
        },
      ],
      confirmedFacts: tools.length,
      assumptions: tools.length ? 0 : 1,
    },
    {
      id: "automation-preference",
      title: "Automation preference",
      body: [
        `${builderLabel(onboarding.workflowBuilder)} The chosen scope is ${scopeLabel(onboarding.automationScope).toLowerCase()}.`,
      ],
      bullets: listOrFallback(
        [
          onboarding.builderAccess === "workflows_only" ? "Invited builders should only be able to build workflows." : "",
          onboarding.builderAccess === "account_manager" ? "Invited builders can manage workflows plus account-level settings." : "",
        ].filter(Boolean),
        ["No extra builder access preferences captured yet."],
      ),
      evidence: [
        {
          source: "Onboarding setup ownership",
          provenance: "owner_confirmed",
          quote: `${builderLabel(onboarding.workflowBuilder)} Scope: ${scopeLabel(onboarding.automationScope)}.`,
        },
      ],
      confirmedFacts: onboarding.workflowBuilder || onboarding.automationScope ? 2 : 0,
      assumptions: 0,
    },
    {
      id: "approval-restrictions",
      title: "Approval restrictions",
      body: [
        decisionsAnswer || "The interview has not yet fully captured which decisions must always stay with a person.",
      ],
      bullets: listOrFallback(
        [
          onboarding.approvalOwner ? `Current approval owner: ${onboarding.approvalOwner}` : "",
          decisionsAnswer || "",
        ].filter(Boolean),
        ["Approval rules still need to be confirmed in the interview."],
      ),
      evidence: evidenceOrFallback(
        [
          decisionsAnswer
            ? { source: "Interview human decisions answer", provenance: "owner_confirmed" as const, quote: decisionsAnswer }
            : null,
          onboarding.approvalOwner
            ? { source: "Onboarding approval setup", provenance: "owner_confirmed" as const, quote: onboarding.approvalOwner }
            : null,
        ].filter(Boolean) as ReportSectionDef["evidence"],
        [{ source: "Discovery status", provenance: "oriant_assumption", quote: "Approval boundaries are still being gathered." }],
      ),
      confirmedFacts: decisionsAnswer || onboarding.approvalOwner ? 1 : 0,
      assumptions: decisionsAnswer ? 0 : 1,
    },
    {
      id: "assumptions",
      title: "Assumptions",
      body: [
        "These are the working assumptions Oriant is currently making because the onboarding or interview does not yet provide a confirmed answer.",
      ],
      bullets: listOrFallback(missingItems.slice(0, 3), ["No major assumptions are currently flagged."]),
      evidence: [
        {
          source: "Oriant analysis",
          provenance: "oriant_assumption",
          quote: "Any gap between onboarding and interview inputs is treated as an assumption until the owner confirms it.",
        },
      ],
      confirmedFacts: 0,
      assumptions: Math.max(1, missingItems.slice(0, 3).length),
    },
    {
      id: "missing-information",
      title: "Missing information",
      body: [
        "These items are still missing or incomplete. Planning can continue, but the output will be stronger once these are filled in.",
      ],
      bullets: listOrFallback(missingItems, ["No major missing-information items are currently flagged."]),
      evidence: [
        {
          source: "Current discovery coverage",
          provenance: missingItems.length ? "oriant_assumption" : "owner_confirmed",
          quote: missingItems.length
            ? "Some onboarding or interview details are still missing."
            : "Core onboarding and interview inputs have been captured.",
        },
      ],
      confirmedFacts: missingItems.length ? 0 : 1,
      assumptions: missingItems.length,
    },
    {
      id: "potential-opportunities",
      title: "Potential opportunities",
      body: [
        `Based on the captured findings so far, Oriant should start by improving ${task.toLowerCase()} inside ${area.toLowerCase()}.`,
      ],
      bullets: opportunities,
      evidence: [
        {
          source: successAnswer ? "Interview success answer" : "Onboarding prioritisation",
          provenance: successAnswer ? "owner_confirmed" : "owner_confirmed",
          quote: successAnswer || `Area: ${area}; task: ${task}`,
        },
      ],
      confirmedFacts: opportunities.length > 0 ? 2 : 0,
      assumptions: 0,
    },
  ];
}

export function buildDynamicReportFacts(
  onboarding: OnboardingState,
  discovery: DiscoveryState,
): ReportFactDef[] {
  const triggerAnswer = firstAnswer(discovery, ["trigger"]);
  const stepsAnswer = firstAnswer(discovery, ["steps"]);
  const handoffAnswer = firstAnswer(discovery, ["handoff"]);
  const inputsAnswer = firstAnswer(discovery, ["input", "document", "data_inputs"]);
  const decisionsAnswer = firstAnswer(discovery, ["decision", "human"]);
  const successAnswer = firstAnswer(discovery, ["success", "outcome"]);
  const tools = [...onboarding.selectedToolIds, ...onboarding.customTools.map((tool) => tool.name)];

  return [
    { id: "fact-company-intro", sectionId: "company-overview", label: "Business intro", value: safeText(onboarding.intro, "Business intro still missing"), source: detectSource(Boolean(onboarding.intro), "owner") },
    { id: "fact-company-org", sectionId: "company-overview", label: "Organisation shape", value: teamLabel(onboarding.organizationShape), source: "owner" },
    { id: "fact-company-team-size", sectionId: "company-overview", label: "People involved", value: safeText(onboarding.employeeCount, "Not specified"), source: detectSource(Boolean(onboarding.employeeCount), "owner") },

    { id: "fact-team-builder", sectionId: "team-structure", label: "Workflow builder", value: builderLabel(onboarding.workflowBuilder), source: detectSource(Boolean(onboarding.workflowBuilder), "owner") },
    { id: "fact-team-approver", sectionId: "team-structure", label: "Approval owner", value: safeText(onboarding.approvalOwner, "Not specified"), source: detectSource(Boolean(onboarding.approvalOwner), "owner") },

    { id: "fact-process-workflow", sectionId: "current-processes", label: "Current workflow", value: safeText(onboarding.currentWorkflow, "Not yet described"), source: detectSource(Boolean(onboarding.currentWorkflow), "owner") },
    { id: "fact-process-steps", sectionId: "current-processes", label: "Workflow steps", value: safeText(stepsAnswer, "Not yet answered"), source: detectSource(Boolean(stepsAnswer), "interview") },
    { id: "fact-process-inputs", sectionId: "current-processes", label: "Inputs and documents", value: safeText(inputsAnswer, "Not yet answered"), source: detectSource(Boolean(inputsAnswer), "interview") },

    { id: "fact-goal-scope", sectionId: "business-goals", label: "Start preference", value: scopeLabel(onboarding.automationScope), source: detectSource(Boolean(onboarding.automationScope), "owner") },
    { id: "fact-goal-success", sectionId: "business-goals", label: "Success outcome", value: safeText(successAnswer, "Not yet answered"), source: detectSource(Boolean(successAnswer), "interview") },

    { id: "fact-bottleneck-trigger", sectionId: "bottlenecks", label: "Workflow trigger", value: safeText(triggerAnswer, "Not yet answered"), source: detectSource(Boolean(triggerAnswer), "interview") },
    { id: "fact-bottleneck-handoffs", sectionId: "bottlenecks", label: "Handoffs or switches", value: safeText(handoffAnswer, "Not yet answered"), source: detectSource(Boolean(handoffAnswer), "interview") },

    { id: "fact-systems-tools", sectionId: "existing-systems", label: "Workflow tools", value: tools.length ? tools.join(", ") : "No tools selected yet", source: tools.length ? "owner" : "inference" },
    { id: "fact-pref-builder", sectionId: "automation-preference", label: "Ownership preference", value: builderLabel(onboarding.workflowBuilder), source: detectSource(Boolean(onboarding.workflowBuilder), "owner") },
    { id: "fact-pref-scope", sectionId: "automation-preference", label: "Automation scope", value: scopeLabel(onboarding.automationScope), source: detectSource(Boolean(onboarding.automationScope), "owner") },

    { id: "fact-approval-decisions", sectionId: "approval-restrictions", label: "Human-only decisions", value: safeText(decisionsAnswer, "Not yet answered"), source: detectSource(Boolean(decisionsAnswer), "interview") },
    { id: "fact-approval-owner", sectionId: "approval-restrictions", label: "Approval owner", value: safeText(onboarding.approvalOwner, "Not specified"), source: detectSource(Boolean(onboarding.approvalOwner), "owner") },

    { id: "fact-assumptions-gaps", sectionId: "assumptions", label: "Open assumptions", value: "Some discovery gaps are still being treated as assumptions until confirmed.", source: "inference" },
    { id: "fact-missing-info", sectionId: "missing-information", label: "Missing information status", value: "Some onboarding or interview details are still incomplete.", source: "inference" },

    { id: "fact-opportunity-task", sectionId: "potential-opportunities", label: "First workflow candidate", value: safeText(onboarding.repetitiveTask, "Not specified"), source: detectSource(Boolean(onboarding.repetitiveTask), "owner") },
    { id: "fact-opportunity-outcome", sectionId: "potential-opportunities", label: "Desired result", value: safeText(successAnswer, "Not yet answered"), source: detectSource(Boolean(successAnswer), "interview") },
  ];
}

export function factsBySection(facts: ReportFactDef[]): Record<ReportSectionId, ReportFactDef[]> {
  return facts.reduce<Record<ReportSectionId, ReportFactDef[]>>(
    (acc, fact) => {
      acc[fact.sectionId].push(fact);
      return acc;
    },
    {
      "company-overview": [],
      "lean-canvas-summary": [],
      "team-structure": [],
      "current-processes": [],
      "business-goals": [],
      bottlenecks: [],
      "existing-systems": [],
      "automation-preference": [],
      "approval-restrictions": [],
      assumptions: [],
      "missing-information": [],
      "potential-opportunities": [],
    },
  );
}
