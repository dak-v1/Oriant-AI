"use client";
/**
 * components/live/build/PlanSourceNotice.tsx — whose workforce is on this screen.
 *
 * THIS IS THE MOST IMPORTANT THING ON THE PAGE, and it sits above everything in
 * every state including before anything has been read. `lib/runtime/current-plan.ts`
 * falls back to a built-in demo fixture whenever nothing has been
 * ingested, and `GET /api/runtime/build` reports that plan exactly as it reports
 * a real one — same agent names, same job rows, same checksums. A Factory that
 * renders those four demo agents without this notice is telling an owner their
 * workforce is being built, which is the precise defect this whole effort exists
 * to remove.
 *
 * FOUR STATES, AND THE ONLY QUIET ONE IS THE PROVEN ONE. "ingested" is the plan
 * the owner's own handoff produced and gets a single confirming line. Every other
 * state — the fixture, a word this build does not recognise, and a provenance
 * this screen could not read at all — is loud, because each of them means the
 * agents below are not proven to be the owner's.
 *
 * A FAILED READ IS NOT A PASS. The tempting shape is "show the warning when
 * source === 'fixture'", which renders silence when `/api/runtime/agents` cannot
 * be reached — and silence here reads as "this is yours". So the absence of an
 * answer has its own state and its own sentence, the same discipline
 * `PipelineScreen`'s `unheard` predicate exists for.
 *
 * THE PROVENANCE AND THE AGENTS MUST BE THE SAME PLAN. Two endpoints answer two
 * requests, and between them somebody can ingest. `planId` is compared, and a
 * mismatch downgrades the notice to unattributed rather than letting one plan's
 * provenance vouch for another plan's agents.
 */

import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, HelpCircle, Loader2 } from "lucide-react";
import type { PlanSourceView } from "./api";
import styles from "./build.module.css";

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
  factoryPlanId,
  checking,
}: {
  state: SourceState;
  /**
   * The plan id the Factory reported, or null while that read has not answered.
   * Compared against the roster's, never assumed equal.
   */
  factoryPlanId: string | null;
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
              ? "Checking whose workforce this is…"
              : "Whose workforce this is has not been established"}
          </p>
          <p className={styles.noticeBody}>
            The runtime serves a built-in demo plan when nothing has been ingested, and it
            looks exactly like a real one on this screen. Until{" "}
            <code>/api/runtime/agents</code> answers, the agents below are not proven to be
            yours — and not proven to be the demo either.
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
            This screen could not establish whose workforce it is showing
          </p>
          <p className={styles.noticeBody}>
            The plan and its build jobs below are real records from{" "}
            <code>/api/runtime/build</code>. What is missing is the one field that says
            where the plan came from, and without it these agents may be your ingested
            workforce or may be the built-in demo. They are not the same thing and this
            screen will not guess between them.
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
     an ingest landing between the two requests, which is exactly when attributing
     one answer to the other would be worst. */
  const mismatch = factoryPlanId !== null && factoryPlanId !== source.planId;

  if (mismatch) {
    return (
      <section className={`${styles.notice} ${styles.noticeUnknown}`} role="alert">
        <span className={styles.noticeIcon} aria-hidden>
          <AlertTriangle size={20} />
        </span>
        <div className={styles.noticeText}>
          <p className={styles.noticeTitle}>
            The provenance answer is about a different plan
          </p>
          <p className={styles.noticeBody}>
            The Factory is building <code>{factoryPlanId}</code> and the roster described{" "}
            <code>{source.planId}</code>. The most likely reason is an ingest landing
            between the two requests. Whichever it was, the source below belongs to the
            other plan and says nothing about the agents on this screen, so this screen is
            treating them as unattributed. Refresh to ask both endpoints again.
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
            handoff that was ingested into this runtime, not from the built-in demo — so
            every agent below is one somebody asked for.
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
            ? "Nothing has been ingested into this runtime, so it is serving its built-in " +
              "demo plan. Everything below is real — real job rows, real packages, real " +
              "checksums — but it is a demo workforce being built, and activating it would " +
              "put demo agents live."
            : "This build only trusts the word “ingested” to mean an owner's own handoff. " +
              "Anything else is treated as unattributed, because the alternative is reading a " +
              "word nobody has defined as proof that these agents are yours."}
        </p>
        {source.fallbackReason !== null && (
          <p className={styles.noticeDetail}>{source.fallbackReason}</p>
        )}
        {/* The runtime's sentence above says "run a handoff through the
            pipeline", and the pipeline's most prominent button runs a stored
            demo handoff that blocks at Ingest on purpose. Without this
            qualifier the notice points an owner at a press that cannot deliver
            what it promises. Dropping the runtime's sentence instead was
            rejected: it is the one line that names which demo is standing in,
            and the components must not paraphrase it. */}
        {isFixture && (
          <p className={styles.noticeBody}>
            What replaces it is ingesting a <em>real</em> handoff — pasted on the pipeline
            page, or collected from Role B. The pipeline&apos;s built-in button runs a
            stored demo handoff that blocks at Ingest by design, to demonstrate the gap
            report; pressing it does not replace this workforce.
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
