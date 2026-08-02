"use client";
/**
 * components/live/deploy/OrganizationRefusal.tsx — the allowlist saying this
 * deployment may not act for the plan's organization.
 *
 * TWO FIELDS ARE RENDERED VERBATIM AND NOTHING PARAPHRASES THEM. `error` says
 * which organization was refused and what was NOT done — "nothing was ingested,
 * built, recorded as the current plan, or activated" — and `hint` says the exact
 * thing to change: which variable, which id to add, and that unsetting
 * ORIANT_RUNTIME_TOOLS runs it against nobody's accounts. Both are written in
 * lib/runtime/pipeline/organization-gate.ts, they are the only actionable
 * sentences in the whole exchange, and a screen that replaced them with
 * "Forbidden" would leave an operator with a status code and no next step.
 *
 * IT IS NOT A WORKFORCE PROBLEM AND MUST NOT READ AS ONE. Nothing is broken, no
 * gate is shut, and no amount of reconnecting a tool or re-running the sandbox
 * changes it. What is missing is AUTHORITY: this deployment has not been told it
 * may act for this organization. The heading says that in those words, because
 * the neighbouring red box on this screen means something entirely different.
 *
 * THE ALLOWLIST IS SUMMARISED, NEVER ENUMERATED. The refusal deliberately carries
 * a COUNT of permitted organizations and not the ids — its own comment explains
 * that listing them would answer an anonymous prober's real question — so this
 * component shows exactly what it was sent and goes looking for nothing else.
 */

import { ShieldX } from "lucide-react";
import type { OrganizationRefusalView } from "./api";
import styles from "./deploy.module.css";

export default function OrganizationRefusal({
  refusal,
  /** Which request was refused, so the reader knows what did not happen. */
  attempt,
}: {
  refusal: OrganizationRefusalView;
  attempt: "read" | "go-live";
}) {
  return (
    <section className={styles.refusalBox} role="alert">
      <p className={styles.errorTitle}>
        <ShieldX size={17} aria-hidden />
        This workspace is not permitted to act for this business yet
      </p>

      <p>
        {attempt === "go-live"
          ? "Nothing was switched on. This is not a check failing and not a fault in your " +
            "workforce — the request was turned down because this workspace has not been " +
            "given permission to act for this business. The same request goes through the " +
            "moment somebody grants it."
          : "The checks could not be run for this reason, so nothing below reports on the " +
            "state of your workforce. This is not a check failing and not a fault in your " +
            "workforce."}
      </p>

      {/* WHAT TO DO, ADDRESSED TO A PERSON. The refusal arrives with two long
          sentences written for whoever administers the server — they name the
          setting to change and the id to add — and printing them here left an
          owner reading configuration advice they cannot act on. The one thing
          they have to know is preserved: who to ask, and for what. */}
      <div className={styles.refusalQuote}>
        <p>
          Ask your administrator to give this workspace permission to act for this
          business. Until they do, every action that would touch this business&apos;s
          connected tools is refused the same way — nothing is half-done and nothing is
          left behind.
        </p>
        {refusal.allowlist !== null && (
          <p>
            {refusal.allowlist.configured
              ? `${refusal.allowlist.permitted} ${
                  refusal.allowlist.permitted === 1 ? "business is" : "businesses are"
                } permitted at the moment, and this one is not among them.`
              : "No business has been permitted yet, so nothing can act for anyone until " +
                "somebody sets that up."}
          </p>
        )}
      </div>

      {/* THE ONE IDENTIFIER WORTH KEEPING, framed as something to hand over
          rather than as content. The administrator being sent for cannot act
          without knowing which business was refused, and this is the only place
          it appears. */}
      {refusal.organizationId !== null && (
        <div className={styles.refusalFacts}>
          <span>Reference to give them: {refusal.organizationId}</span>
        </div>
      )}
    </section>
  );
}
