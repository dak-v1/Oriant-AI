/**
 * Guided conversation scripts — ported verbatim from the design.
 * The kickoff call (Phase 1) and the custom-agent design call (Tier 2).
 */

export type CallCardType = "textarea" | "goals" | "systems" | "canvas-intro" | "canvas-q" | "text";

export interface CallCard {
  id: string;
  chap: string;
  short: string;
  q: string;
  type: CallCardType;
  ph?: string;
  sample?: string;
  options?: string[];
}

export const CALL_CARDS: CallCard[] = [
  { id: "profile", chap: "The basics", short: "The shop in one line", q: "Hey — thanks for making the time. So I get this right: tell me about the shop. What do you sell, and who's buying it?", type: "textarea", ph: "Talk to me like a friend…", sample: "We're a small-batch coffee roaster — single-origin beans and subscriptions, mostly online, plus a little wholesale to cafes." },
  { id: "goals", chap: "The basics", short: "What to improve", q: "Love that. And if you could wave a wand — what's the one thing you most want off your plate?", type: "goals" },
  { id: "systems", chap: "The basics", short: "Your tools", q: "Makes sense. Which tools are you running day to day? I'll plug into whatever you've already got.", type: "systems" },
  { id: "lc_intro", chap: "Lean Canvas", short: "Lean Canvas", q: "Okay — now I want to map how the whole thing hangs together, like a Lean Canvas. If you've already got one, upload it and I'll read it. Otherwise let's build it together, one piece at a time.", type: "canvas-intro" },
  { id: "lc_problem", chap: "Lean Canvas", short: "Problem", q: "Let's start here: what problem are you really solving for people?", type: "canvas-q", sample: "Fresh, genuinely good coffee is a hassle to keep stocked, and most subscriptions are rigid." },
  { id: "lc_segments", chap: "Lean Canvas", short: "Customers", q: "And who feels that most — who are your customers?", type: "canvas-q", sample: "Home specialty-coffee drinkers, subscription regulars, and independent cafes buying wholesale." },
  { id: "lc_uvp", chap: "Lean Canvas", short: "Unique value", q: "If a friend asked why you and not the shop down the road, what would you say?", type: "canvas-q", sample: "Single-origin roasted to order, on a subscription that bends to your schedule." },
  { id: "lc_solution", chap: "Lean Canvas", short: "Solution", q: "How do you actually deliver that today?", type: "canvas-q", sample: "A DTC storefront, flexible subscriptions, and a small hands-on wholesale program." },
  { id: "lc_channels", chap: "Lean Canvas", short: "Channels", q: "Where do people usually find you?", type: "canvas-q", sample: "Our Shopify store, Instagram, email, and word of mouth between cafes." },
  { id: "lc_revenue", chap: "Lean Canvas", short: "Revenue", q: "And how does the money come in?", type: "canvas-q", sample: "One-off bags, recurring subscriptions, and wholesale invoices." },
  { id: "lc_cost", chap: "Lean Canvas", short: "Costs", q: "What are the big costs on the other side of that?", type: "canvas-q", sample: "Green beans, packaging, shipping, fulfillment, and a 12-person team." },
  { id: "lc_metrics", chap: "Lean Canvas", short: "Key metrics", q: "What numbers do you actually keep an eye on?", type: "canvas-q", sample: "MRR, subscriber churn, first-response time, and stockout days." },
  { id: "lc_advantage", chap: "Lean Canvas", short: "Edge", q: "Last one for the canvas — what's genuinely hard for a competitor to copy?", type: "canvas-q", sample: "Direct importer relationships and a loyal, vocal subscriber base." },
  { id: "ops", chap: "Operations", short: "Weekly work", q: "That's a great picture. Now the day-to-day — walk me through the work that repeats every single week.", type: "textarea", ph: "The busywork…", sample: "Answering order-status questions, changing subscriptions, replying to wholesale emails, reordering beans, and posting review replies." },
  { id: "constraints", chap: "Operations", short: "Guardrails", q: "And where do you want a firm hand on the wheel — anything I should never touch, or that always needs your sign-off?", type: "textarea", ph: "The guardrails…", sample: "Never touch banking. Refunds, reorders and wholesale pricing always need my approval." },
  { id: "volume", chap: "Clarify", short: "Follow-up", q: "Okay — I think I've got the shape of it now. Just a few things to pin down. You mentioned a lot of support: roughly how many messages land in a normal week?", type: "text", options: ["Under 100 a week", "Around 300 a week", "500+ around a drop"], sample: "Around 300 a week, spiking to 500 around a drop." },
  { id: "autosend", chap: "Clarify", short: "Follow-up", q: "Of those, which can an agent just answer on its own, and which should it only draft for you?", type: "textarea", ph: "Auto vs draft…", sample: "Order status and grind questions it can send. Refunds or anything upset — draft only, I'll approve." },
  { id: "wholesale", chap: "Clarify", short: "Follow-up", q: "And that wholesale side you mentioned — when a lead comes in, what happens today, and who owns it?", type: "textarea", ph: "The wholesale flow…", sample: "A cafe emails or DMs, and it sits in my inbox for days. I want it qualified and priced fast." },
];

