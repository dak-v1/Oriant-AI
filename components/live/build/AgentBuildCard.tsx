"use client";
/**
 * components/live/build/AgentBuildCard.tsx — one agent in the current plan, and
 * everything the Factory actually recorded about building it.
 *
 * THE CARD ANSWERS TWO QUESTIONS AND KEEPS THEM APART. What the last job SAID
 * (a status word, an attempt count, an error, a log) and what is STORED (a
 * package for this exact agent version, or the runtime's reason there is none).
 * They can disagree, and when they do the stored answer is the one that decides
 * whether this agent can go live: `planBuildStatus` re-derives readiness from
 * packages rather than from job rows precisely because "a job row says what
 * happened, a package says what is actually available to run". A card that
 * showed only the green job would report an agent as built after somebody edited
 * its spec.
 *
 * NO PROGRESS IS DRAWN, EVER. The screen this replaces animated a percentage out
 * of a fixture's `duration` field; the runtime publishes no progress at all,
 * because `buildPlan` compiles the whole plan inside one request and answers when
 * it is done. So an in-flight card says which state the runner last wrote and
 * says, in words, that there is no percentage to show. A bar that means nothing
 * is worse than no bar: it is the thing that made the owner believe this screen
 * was reporting on their product.
 *
 * A STALE `queued` IS NAMED RATHER THAN ANIMATED. The owner's original report was
 * a card reading "Queued, waiting for a build slot…" for ever. A job row really
 * can sit at `queued` or `generating` — the runner writes each state before it
 * does the work, so a process that stopped mid-build leaves one behind — and this
 * card says exactly that instead of implying something is on its way. `building`
 * is what separates the two readings, and it is the caller's fact to supply: only
 * the screen knows whether the POST it sent is still open.
 *
 * A JOB FOR ANOTHER VERSION EXPLAINS ITSELF. The store keeps history and the GET
 * returns every job for the plan id, so the newest row for an agent can describe
 * a spec the plan no longer asks for. Its green badge is true and irrelevant, and
 * saying so is the difference between "built" and "built something else".
 */

import { AlertTriangle, Info, Package, PauseCircle } from "lucide-react";
import type { JobView, PackageView, PlanAgentView } from "./api";
import { STATUS_META, elapsed, formatInstant, logLevelClass, plural } from "./format";
import styles from "./build.module.css";

