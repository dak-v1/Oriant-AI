/**
 * LaneRefusal — what `/app/workspace/integrations` renders when the lane switch
 * was given a value this build does not implement.
 *
 * It exists so the alternative never happens. Somebody who typed `?live=tru`
 * asked for the view that reports which tools are really connected; handing them
 * the scripted screen instead would show eight tools connected, a Connect button
 * that walks a four-step wizard, and no sign that any of it is a fixture. The
 * lie would only surface at go-live.
 *
 * THE SETTING'S OWN NAME IS NOT PRINTED — see the Approvals copy of this
 * component. It is either "?live=" or an environment variable, and neither is
 * something the reader of this page owns or can act on. The value, the accepted
 * forms and both ways out are.
 *
 * A server component: no state, no effects, nothing to hydrate.
 */
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import styles from "./live-integrations.module.css";

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
        <p className="oa-eyebrow">Operate · Integrations</p>
        <h1 className="oa-h1">
          Which <span className="oa-serif">connections?</span>
        </h1>
      </header>

      <div className={styles.errorBox} role="alert">
        <p className={styles.errorTitle}>
          <AlertTriangle size={15} aria-hidden />
          This address asked for a screen that does not exist
        </p>
        <p className={styles.errorDetail}>
          It asked for <strong>{value === "" ? "(blank)" : value}</strong>, and what is
          accepted is {accepted}.
        </p>
        <p>
          Two screens answer this address: a set of sample connections, and your own, which
          reports what your agents can actually reach.
        </p>
        <p>
          Nothing was chosen for you, on purpose. The sample screen shows every tool connected
          and offers to connect the rest; none of that is real, and putting it in front of
          someone who asked for their own is how a workforce goes live believing its
          connections are in place.
        </p>
      </div>

      <div className="oa-cluster" style={{ marginTop: 14 }}>
        <Link
          href="/app/workspace/integrations?live=1"
          className="oa-btn oa-btn--primary oa-btn--sm"
        >
          Open your connections
        </Link>
        <Link
          href="/app/workspace/integrations?live=0"
          className="oa-btn oa-btn--ghost oa-btn--sm"
        >
          Open the sample connections
        </Link>
      </div>
    </main>
  );
}
