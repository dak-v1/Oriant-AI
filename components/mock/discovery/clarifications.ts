/**
 * Hardcoded "Ask Oriant to clarify" lines for the five interview questions
 * (spec §9.1 secondary controls). UI microcopy only — the questions, answers
 * and facts all come from the discovery-questions fixture.
 */
import { DQ } from "@/lib/mock/fixtures/ids";

export const CLARIFICATIONS: Record<string, string> = {
  [DQ.overloaded]:
    "By overloaded I mean the team where work queues up or people keep switching contexts — whichever team you find yourself worrying about most mornings.",
  [DQ.appointment]:
    "Walk through the steps exactly as they happen today, from the customer's first message to the confirmed slot — including who touches the calendar.",
  [DQ.decisions]:
    "Think of the calls you would never want made without you: money amounts, promises to customers, anything published publicly.",
  [DQ.finance]:
    "I'm looking for finance chores that repeat on a schedule — the same checks, summaries or drafts done every week or month.",
  [DQ.coordination]:
    "Which situations force you to gather information from more than one team before anyone can act on them?",
};