export default function AgentBuildCard({
  agent,
  job,
  pkg,
  missingReason,
  building,
}: {
  agent: PlanAgentView;
  /** The newest job recorded for this agent, or null when there has never been one. */
  job: JobView | null;
  /** The stored package for this agent AT THE PLAN'S VERSION. Null when there is none. */
  pkg: PackageView | null;
  /**
   * The runtime's own reason this agent has no current package, from `missing`.
   * Null means the runtime did not list it, which is the only thing that counts
   * as built — see the module header on why the package decides and not the job.
   */
  missingReason: string | null;
  /** A build sent from this tab is still open. See the module header. */
  building: boolean;
}) {
  const meta = job === null ? null : STATUS_META[job.status];
  const staleVersion = job !== null && job.agentVersion !== agent.version;
  const took = job === null ? null : elapsed(job.startedAt, job.endedAt);
  /* An in-flight word with no build of ours behind it. The runner never clears a
     row it abandoned, so this is the shape the original "stuck queued" bug takes
     when it is real rather than simulated. */
  const orphaned =
    job !== null && !building && (meta?.inFlight === true || job.status === "queued");

  return (
    <article className={`oa-card ${styles.card}`} aria-label={`Build state for ${agent.name}`}>
      <header className={styles.cardHead}>
        <div className={styles.cardTitles}>
          <h3 className={styles.cardName}>{agent.name}</h3>
          <p className={styles.cardMeta}>
            <code className={styles.mono}>{agent.id}</code>
            <span aria-hidden>·</span>
            <span>version {agent.version}</span>
            <span aria-hidden>·</span>
            <span>{agent.operatingMode}</span>
          </p>
        </div>
        {meta === null ? (
          <span className="oa-status oa-status--neutral">never built here</span>
        ) : (
          <span className={`oa-status oa-status--${meta.cls}`}>{meta.label}</span>
        )}
      </header>

      {/* ── What the runtime last recorded about building this agent ── */}
      <div className={styles.cardSection}>
        <p className={styles.cardLabel}>Last build job</p>
        {job === null ? (
          <p className={styles.cardBody}>
            No job has ever been recorded for this agent under this plan. That is not a
            failure and not a queue — nothing has been asked of the Factory for it yet.
          </p>
        ) : (
          <>
            <p className={styles.cardBody}>{STATUS_META[job.status].meaning}</p>

            {staleVersion && (
              <p className={styles.cardWarn}>
                <AlertTriangle size={13} aria-hidden />
                <span>
                  This job built version {job.agentVersion}. The plan now asks for version{" "}
                  {agent.version}, so whatever it says is about a different spec and says
                  nothing about whether the current one is built.
                </span>
              </p>
            )}

            {building && (STATUS_META[job.status].inFlight || job.status === "queued") && (
              <p className={styles.cardNote}>
                <Info size={13} aria-hidden />
                <span>
                  A build is running now and this is the last state it wrote. No percentage
                  is shown because the runtime does not report one — it compiles the whole
                  plan inside one request and answers at the end.
                </span>
              </p>
            )}

            {orphaned && (
              <p className={styles.cardWarn}>
                <PauseCircle size={13} aria-hidden />
                <span>
                  Nothing is building from this tab, so this row is either another process
                  mid-build or a build that stopped without finishing. It is not a queue
                  waiting for a slot: there is no queue, and pressing Build starts a fresh
                  job rather than resuming this one.
                </span>
              </p>
            )}

            {job.error !== null && (
              <p className={styles.cardError} role="alert">
                <AlertTriangle size={13} aria-hidden />
                <span>{job.error}</span>
              </p>
            )}

            <dl className={styles.factRows}>
              <Fact label="Job" value={job.jobId} mono />
              <Fact
                label="Attempt"
                value={
                  job.attempt === 0
                    ? "none — nothing was generated"
                    : `${job.attempt}${job.attempt > 1 ? " (an earlier one failed)" : ""}`
                }
              />
              {/* A null instant means two different things and the difference is
                  the whole reason `origin` exists: the POST reply does not carry
                  these fields, so a finished job read out of it has no end for a
                  reason that says nothing about the runtime. Rendering that as
                  "not recorded" would tell somebody their completed build never
                  finished. The store's own nulls are the real ones. */}
              <Fact
                label="Started"
                value={
                  job.startedAt !== null
                    ? formatInstant(job.startedAt)
                    : job.origin === "build-response"
                      ? "not carried by the build reply"
                      : "not recorded"
                }
              />
              <Fact
                label="Ended"
                value={
                  job.endedAt !== null
                    ? formatInstant(job.endedAt)
                    : job.origin === "build-response"
                      ? "not carried by the build reply"
                      : building
                        ? "not yet"
                        : "not recorded"
                }
              />
              {took !== null && <Fact label="Took" value={took} />}
            </dl>
          </>
        )}
      </div>

      {/* ── What is actually stored, which is what Activation gates on ── */}
      <div className={styles.cardSection}>
        <p className={styles.cardLabel}>Stored package</p>
        {pkg === null ? (
          <p className={styles.cardBody}>
            Nothing is stored for {agent.id} at version {agent.version}. An agent with no
            package cannot run, so activation would put a name live with nothing behind it.
          </p>
        ) : (
          <>
            <p className={styles.checksum}>
              <Package size={13} aria-hidden />
              <code className={styles.mono}>{pkg.checksum}</code>
            </p>
            <dl className={styles.factRows}>
              <Fact label="Built" value={formatInstant(pkg.builtAt)} />
              <Fact label="Workflows" value={plural(pkg.workflows, "workflow", "workflows")} />
              <Fact
                label="Permitted operations"
                value={plural(pkg.allowedOperations, "operation", "operations")}
              />
            </dl>
          </>
        )}

        {missingReason === null ? (
          <p className={styles.cardOk}>
            The runtime does not list this agent as missing a package, which is the answer
            the go-live gate reads.
          </p>
        ) : (
          <p className={styles.cardWarn}>
            <AlertTriangle size={13} aria-hidden />
            <span>{missingReason}</span>
          </p>
        )}
      </div>

      {/* The runner's own log, verbatim. A disclosure rather than a stream: these
          lines are written all at once when the request answers, so animating
          them in would be theatre with a real transcript as its script. */}
      {job !== null && job.logs.length > 0 && (
        <details className={styles.logBox}>
          <summary className={styles.logSummary}>
            Build log — {plural(job.logs.length, "line", "lines")} from the runtime
          </summary>
          <ol className={styles.logList}>
            {job.logs.map((line, index) => (
              <li key={`${job.jobId}-${index}`} className={styles.logLine}>
                <span className={styles.logAt}>{formatInstant(line.at)}</span>
                <span className={`${styles.logLevel} ${styles[logLevelClass(line.level)]}`}>
                  {line.level}
                </span>
                <span className={styles.logMessage}>{line.message}</span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </article>
  );
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className={styles.factRow}>
      <dt className={styles.factLabel}>{label}</dt>
      <dd className={`${styles.factValue} ${mono === true ? styles.mono : ""}`}>{value}</dd>
    </div>
  );
}
