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
 * THE SETTING'S OWN NAME IS NOT PRINTED. `setting` is either "?live=" or an
 * environment variable's name, and neither is something the owner of a workforce
 * types, owns or can act on. What they need is the value that was not
 * understood, what is accepted instead, and a way back — all three of which are
 * below.
 *
 * A server component: no state, no effects, nothing to hydrate.
 */
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import styles from "./live-approvals.module.css";

export default function LaneRefusal({
  value,
  accepted,
}: {
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
          This address asked for an inbox that does not exist
        </p>
        <p className={styles.errorDetail}>
          It asked for <strong>{value === "" ? "(blank)" : value}</strong>, and what is
          accepted is {accepted}.
        </p>
        <p>
          Two inboxes answer this address: a set of sample approvals, and your own, which
          decides real work your agents have paused.
        </p>
        <p>
          Nothing was chosen for you, on purpose. Falling back to the samples would put
          decisions that change nothing in front of someone who asked for their own.
        </p>
      </div>

      <div className="oa-cluster" style={{ marginTop: 14 }}>
        <Link
          href="/app/workspace/approvals?live=1"
          className="oa-btn oa-btn--primary oa-btn--sm"
        >
          Open your approvals
        </Link>
        <Link
          href="/app/workspace/approvals?live=0"
          className="oa-btn oa-btn--ghost oa-btn--sm"
        >
          Open the sample approvals
        </Link>
      </div>
    </main>
  );
}
