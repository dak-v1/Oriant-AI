"use client";
/**
 * components/live/sandbox/PlanSourceNotice.tsx — whose workforce is being
 * proved on this screen.
 *
 * THIS IS THE MOST IMPORTANT THING ON THE PAGE, and it sits above everything in
 * every state including before anything has been read. `lib/runtime/current-plan.ts`
 * falls back to a built-in demo plan whenever nothing has been ingested, and
 * `GET /api/runtime/sandbox` generates a scenario library for that plan exactly
 * as it would for a real one — same shape, same categories, same pass/fail. A
 * Sandbox that renders a green verdict over those demo agents without this
 * notice is telling an owner their workforce has been proved safe.
 *
 * AND ON THIS PAGE THE CONSEQUENCE IS THE LARGEST IN THE PRODUCT. The Factory's
 * version of this notice guards a build; this one guards the evidence somebody
 * reads immediately before pressing go-live. "Ready for activation" earned
 * against demo agents, mistaken for the same words earned against the owner's
 * own, is a workforce activated on somebody else's proof.
 *
 * ADAPTED FROM components/live/build/PlanSourceNotice.tsx. Same four states,
 * same rules, same class names; the sentences are this page's because what a
 * fixture plan costs here is a verdict rather than a set of packages. Copied
 * rather than shared for the reason that lane's api.ts gives about its readers.
 *
 * FOUR STATES, AND THE ONLY QUIET ONE IS THE PROVEN ONE. "ingested" is the plan
 * the owner's own handoff produced and gets a single confirming line. Every
 * other state — the fixture, a word this build does not recognise, and a
 * provenance this screen could not read at all — is loud, because each of them
 * means the tests below are not proven to be about the owner's workforce.
 *
 * A FAILED READ IS NOT A PASS. The tempting shape is "show the warning when
 * source === 'fixture'", which renders silence when `/api/runtime/agents` cannot
 * be reached — and silence here reads as "this is yours". So the absence of an
 * answer has its own state and its own sentence.
 *
 * THE PROVENANCE AND THE SUITE MUST BE THE SAME PLAN. Two endpoints answer two
 * requests, and between them somebody can ingest. `planId` is compared, and a
 * mismatch downgrades the notice to unattributed rather than letting one plan's
 * provenance vouch for another plan's scenarios.
 */

import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, HelpCircle, Loader2 } from "lucide-react";
import type { PlanSourceView } from "./api";
import styles from "./sandbox.module.css";

/**
 * What this screen knows about the plan's provenance.
 *
 * `unread` is not an error state and not a good one: it is the window before
 * `/api/runtime/agents` has answered for the first time, and it must not be
 * rendered as either of the other two.
 */
export type SourceState =
  | { kind: "unread" }
  | { kind: "known"; source: PlanSourceView }
  /** The read failed. `message` is the runtime's or the transport's own words. */
  | { kind: "unknown"; message: string; advice: string };

/** The one word the runtime uses for "this came from the owner's own handoff". */
const INGESTED = "ingested";
/** And for "nothing crossed the seam, so this is the demo". */
const FIXTURE = "fixture";

