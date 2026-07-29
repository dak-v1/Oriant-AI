/**
 * LaneRefusal — what `/app/workspace/approvals` renders when the lane switch was
 * given a value this build does not implement.
 *
 * It exists so that the alternative — quietly falling back to the scripted
 * screen — never happens. Somebody who typed `?live=tru` asked for the inbox
 * that decides real paused runs; handing them a demo whose cards approve
 * fixtures, with no sign of the difference, is the kind of failure that is only
 * discovered when a decision turns out not to have been made.
 *
 * A server component: no state, no effects, nothing to hydrate.
 */
import { AlertTriangle } from "lucide-react";
import styles from "./live-approvals.module.css";

export default function LaneRefusal({
  setting,
  value,
  accepted,
}: {
  /** The switch that could not be read — "?live=" or the env var's name. */
  setting: string;
  value: string;
  /** The forms this build does accept, in the owner's words. */
  accepted: string;
}) {
  return (
    <main className="oa-page oa-page--narrow">
      <header style={{ display: "grid", gap: 6, marginBottom: 20 }}>
        <p className="oa-eyebrow">Operate · Approval inbox</p>
        <h1 className="oa-h1">
          Which <span className="oa-serif">inbox?</span>
        </h1>
      </header>

      <div className={styles.errorBox} role="alert">
        <p className={styles.errorTitle}>
          <AlertTriangle size={15} aria-hidden />
          This route was asked for a screen that does not exist
        </p>
        <p className={styles.errorDetail}>
          {setting}
          {value}
        </p>
        <p>
          Two screens answer this URL: the scripted demo inbox and the live one backed by the agent
          runtime. Accepted values are {accepted}.
        </p>
        <p>
          Nothing was rendered instead, on purpose. Falling back to the demo would put scripted
          cards in front of someone who asked in writing for the live queue, and those cards decide
          nothing.
        </p>
      </div>

      <div className={styles.stateBox} style={{ marginTop: 14 }}>
        <p className={styles.stateTitle}>Where to go from here</p>
        <ol className={styles.stateSteps}>
          <li>
            The scripted demo: <code>/app/workspace/approvals</code>, or{" "}
            <code>/app/workspace/approvals?live=0</code> if a deployment has switched the default
            over.
          </li>
          <li>
            The live inbox: <code>/app/workspace/approvals?live=1</code>.
          </li>
        </ol>
      </div>
    </main>
  );
}