/** Prefilled Lean Canvas fields when the owner uploads an existing canvas. */
export const LC_UPLOAD_DATA: Record<string, string> = {
  lc_problem: "Fresh, genuinely good coffee is a hassle to keep stocked, and most subscriptions are rigid.",
  lc_segments: "Home specialty-coffee drinkers, subscription regulars, and independent cafes.",
  lc_uvp: "Single-origin roasted to order, on a subscription that bends to your schedule.",
  lc_solution: "DTC storefront, flexible subscriptions, and a small wholesale program.",
  lc_channels: "Shopify store, Instagram, email, and word of mouth.",
  lc_revenue: "One-off bags, recurring subscriptions, and wholesale invoices.",
  lc_cost: "Green beans, packaging, shipping, fulfillment, and a 12-person team.",
  lc_metrics: "MRR, churn, first-response time, and stockout days.",
  lc_advantage: "Direct importer relationships and a loyal subscriber base.",
};

export const DEFAULT_GOALS: Record<string, boolean> = {
  "Response time": true, "Support capacity": true, "Fewer stockouts": true,
  "Reviews & reputation": false, "Wholesale growth": true, "Weekly reporting": false,
};

export const DEFAULT_SYSTEMS: Record<string, boolean> = {
  Shopify: true, Recharge: true, Gorgias: true, Gmail: true,
  Instagram: false, "Google Sheets": true, QuickBooks: false, Slack: false,
};

export interface DesignCard {
  id: string;
  short: string;
  q: string;
  type: "textarea" | "materials";
  ph: string;
  sample: string;
}

export const DESIGN_CARDS: DesignCard[] = [
  { id: "objective", short: "Objective", q: "What result should this agent produce, from start to finish?", type: "textarea", ph: "The outcome…", sample: "Qualify inbound wholesale leads, send the right pricing tier, and book a call — or escalate if it's out of policy." },
  { id: "trigger", short: "Trigger", q: "What event kicks this work off?", type: "textarea", ph: "The trigger…", sample: "A cafe emails or DMs us asking about buying wholesale." },
  { id: "inputs", short: "Inputs & materials", q: "What information or documents will it need to do the job? Attach anything it should rely on.", type: "materials", ph: "What it needs to read…", sample: "Our wholesale price list, the minimum-order policy, and the lead's original message." },
  { id: "rules", short: "Decision rules", q: "What rules decide the next step, or an exception?", type: "textarea", ph: "The logic…", sample: "Score on volume and region; anything over 200kg/month or outside our area routes to me." },
  { id: "tools", short: "Tools & permissions", q: "What may it read, create or send on your behalf?", type: "textarea", ph: "Its reach…", sample: "Read Gmail, draft replies, create a HubSpot deal, and propose a call slot." },
  { id: "forbidden", short: "Forbidden actions", q: "What must it never do without your say-so?", type: "textarea", ph: "The hard limits…", sample: "Never send final pricing or commit stock without my written approval." },
  { id: "success", short: "Success metric", q: "How will we know it is actually helping?", type: "textarea", ph: "The measure…", sample: "Faster first response, more qualified leads booked, and no mispriced quotes." },
];