export default function PlanSourceNotice({
  state,
  suitePlanId,
  checking,
}: {
  state: SourceState;
  /**
   * The plan id the sandbox library reported, or null while that read has not
   * answered. Compared against the roster's, never assumed equal.
   */
  suitePlanId: string | null;
  /** A provenance read is in flight. Only changes the wording, never the verdict. */
  checking: boolean;
}) {
  if (state.kind === "unread") {
    return (
      <section className={`${styles.notice} ${styles.noticeUnknown}`} aria-busy={checking}>
        <span className={styles.noticeIcon} aria-hidden>
          {checking ? <Loader2 size={20} className="oa-spin" /> : <HelpCircle size={20} />}
        </span>
        <div className={styles.noticeText}>
          <p className={styles.noticeTitle}>
            {checking
              ? "Checking whose workforce is being proved…"
              : "Whose workforce this is has not been established"}
          </p>
          <p className={styles.noticeBody}>
            The runtime serves a built-in demo plan when nothing has been ingested, and it
            generates tests for it that look exactly like tests for a real one. Until{" "}
            <code>/api/runtime/agents</code> answers, the scenarios below are not proven to
            be about your workforce — and not proven to be about the demo either.
          </p>
        </div>
      </section>
    );
  }

  if (state.kind === "unknown") {
    return (
      <section className={`${styles.notice} ${styles.noticeUnknown}`} role="alert">
        <span className={styles.noticeIcon} aria-hidden>
          <HelpCircle size={20} />
        </span>
        <div className={styles.noticeText}>
          <p className={styles.noticeTitle}>
            This screen could not establish whose workforce it is proving
          </p>
          <p className={styles.noticeBody}>
            The scenarios and results below are real: the runtime generated them for the plan
            it holds and judged every one in code. What is missing is the one field that says
            where that plan came from, and without it a green verdict here may be about your
            ingested workforce or about the built-in demo. They are not the same thing and
            this screen will not guess between them.
          </p>
          <p className={styles.noticeDetail}>{state.message}</p>
          <p className={styles.noticeBody}>{state.advice}</p>
        </div>
      </section>
    );
  }

  const { source } = state;

  /* Compared rather than assumed. Both endpoints read `session.currentPlan()`,
     so they agree in every ordinary case — and the one case where they do not is
     an ingest landing between the two requests, which is exactly when
     attributing one answer to the other would be worst. */
  const mismatch = suitePlanId !== null && suitePlanId !== source.planId;

  if (mismatch) {
    return (
      <section className={`${styles.notice} ${styles.noticeUnknown}`} role="alert">
        <span className={styles.noticeIcon} aria-hidden>
          <AlertTriangle size={20} />
        </span>
        <div className={styles.noticeText}>
          <p className={styles.noticeTitle}>The provenance answer is about a different plan</p>
          <p className={styles.noticeBody}>
            The sandbox is proving <code>{suitePlanId}</code> and the roster described{" "}
            <code>{source.planId}</code>. The most likely reason is an ingest landing between
            the two requests. Whichever it was, the source below belongs to the other plan and
            says nothing about the scenarios on this screen, so this screen is treating them
            as unattributed. Refresh to ask both endpoints again.
          </p>
        </div>
      </section>
    );
  }

  if (source.source === INGESTED) {
    return (
      <section className={`${styles.notice} ${styles.noticeIngested}`}>
        <span className={styles.noticeIcon} aria-hidden>
          <CheckCircle2 size={20} />
        </span>
        <div className={styles.noticeText}>
          <p className={styles.noticeTitle}>This is your ingested workforce</p>
          <p className={styles.noticeBody}>
            Plan <code>{source.planId}</code>, version {source.planVersion}. It came from a
            handoff that was ingested into this runtime, not from the built-in demo — so every
            scenario below was generated from agents somebody asked for, and a verdict here is
            evidence about them.
          </p>
        </div>
      </section>
    );
  }

  /* Everything that is not the word "ingested" lands here, and the fixture is
     only the case we have a name for. An unrecognised word is treated as
     not-yours on purpose: reading it as a real plan would be this screen
     inventing the reassuring answer for a value it has never seen. */
  const isFixture = source.source === FIXTURE;

  return (
    <section className={`${styles.notice} ${styles.noticeFixture}`} role="alert">
      <span className={styles.noticeIcon} aria-hidden>
        <AlertTriangle size={20} />
      </span>
      <div className={styles.noticeText}>
        <p className={styles.noticeTitle}>
          {isFixture
            ? "These are demo agents, not your workforce"
            : `The runtime called this plan's source "${source.source}", which this screen does not recognise`}
        </p>
        <p className={styles.noticeBody}>
          {/* The demo plan is NOT named here. Which fixture ships is the
              runtime's business and it has already changed once; `fallbackReason`
              below names it in the runtime's own words, and a second name kept on
              this screen would be the one that goes stale. */}
          {isFixture
            ? "Nothing has been ingested into this runtime, so it is serving its built-in demo " +
              "plan. Everything below is real — real generated scenarios, real runs, real " +
              "pass/fail judged in code — but it is a demo workforce being proved. “Ready for " +
              "activation” here means the demo is ready, and activating it would put demo " +
              "agents live."
            : "This build only trusts the word “ingested” to mean an owner's own handoff. " +
              "Anything else is treated as unattributed, because the alternative is reading a " +
              "word nobody has defined as proof that this verdict is about your workforce."}
        </p>
        {source.fallbackReason !== null && (
          <p className={styles.noticeDetail}>{source.fallbackReason}</p>
        )}
        {/* The runtime's sentence above says "run a handoff through the
            pipeline", and the pipeline's most prominent button runs a stored
            demo handoff that blocks at Ingest on purpose. Without this qualifier
            the notice points an owner at a press that cannot deliver what it
            promises. Dropping the runtime's sentence instead was rejected: it is
            the one line that names which demo is standing in, and the components
            must not paraphrase it. */}
        {isFixture && (
          <p className={styles.noticeBody}>
            What replaces it is ingesting a <em>real</em> handoff — pasted on the pipeline
            page, or collected from Role B. The pipeline&apos;s built-in button runs a stored
            demo handoff that blocks at Ingest by design, to demonstrate the gap report;
            pressing it does not replace this workforce.
          </p>
        )}
        <p className={styles.noticeBody}>
          Plan <code>{source.planId}</code>, version {source.planVersion}.
        </p>
        <div>
          <Link href="/app/pipeline" className="oa-btn oa-btn--soft oa-btn--sm">
            Ingest a real handoff
            <ArrowRight size={13} aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
