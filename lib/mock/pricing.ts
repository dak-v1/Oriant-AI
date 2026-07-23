/**
 * lib/mock/pricing.ts — illustrative pricing helpers (spec §11.8).
 * All numbers are demo fixtures; UI must label them "Illustrative pricing".
 */
import type { PlanAgent } from "./types";
import { PRICING } from "./fixtures/ids";

export function planTotals(agents: PlanAgent[]): { setup: number; monthly: number } {
  return agents.reduce(
    (acc, a) => {
      const p = PRICING[a.agentId] ?? { setup: 0, monthly: 0 };
      return { setup: acc.setup + p.setup, monthly: acc.monthly + p.monthly };
    },
    { setup: 0, monthly: 0 },
  );
}

export function money(n: number): string {
  return `$${n.toLocaleString("en-SG")}`;
}
