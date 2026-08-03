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
import { useAutopilot } from "@/lib/mock/autopilot";
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
  /*
   * HIDDEN WHILE PRESENTING, and only then. "Hide sample-data labels" in the
   * top bar sets this, and so does "Do it for me" — both mean "somebody is
   * watching this screen, keep the scaffolding out of shot".
   *
   * It hides the NOTICE, never the fact: the runtime is still serving whatever
   * plan it was serving, the Activation gate still refuses on the same
   * evidence, and turning the labels back on says so again. This is the same
   * switch that already suppresses the demo chrome elsewhere, so a notice that
   * ignored it was the one piece of scaffolding that could not be put away.
   */
  const presenting = useAutopilot((s) => s.presentation);
  if (presenting) return null;

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
              : "Whose workforce this is has not been confirmed yet"}
          </p>
          <p className={styles.noticeBody}>
            When no plan has been imported, a sample workforce is shown here — and it looks
            exactly like a real one on this page. Until that check answers, the agents below
            are not confirmed to be yours, and not confirmed to be the sample either.
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
            This page could not confirm whose workforce it is showing
          </p>
          <p className={styles.noticeBody}>
            The agents and builds below are real records. What is missing is the one thing
            that says where this plan came from — so these may be the workforce you
            imported, or they may be the sample one. Those are not the same thing, and this
            page will not guess between them.
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
            These two answers are about different plans
          </p>
          <p className={styles.noticeBody}>
            The agents on this page and the answer about where the plan came from describe
            two different plans — most likely because a plan was imported between the two
            checks. Either way, that answer belongs to the other plan and says nothing
            about the agents on this page, so they are being treated as unconfirmed. Press
            Refresh to check both again.
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
          <p className={styles.noticeTitle}>This is your own workforce</p>
          <p className={styles.noticeBody}>
            These agents come from the workforce plan you imported, not from the sample one
            — so every agent below is one somebody asked for. Plan version{" "}
            {source.planVersion}.
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
            ? "You are viewing a sample workforce — your own plan has not been imported yet"
            : "We could not confirm that this workforce is yours"}
        </p>
        <p className={styles.noticeBody}>
          {/* The sample workforce is NOT named here, and that is deliberate for
              the same reason as before the rewrite: which fixture ships is the
              runtime's business and it has already changed once, so a name kept
              on this screen is the thing that goes stale. */}
          {isFixture
            ? "No plan of yours has been imported, so a sample workforce is being shown " +
              "instead. Everything below really happened — these are real builds of real " +
              "agents — but they are the sample agents, and putting them live would put " +
              "sample agents live."
            : "This page treats a workforce as yours only when it can confirm your own plan " +
              "was imported. Anything else is shown as unconfirmed, because the alternative " +
              "is taking an answer nobody has defined as proof that these agents are yours."}
        </p>
        {/* The runtime's own sentence is kept only where this page has no words
            of its own — an unrecognised state, where whatever explanation came
            back is the only one there is. In the sample case the plain copy
            above says the same thing, and says it without the vocabulary the
            owner asked to be rid of. */}
        {!isFixture && source.fallbackReason !== null && (
          <p className={styles.noticeDetail}>{source.fallbackReason}</p>
        )}
        {/* Without this qualifier the notice points an owner at the most
            prominent button on the plan page — which runs a worked example on
            sample data and stops part-way on purpose, so it cannot deliver what
            this notice would seem to promise. */}
        {isFixture && (
          <p className={styles.noticeBody}>
            To replace it, import your own workforce plan: paste it on the plan page, or
            bring it across from the planning step. The worked example already on that page
            uses sample data and stops part-way by design — pressing it will not replace
            this workforce.
          </p>
        )}
        <p className={styles.noticeBody}>Plan version {source.planVersion}.</p>
        <div>
          <Link href="/app/pipeline" className="oa-btn oa-btn--soft oa-btn--sm">
            Import your plan
            <ArrowRight size={13} aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
