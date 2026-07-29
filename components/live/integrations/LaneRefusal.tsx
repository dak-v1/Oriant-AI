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
 * A server component: no state, no effects, nothing to hydrate.
 */
import { AlertTriangle } from "lucide-react";
import styles from "./live-integrations.module.css";

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
        <p className="oa-eyebrow">Operate · Integrations</p>
        <h1 className="oa-h1">
          Which <span className="oa-serif">connections?</span>
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
          Two screens answer this URL: the scripted connections screen and the live view
          backed by the integrations registry the runtime actually calls. Accepted values are{" "}
          {accepted}.
        </p>
        <p>
          Nothing was rendered instead, on purpose. The scripted screen shows every tool
          connected and offers to connect the rest; none of that reaches the runtime, and
          putting it in front of somebody who asked in writing for the live view is how a
          workforce reaches go-live believing its connections are in place.
        </p>
      </div>

      <div className={styles.stateBox} style={{ marginTop: 14 }}>
        <p className={styles.stateTitle}>Where to go from here</p>
        <ol className={styles.stateSteps}>
          <li>
            The scripted screen: <code>/app/workspace/integrations</code>, or{" "}
            <code>/app/workspace/integrations?live=0</code> if a deployment has switched the
            default over.
          </li>
          <li>
            The live view: <code>/app/workspace/integrations?live=1</code>.
          </li>
        </ol>
      </div>
    </main>
  );
}
