/**
 * landing-content.ts — every piece of copy and structured data for the
 * Oriant.ai marketing landing page, verbatim from the master brief.
 * Components import from here; keep copy edits in this one file.
 */

/* ── Navigation ─────────────────────────────────────────────────────────── */

export const NAV_LINKS = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Features", href: "#features" },
  { label: "Integrations", href: "#integrations" },
  { label: "Approvals", href: "#approvals" },
  { label: "FAQ", href: "#faq" },
] as const;

export const CTA = {
  primary: { label: "Start Free Discovery", href: "/onboarding" },
  secondary: { label: "See How It Works", href: "#how-it-works" },
  contact: { label: "Contact", href: "#contact" },
} as const;

/* ── Hero (§7.1) ────────────────────────────────────────────────────────── */

export const HERO = {
  eyebrow: "AI operations, designed around your business",
  heading: "Your AI Operations Consultant for Growing Businesses",
  subheadline:
    "Learn how your business works, identify the highest-value AI opportunities, and deploy a customised AI workforce that collaborates with your team—all without technical expertise.",
  microcopy: "No code. No workflow expertise. Human approval stays in your hands.",
} as const;

export type WorkflowNodeId =
  | "discovery"
  | "planner"
  | "approval"
  | "deployment"
  | "dashboard";

export const WORKFLOW_NODES: {
  id: WorkflowNodeId;
  label: string;
  status: string;
  description: string;
}[] = [
  {
    id: "discovery",
    label: "Discovery",
    status: "Listening",
    description:
      "Learns how your business runs through a guided chat, voice, or structured company profile.",
  },
  {
    id: "planner",
    label: "Planner",
    status: "Designing",
    description:
      "Turns business context into a customised workforce of preset and custom AI agents.",
  },
  {
    id: "approval",
    label: "Approval",
    status: "Awaiting you",
    description:
      "Every important decision waits for your explicit review and sign-off.",
  },
  {
    id: "deployment",
    label: "Deployment",
    status: "Launching",
    description:
      "Approved agents launch safely — without you writing any workflow code.",
  },
  {
    id: "dashboard",
    label: "Dashboard",
    status: "Reporting",
    description:
      "Activity, approvals, and outcomes tracked from one operations workspace.",
  },
];

export const ORCHESTRATOR_LABEL = "Orchestrator";

/* ── Connected-platform marquee (§7.2) ──────────────────────────────────── */

export const MARQUEE = {
  heading: "Designed to work with the tools already running your business.",
  tools: [
    "Gmail",
    "Google Calendar",
    "Slack",
    "Notion",
    "Shopify",
    "HubSpot",
    "WhatsApp",
    "Telegram",
    "Xero",
    "QuickBooks",
  ],
} as const;

/* ── Product walkthrough video (§7.3) ───────────────────────────────────── */

export const DEMO_VIDEO = {
  label: "See Oriant.ai in action",
  heading: "From business discovery to a working AI workforce.",
  body: "Follow the full journey: describe your business, review the recommended workflow, approve each agent, and manage the result from one workspace.",
  src: "/videos/oriant-product-demo.mp4",
  poster: "/images/oriant-demo-poster.webp",
  fallbackNote:
    "Add oriant-product-demo.mp4 to /public/videos to replace this preview.",
} as const;

/* ── Problem and solution (§7.4) ────────────────────────────────────────── */

export const PROBLEM = {
  heading: "AI has potential. Growing businesses are still left guessing.",
  cards: [
    {
      title: "No clear starting point",
      body: "Business owners know AI matters, but cannot tell which process is worth automating first.",
    },
    {
      title: "Tools without an operating plan",
      body: "Most automation products expect the user to design workflows before the business problem is fully understood.",
    },
    {
      title: "Automation without enough control",
      body: "Owners need approvals, context, and clear boundaries before software can act on their behalf.",
    },
    {
      title: "More software, more complexity",
      body: "Adding disconnected tools can increase operational overhead instead of reducing it.",
    },
  ],
} as const;

export const SOLUTION = {
  statement: "Oriant.ai starts with the business, not the tool.",
  points: [
    "Guided business discovery through voice, chat, or structured company information.",
    "Automatic workflow recommendations explained in plain language.",
    "Human review before important decisions or deployments.",
    "No-code setup for commonly used agents, with deeper guided configuration for custom agents.",
  ],
} as const;

/* ── How it works — scroll narrative (§7.5) ─────────────────────────────── */

export const JOURNEY_STEPS = [
  {
    n: "01",
    title: "Discover",
    body: "Explain how your business works through a guided Lean Canvas, chat, or voice conversation.",
  },
  {
    n: "02",
    title: "Plan",
    body: "Oriant.ai identifies the highest-value opportunities and designs a customised AI workforce.",
  },
  {
    n: "03",
    title: "Approve",
    body: "Review the reasoning, edit the plan, and decide which actions must remain human-controlled.",
  },
  {
    n: "04",
    title: "Deploy",
    body: "Launch approved AI workers safely without building the workflows yourself.",
  },
  {
    n: "05",
    title: "Manage",
    body: "Track activity, approvals, outcomes, and agent status from one operations dashboard.",
  },
  {
    n: "06",
    title: "Stay Connected",
    body: "Receive approval requests in WhatsApp, Telegram, email, or the Oriant.ai workspace.",
  },
] as const;

