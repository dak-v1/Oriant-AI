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
        This deployment is not permitted to act for this plan&apos;s organization
      </p>

      <p>
        {attempt === "go-live"
          ? "The go-live was refused before anything was activated. This is not a gate " +
            "shutting and not a fault in the workforce — the request was refused for " +
            "want of authority, and the same bytes are accepted the moment an operator " +
            "permits the organization."
          : "The checklist could not be read for this reason, so nothing below reports " +
            "on the state of the workforce. This is not a gate shutting and not a fault " +
            "in the workforce."}
      </p>

      {/* The deployment's own words. Everything above and below is framing. */}
      <div className={styles.refusalQuote}>
        <p>{refusal.error}</p>
        <p>{refusal.hint}</p>
      </div>

      {(refusal.organizationId !== null || refusal.allowlist !== null || refusal.code !== null) && (
        <div className={styles.refusalFacts}>
          {refusal.organizationId !== null && (
            <span>organization refused: {refusal.organizationId}</span>
          )}
          {refusal.allowlist !== null && (
            <>
              <span>variable: {refusal.allowlist.variable}</span>
              <span>
                configured: {refusal.allowlist.configured ? "yes" : "no"} · organizations
                permitted: {refusal.allowlist.permitted}
              </span>
            </>
          )}
          {refusal.code !== null && <span>code: {refusal.code}</span>}
        </div>
      )}

      {/* The standing note that this whole mechanism is temporary. Shown because
          the refusal chose to send it, not because this screen has an opinion
          about it. */}
      {refusal.stopgap !== null && <p>{refusal.stopgap}</p>}
    </section>
  );
}
