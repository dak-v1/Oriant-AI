/**
 * lean-canvas.ts — guided Lean Canvas fixture for BrightPath Home Services.
 * Covers spec §8 (Lean Canvas intake), block order per §8.2.
 */

import type { LeanCanvasBlockDef } from "../types";

/** Spec §8.2 — all nine blocks in order, with demo values and AI-improved wording. */
export const LEAN_CANVAS_BLOCKS: LeanCanvasBlockDef[] = [
  {
    id: "problem",
    title: "Problem",
    question: "What are the top problems your customers are trying to solve?",
    guidance:
      "Name the two or three frustrations that make customers pick up the phone. Real situations beat abstract statements.",
    examples: [
      "Homeowners can't find a contractor who shows up on time",
      "Small leaks get ignored until they become costly repairs",
      "Getting a quote takes three phone calls and a site visit",
    ],
    demoValue:
      "Homeowners struggle to find reliable, punctual maintenance providers they can trust. Small repairs get postponed until they turn into expensive emergencies. Arranging quotes, bookings and follow-ups over the phone eats up their time.",
    improvedValue:
      "Homeowners cannot find maintenance providers who reliably show up, so small repairs are deferred until they become costly emergencies. Every quote, booking and follow-up still means phone tag.",
  },
  {
    id: "customer-segments",
    title: "Customer Segments",
    question: "Who are your most important customers?",
    guidance:
      "Be specific about who pays you most often. If several groups exist, note which one you would keep if you could only keep one.",
    examples: [
      "Dual-income families in condominiums",
      "Landlords with multiple rental units",
      "MCSTs needing common-area maintenance",
    ],
    demoValue:
      "Homeowners and landlords of condominiums and HDB flats across Singapore. Our best customers are dual-income families on recurring maintenance plans. Property agents managing several rental units are a growing second segment.",
    improvedValue:
      "Primary: dual-income families in Singapore condos and HDB flats who subscribe to recurring maintenance plans. Secondary and growing: property agents and landlords managing multiple rental units.",
  },
  {
    id: "unique-value-proposition",
    title: "Unique Value Proposition",
    question: "In one or two sentences, why do customers choose you over anyone else?",
    guidance:
      "Say it the way a happy customer would repeat it to a neighbour. Avoid slogans; state the concrete promise.",
    examples: [
      "One team for every home repair, fixed prices, no surprises",
      "We answer within a day and arrive when we said we would",
    ],
    demoValue:
      "One trusted team for every home maintenance need, with fixed transparent pricing and a response within 24 hours. Customers on a plan never have to hunt for a contractor again.",
    improvedValue:
      "Every home maintenance need handled by one accountable team — fixed prices, a 24-hour response promise, and plan customers who never search for a contractor again.",
  },
  {
    id: "solution",
    title: "Solution",
    question: "What do you actually offer to solve those problems?",
    guidance:
      "Describe the service as delivered, not aspirations. Include how customers reach you and what happens after they book.",
    examples: [
      "Quarterly maintenance visits on a subscription plan",
      "Same-week repairs booked over WhatsApp",
    ],
    demoValue:
      "Bundled maintenance plans with scheduled quarterly visits, plus on-demand repairs booked through WhatsApp or email. Every job is confirmed, dispatched, tracked and invoiced by our office team.",
    improvedValue:
      "Subscription maintenance plans with scheduled quarterly visits, backed by on-demand repairs booked via WhatsApp or email — each job confirmed, dispatched, tracked and invoiced centrally.",
  },
  {
    id: "channels",
    title: "Channels",
    question: "How do customers find you and how do you stay in touch?",
    guidance:
      "List where new customers actually come from today, then how you keep existing customers engaged.",
    examples: [
      "Google search and Google reviews",
      "Word-of-mouth referrals from existing plan customers",
      "WhatsApp broadcasts to past customers",
    ],
    demoValue:
      "Most new customers come from Google searches and word-of-mouth referrals. We keep in touch through WhatsApp, a monthly email newsletter and occasional Facebook posts.",
    improvedValue:
      "Acquisition: Google search and referrals from existing plan customers. Retention: WhatsApp for job updates, a monthly email newsletter, and occasional Facebook posts.",
  },
  {
    id: "revenue-streams",
    title: "Revenue Streams",
    question: "How does the business earn money?",
    guidance:
      "Note each way money comes in and roughly what share of revenue it contributes. Recurring versus one-off matters most.",
    examples: [
      "Monthly maintenance subscriptions at tiered prices",
      "Per-visit quotes for one-off repairs and installations",
    ],
    demoValue:
      "Monthly and annual maintenance plans provide recurring revenue at $89 to $249 per month. One-off repair and installation jobs are quoted per visit. Plans account for roughly 60% of revenue.",
    improvedValue:
      "Recurring maintenance plans ($89–$249 per month) contribute about 60% of revenue; the remainder comes from one-off repair and installation jobs quoted per visit.",
  },
  {
    id: "cost-structure",
    title: "Cost Structure",
    question: "What are your biggest costs?",
    guidance:
      "Start with the largest line items. Flag any cost that grows faster than revenue — that is usually where automation helps.",
    examples: [
      "Technician salaries, CPF and training",
      "Vans, fuel, parts and tools",
      "Office coordination and admin overhead",
    ],
    demoValue:
      "The largest costs are technician salaries and CPF contributions, followed by vans, fuel, parts and tools. Office coordination overhead keeps growing each year as job volume rises.",
    improvedValue:
      "Technician salaries and CPF dominate costs, followed by vehicles, fuel, parts and tools. Coordination overhead is the fastest-growing line — it scales with job volume, not revenue.",
  },
  {
    id: "key-metrics",
    title: "Key Metrics",
    question: "Which numbers tell you the business is healthy?",
    guidance:
      "Pick three to five numbers you would check weekly. Include at least one customer-trust signal, not only financials.",
    examples: [
      "Completed jobs per month",
      "Maintenance plan renewal rate",
      "Average first-response time to enquiries",
    ],
    demoValue:
      "We track completed jobs per month, maintenance plan renewals and average response time to enquiries. Repeat bookings tell us whether customers still trust the service.",
    improvedValue:
      "Weekly health check: completed jobs per month, plan renewal rate, average first-response time to enquiries, and repeat-booking rate as the leading trust signal.",
  },
  {
    id: "unfair-advantage",
    title: "Unfair Advantage",
    question: "What do you have that competitors cannot easily copy?",
    guidance:
      "Think history, relationships and data — not features. Something bought or built quickly by a rival does not count.",
    examples: [
      "Eight years of service records across thousands of homes",
      "Technicians customers request by name",
    ],
    demoValue:
      "Eight years of service history across more than 2,000 Singapore homes, with technicians customers ask for by name. Our plan renewal rate above 80% is hard for new entrants to copy.",
    improvedValue:
      "Eight years of documented service history across 2,000+ Singapore homes, technicians requested by name, and an 80%+ plan renewal rate — trust a new entrant cannot buy.",
  },
];