/* ── Feature bento grid (§7.6) ──────────────────────────────────────────── */

export const FEATURES = {
  heading: "One operating system for your AI workforce.",
  cards: [
    {
      id: "discovery",
      title: "AI Business Discovery",
      body: "Learn how your business really works through a guided chat or voice conversation.",
    },
    {
      id: "planning",
      title: "AI Workforce Planning",
      body: "Turn business context into a clear workflow of preset and custom AI agents.",
    },
    {
      id: "approvals",
      title: "Human-in-the-Loop Approvals",
      body: "Stay in control of sensitive actions, edits, and deployment decisions.",
    },
    {
      id: "deployment",
      title: "AI Workforce Deployment",
      body: "Deploy approved AI workers safely without writing workflow code.",
    },
    {
      id: "dashboard",
      title: "AI Operations Dashboard",
      body: "Manage tasks, approvals, schedules, and agent activity from one place.",
    },
    {
      id: "channels",
      title: "Multi-Channel Approvals",
      body: "Review and approve from WhatsApp, Telegram, email, or the Oriant.ai workspace.",
    },
  ],
} as const;

/* ── Human control & messaging approvals (§7.7) ─────────────────────────── */

export const APPROVALS_SECTION = {
  eyebrow: "Human control, wherever you work",
  heading: "Stay in control without living in another dashboard.",
  body: "Choose where approval requests reach you. Review the context, leave feedback, approve, or reject from WhatsApp, Telegram, email, or Oriant.ai.",
  supporting:
    "Every important action keeps an approval trail, decision history, and clear owner.",
  cta: { label: "See approval workflow", href: "#approvals" },
} as const;

/* ── Learning & continuous improvement (§7.8) ───────────────────────────── */

export const LEARNING = {
  heading: "Build agents that get better with every reviewed run.",
  body: "Oriant.ai uses edits, approvals, outcomes, and recurring exceptions to improve future recommendations—while keeping people responsible for the final decision.",
  proofPoints: [
    "Auditable run history",
    "Versioned configurations",
    "Human feedback",
    "Clear escalation rules",
  ],
  loop: ["Draft", "Review", "Run", "Learn", "Improved draft"],
} as const;

/* ── Integration ecosystem (§7.9) ───────────────────────────────────────── */

export const INTEGRATIONS = {
  heading: "Your AI workforce should fit your business—not replace your stack.",
  disclaimer: "Designed to connect with the tools below. Availability depends on the integration and account configuration.",
  groups: [
    { name: "Communication", tools: ["WhatsApp", "Telegram", "Slack", "Gmail"] },
    { name: "Productivity", tools: ["Notion", "Google Drive", "Microsoft 365"] },
    { name: "CRM & Sales", tools: ["HubSpot", "Salesforce"] },
    { name: "Commerce", tools: ["Shopify", "WooCommerce"] },
    { name: "Finance", tools: ["Xero", "QuickBooks"] },
    { name: "Calendar", tools: ["Google Calendar", "Microsoft Outlook"] },
  ],
} as const;

/* ── FAQ (§7.10) ────────────────────────────────────────────────────────── */

export const FAQS = [
  {
    q: "What is Oriant.ai?",
    a: "Oriant.ai is an AI operations consultant that learns how a business works, recommends a practical AI workforce, and helps the owner review, deploy, and manage it.",
  },
  {
    q: "Do I need technical experience?",
    a: "No. Oriant.ai explains recommendations in plain language and guides the setup instead of asking you to design workflows from scratch.",
  },
  {
    q: "Can I edit the recommendations?",
    a: "Yes. Business reports, workflows, agent settings, and approval rules are reviewed by the user before they move forward.",
  },
  {
    q: "Does Oriant.ai act without permission?",
    a: "Sensitive or high-impact actions can be configured to require human approval. The owner chooses where those approval boundaries sit.",
  },
  {
    q: "Can approvals reach me outside the dashboard?",
    a: "The product is designed to notify users through channels such as WhatsApp, Telegram, and email, as well as inside Oriant.ai.",
  },
  {
    q: "What tools can Oriant.ai connect to?",
    a: "Oriant.ai is designed around common communication, productivity, commerce, finance, CRM, and calendar tools. Availability depends on the integration and account configuration.",
  },
] as const;

/* ── Final CTA & footer (§7.11) ─────────────────────────────────────────── */

export const FINAL_CTA = {
  heading: "Start with how your business already works.",
  body: "Complete a guided discovery and receive a clear first plan for where AI can create the most value.",
  secondary: { label: "Contact us", href: "#contact" },
} as const;

export const FOOTER = {
  descriptor:
    "Oriant.ai — AI operations planning and workforce management for growing businesses.",
  contactNote:
    "Start a free discovery and receive a clear first plan for where AI can create the most value.",
  links: [
    { label: "How it works", href: "#how-it-works" },
    { label: "Features", href: "#features" },
    { label: "Integrations", href: "#integrations" },
    { label: "Approvals", href: "#approvals" },
    { label: "FAQ", href: "#faq" },
    { label: "Privacy", href: "/privacy" },
    { label: "Terms", href: "/terms" },
    { label: "Contact", href: "#contact" },
  ],
} as const;
