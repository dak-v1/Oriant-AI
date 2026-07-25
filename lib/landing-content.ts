/**
 * landing-content.ts: every piece of copy and structured data for the
 * Oriant.ai marketing landing page (v2 editorial redesign).
 * Components import from here; keep copy edits in this one file.
 */

/* ── Navigation ─────────────────────────────────────────────────────────── */

export const NAV_LINKS = [
  { label: "Product", href: "#product" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Features", href: "#features" },
  { label: "Integrations", href: "#integrations" },
  { label: "FAQ", href: "#faq" },
  { label: "Contact", href: "#contact" },
] as const;

export const CTA = {
  primary: { label: "Start Free Discovery", href: "/app/onboarding" },
  secondary: { label: "See How It Works", href: "#how-it-works" },
  contact: { label: "Contact", href: "#contact" },
} as const;

/* ── Hero (brief §6) ────────────────────────────────────────────────────── */

export const HERO = {
  eyebrow: "AI operations, designed around your business",
  /** Rendered as two display lines. */
  headingLines: ["Your AI Operations Consultant", "for Growing Businesses"],
  subheadline:
    "Learn how your business works, identify the highest-value AI opportunities, and deploy a customised AI workforce that collaborates with your team, all without technical expertise.",
  supportingLine: "Discover. Plan. Approve. Deploy. Manage.",
} as const;

/** Orchestrator field: the layered hero artwork (brief §6.2). */
export type FieldNodeId =
  | "discovery"
  | "interview"
  | "planner"
  | "approval"
  | "executor"
  | "deployment"
  | "dashboard";

export const ORCHESTRATOR = {
  label: "Orchestrator",
  caption: "Coordinates every agent",
} as const;

export const FIELD_NODES: {
  id: FieldNodeId;
  label: string;
  annotation: string;
  /** true for the human node; must look visually distinct from agents */
  human?: boolean;
}[] = [
  { id: "discovery", label: "Discovery Agent", annotation: "Learns the business" },
  { id: "interview", label: "Interview Agent", annotation: "Fills the gaps by voice" },
  { id: "planner", label: "Planner Agent", annotation: "Designs the workforce" },
  { id: "approval", label: "Human Approval", annotation: "Owner review", human: true },
  { id: "executor", label: "Executor", annotation: "Carries out approved work" },
  { id: "deployment", label: "Deployment", annotation: "Ships agents safely" },
  { id: "dashboard", label: "Operations Dashboard", annotation: "One workspace" },
];

/* ── Product-video reveal (brief §7) ────────────────────────────────────── */

export const DEMO_VIDEO = {
  heading: "See how Oriant learns, plans, and deploys",
  body: "From the first discovery conversation to an approved AI workforce, Oriant keeps every recommendation understandable and every important decision under human control.",
  src: "/video/oriant-product-demo.mp4",
  /** Older drop location still honoured by the player's fallback chain. */
  legacySrc: "/videos/oriant-product-demo.mp4",
  poster: "/video/product-demo-poster.jpg",
  title: "Oriant.ai product walkthrough: discovery to deployed AI workforce",
  /** Shown to all users while no demo video file exists (see public/video/README.txt). */
  fallbackNote: "Product walkthrough coming soon.",
} as const;

/* ── Manifesto & principles (brief §9) ──────────────────────────────────── */

export const MANIFESTO = {
  lines: [
    "Most businesses do not need more AI tools.",
    "They need a clear way to understand where AI belongs, how it should work, and when a person should stay in control.",
  ],
  principles: [
    { numeral: "01", keyword: "Discovery", caption: "One guided business discovery" },
    { numeral: "02", keyword: "Planning tiers", caption: "Two levels of workforce planning" },
    { numeral: "✓", keyword: "Human-controlled", caption: "Human approval before critical actions" },
    { numeral: "1", keyword: "One workspace", caption: "One workspace to manage the workforce" },
  ],
} as const;

/* ── Problems → solution (brief §17) ────────────────────────────────────── */

export const PROBLEMS = {
  headingLines: [
    "Growing businesses know AI matters.",
    "Most still do not know where to begin.",
  ],
  items: [
    "They do not know which processes are worth automating.",
    "They do not know which agent or model fits each task.",
    "They cannot spend weeks building workflows.",
    "They need employees to remain in control of sensitive decisions.",
    "They struggle to manage disconnected AI tools.",
  ],
} as const;

export const SOLUTION = {
  heading: "Oriant turns business knowledge into an approved AI workforce plan.",
  items: [
    "Guided business discovery through voice or chat",
    "Automatic workflow recommendations",
    "Tier 1 preset agents",
    "Tier 2 custom agents",
    "Plain-language explanations",
    "Editable plans",
    "Human approval gates",
    "Safe deployment",
    "One operations workspace",
    "Approvals through messaging tools",
  ],
} as const;

/* ── Stage-based scroll narrative (brief §10) ───────────────────────────── */

export const STAGES_SECTION = {
  eyebrow: "How Oriant works",
  heading: "From business context to a working AI workforce",
} as const;

export type StageId =
  | "discover"
  | "plan"
  | "approve"
  | "build"
  | "deploy"
  | "manage"
  | "connected";

export const STAGES: {
  id: StageId;
  n: string;
  title: string;
  body: string;
}[] = [
  {
    id: "discover",
    n: "01",
    title: "Discover",
    body: "A guided Lean Canvas, chat, or voice conversation captures how your business actually runs.",
  },
  {
    id: "plan",
    n: "02",
    title: "Plan",
    body: "Tier 1 preset agents and Tier 2 custom agents are arranged into a customised workforce plan.",
  },
  {
    id: "approve",
    n: "03",
    title: "Approve",
    body: "You review the reasoning, edit the plan, and decide which actions stay human-controlled.",
  },
  {
    id: "build",
    n: "04",
    title: "Build",
    body: "Your approved plan becomes generated configuration, and each agent is connected to your tools with owner-approved access.",
  },
  {
    id: "deploy",
    n: "05",
    title: "Deploy",
    body: "Each agent package launches inside a secure, isolated execution environment.",
  },
  {
    id: "manage",
    n: "06",
    title: "Manage",
    body: "Activity, approvals, and scheduling come together in one operations workspace.",
  },
  {
    id: "connected",
    n: "07",
    title: "Stay Connected",
    body: "Approval requests reach you in WhatsApp, Telegram, email, or the Oriant workspace.",
  },
];

/* ── Build stage detail (spec §3.1) ─────────────────────────────────────── */

/** Everything the Build stage visual shows: the approved plan entering,
 *  the generated configuration outputs, the owner-approved tool
 *  connections, and the five-step build sequence. */
export const BUILD_STAGE = {
  input: "Approved plan",
  outputsTitle: "Generated configuration",
  outputs: [
    "Agent instructions",
    "Workflow configuration",
    "Approval policy",
    "Test cases",
  ],
  connectTitle: "Connect tools",
  connectNote: "You approve every connection",
  /** Icon ids resolve in the component; labels stay plain language. */
  tools: [
    { id: "email", label: "Email" },
    { id: "calendar", label: "Calendar" },
    { id: "crm", label: "CRM" },
    { id: "accounting", label: "Accounting" },
    { id: "storage", label: "Storage" },
    { id: "messaging", label: "Messaging" },
    { id: "mcp", label: "MCP connection" },
  ],
  /** Rendered with icon arrows between steps; the copy itself has none. */
  sequence: [
    "Generate configuration",
    "Connect tools",
    "Validate permissions",
    "Test in sandbox",
    "Ready for activation",
  ],
} as const;

/* ── Capability composition (brief §11) ─────────────────────────────────── */

export const CAPABILITIES_SECTION = {
  eyebrow: "Platform",
  heading: "One operating layer for your AI workforce",
} as const;

export type CapabilityRole =
  | "large"    /* 2-column feature card       */
  | "tall"     /* tall vertical card          */
  | "medium"   /* standard card (×2)          */
  | "wide"     /* horizontal full-width card  */
  | "compact"; /* small animated card         */

export const CAPABILITIES: {
  id: string;
  role: CapabilityRole;
  title: string;
  body: string;
}[] = [
  {
    id: "discovery",
    role: "large",
    title: "AI Business Discovery",
    body: "Learn how your business really works through a guided chat or voice conversation that becomes a structured company report.",
  },
  {
    id: "planning",
    role: "tall",
    title: "AI Workforce Planning",
    body: "Preset and custom agents snap into a clear workflow designed around your highest-value opportunities.",
  },
  {
    id: "approvals",
    role: "medium",
    title: "Human-in-the-Loop Approvals",
    body: "Review, edit, and approve sensitive actions before anything moves forward.",
  },
  {
    id: "deployment",
    role: "medium",
    title: "AI Workforce Deployment",
    body: "Approved agents move through validation into production without you writing workflow code.",
  },
  {
    id: "dashboard",
    role: "wide",
    title: "AI Operations Dashboard",
    body: "Tasks, approvals, schedules, and agent activity live in one operations workspace.",
  },
  {
    id: "channels",
    role: "compact",
    title: "Multi-Channel Approvals",
    body: "Approve from WhatsApp, Telegram, email, or the Oriant workspace.",
  },
  {
    id: "improve",
    role: "compact",
    title: "Agents that improve",
    body: "Every reviewed run sharpens future recommendations, with you in the loop.",
  },
];

/* ── Three-row connected-platform marquee (brief §12) ───────────────────── */

export const MARQUEE_SECTION = {
  eyebrow: "Integrations",
  heading: "Designed to connect with the tools already running your business",
  disclaimer:
    "Designed to connect with the platforms below. Availability depends on the integration and account configuration.",
} as const;

export const MARQUEE_ROWS: { direction: "left" | "right"; tools: string[] }[] = [
  {
    direction: "left",
    tools: ["Gmail", "Google Calendar", "Slack", "Microsoft Teams", "WhatsApp", "Telegram"],
  },
  {
    direction: "right",
    tools: ["Shopify", "Stripe", "HubSpot", "Salesforce", "Xero", "QuickBooks"],
  },
  {
    direction: "left",
    tools: ["Notion", "Google Drive", "Dropbox", "Airtable", "Trello", "Asana"],
  },
];

/* ── Workflow showcases (brief §13) ─────────────────────────────────────── */

export const SHOWCASES_SECTION = {
  eyebrow: "Workflow showcases",
  heading: "What an approved AI workforce looks like in practice",
} as const;

/** One structured workflow step (spec §3.3). `kind` drives styling and the
 *  walk-through animation; `human` steps are where the walk pauses. */
export type ShowcaseStepKind = "trigger" | "agent" | "human" | "tool" | "outcome";

export type ShowcaseStep = {
  kind: ShowcaseStepKind;
  /** Fixed structural label: Trigger / Agent action / Human check /
   *  Connected tool / Outcome. */
  label: string;
  /** Plain-language detail for this showcase. */
  detail: string;
  /** Icon id resolved in the component (operational icons only). */
  icon: "inbox" | "file" | "calendar" | "pen" | "search" | "user" | "plug" | "check";
};

export const SHOWCASES: {
  id: string;
  category: string;
  title: string;
  problem: string;
  steps: ShowcaseStep[];
  /** presentation surface for the showcase panel */
  theme: "light" | "dark";
}[] = [
  {
    id: "customer",
    category: "Customer operations",
    title: "From repeated questions to an approved support workflow",
    problem:
      "The same order questions arrive every day, and exceptions still need a person's judgement.",
    steps: [
      {
        kind: "trigger",
        label: "Trigger",
        detail: "A customer email about an order arrives in the inbox.",
        icon: "inbox",
      },
      {
        kind: "agent",
        label: "Agent action",
        detail: "The Support Agent checks the order and drafts a reply.",
        icon: "pen",
      },
      {
        kind: "human",
        label: "Human check",
        detail: "Refunds and policy exceptions wait for your sign-off.",
        icon: "user",
      },
      {
        kind: "tool",
        label: "Connected tool",
        detail: "Gmail and Shopify, connected with owner approval.",
        icon: "plug",
      },
      {
        kind: "outcome",
        label: "Outcome",
        detail: "Routine replies go out; only the judgement calls reach you.",
        icon: "check",
      },
    ],
    theme: "light",
  },
  {
    id: "finance",
    category: "Finance operations",
    title: "From invoice documents to review-ready payment tasks",
    problem:
      "Invoices pile up in inboxes and every one is retyped before it can be paid.",
    steps: [
      {
        kind: "trigger",
        label: "Trigger",
        detail: "An invoice document lands in the finance inbox.",
        icon: "file",
      },
      {
        kind: "agent",
        label: "Agent action",
        detail: "The Document Agent extracts the vendor, amount, and due date.",
        icon: "search",
      },
      {
        kind: "human",
        label: "Human check",
        detail: "Your finance approver reviews every payment task before it moves.",
        icon: "user",
      },
      {
        kind: "tool",
        label: "Connected tool",
        detail: "Gmail and Xero, connected with owner approval.",
        icon: "plug",
      },
      {
        kind: "outcome",
        label: "Outcome",
        detail: "Invoices become review-ready payment tasks; nothing is paid unapproved.",
        icon: "check",
      },
    ],
    theme: "dark",
  },
  {
    id: "marketing",
    category: "Marketing operations",
    title: "From campaign planning to scheduled, approved content",
    problem:
      "Campaign ideas stall because research, drafting, and brand review all compete for the same week.",
    steps: [
      {
        kind: "trigger",
        label: "Trigger",
        detail: "A weekly content slot opens on the calendar.",
        icon: "calendar",
      },
      {
        kind: "agent",
        label: "Agent action",
        detail: "The Content Agent drafts the post from your brand brief.",
        icon: "pen",
      },
      {
        kind: "human",
        label: "Human check",
        detail: "Nothing is scheduled until you approve the final content.",
        icon: "user",
      },
      {
        kind: "tool",
        label: "Connected tool",
        detail: "Notion and Slack, connected with owner approval.",
        icon: "plug",
      },
      {
        kind: "outcome",
        label: "Outcome",
        detail: "A steady pipeline of approved, scheduled content.",
        icon: "check",
      },
    ],
    theme: "light",
  },
];

/* ── Human-in-the-loop approvals (brief §14) ────────────────────────────── */

export const APPROVALS_SECTION = {
  eyebrow: "Human control",
  headingLines: ["Your agents can move fast.", "You still make the important calls."],
  body: "Approval requests carry their full context to wherever you work. Review, comment, and approve from the queue, your calendar, WhatsApp, Telegram, or email.",
  /** Status labels; never communicated by colour alone (brief §14). */
  states: [
    { id: "pending", label: "Pending" },
    { id: "approved", label: "Approved" },
    { id: "review", label: "Review requested" },
  ],
} as const;

/* ── Continuous improvement (brief §15) ─────────────────────────────────── */

export const IMPROVEMENT = {
  eyebrow: "Continuous improvement",
  heading: "Agents that improve through every reviewed run",
  body: "Oriant uses completed tasks, owner edits, approval outcomes, failures, escalations, and operational context to recommend improvements. Nothing important changes without your review and approval.",
  loop: ["Run", "Observe", "Recommend", "Review", "Approve", "Improve"],
  note: "Approved improvements are marked in teal: every one of them passed a human review.",
} as const;

/* ── FAQ (brief §18) ────────────────────────────────────────────────────── */

export const FAQS = [
  {
    q: "What does Oriant.ai do?",
    a: "Oriant learns how your business works, identifies the highest-value AI opportunities, plans a customised AI workforce, and helps you review, deploy, and manage it, with human approval built in.",
  },
  {
    q: "Do I need technical knowledge?",
    a: "No. Oriant explains every recommendation in plain language and guides the setup. You never design workflows or write code.",
  },
  {
    q: "How does Oriant learn about my business?",
    a: "Through a guided discovery: a voice or chat conversation, an optional Lean Canvas, and structured company information become an editable company report you approve.",
  },
  {
    q: "What is the difference between preset and custom agents?",
    a: "Tier 1 preset agents cover common workflows and are configured to your business in minutes. Tier 2 custom agents are designed through a short guided interview for work no preset covers.",
  },
  {
    q: "Can I edit the recommended workflow?",
    a: "Yes. The company report, workforce plan, agent settings, and approval rules are all editable, and nothing proceeds until you approve it.",
  },
  {
    q: "Can an agent perform an important action without my approval?",
    a: "Sensitive or high-impact actions can be configured to require human approval. You choose exactly where those approval boundaries sit.",
  },
  {
    q: "Which business tools can Oriant connect to?",
    a: "Oriant is designed around common communication, commerce, finance, CRM, productivity, and calendar platforms. Availability depends on the integration and account configuration.",
  },
  {
    q: "How long does initial setup take?",
    a: "Your first workforce plan follows directly from a single guided discovery session. How quickly agents go live then depends on which workflows you approve.",
  },
  {
    q: "Can I approve tasks through WhatsApp or Telegram?",
    a: "Yes. Oriant is designed to deliver approval requests through WhatsApp, Telegram, and email as well as the Oriant workspace, with the full context attached.",
  },
  {
    q: "What happens when an agent fails?",
    a: "Failures are logged and surfaced with their context, and your escalation rules decide who is notified. Agents do not retry sensitive actions without a person reviewing what happened.",
  },
] as const;

/* ── Final CTA (brief §19) ──────────────────────────────────────────────── */

export const FINAL_CTA = {
  headingLines: [
    "Turn how your business works",
    "into a workforce that works with you.",
  ],
  body: "Start with a guided discovery. Oriant will identify the strongest AI opportunities, create a workforce plan, and keep you in control of every important decision.",
  secondary: { label: "Contact Us", href: "#contact" },
} as const;

/* ── Footer (brief §20) ─────────────────────────────────────────────────── */

export const FOOTER = {
  descriptor:
    "Oriant.ai: AI operations planning and workforce management for growing businesses.",
  contactNote:
    "Start a free discovery and receive a clear first plan for where AI can create the most value.",
  /** Single subtle sponsor note (spec §3.4); the Tech Stack section is gone. */
  attribution:
    "Built with support from AI&, Doubleword, Daytona, and Nosana.",
  productLinks: [
    { label: "Product", href: "#product" },
    { label: "How It Works", href: "#how-it-works" },
    { label: "Features", href: "#features" },
    { label: "Integrations", href: "#integrations" },
    { label: "FAQ", href: "#faq" },
  ],
  companyLinks: [
    { label: "Contact", href: "#contact" },
    { label: "Privacy", href: "/privacy" },
    { label: "Terms", href: "/terms" },
  ],
} as const;
