"use client";
/**
 * components/live/build/ui/PackageDrawer.tsx — "Review stored package" in the
 * mock's drawer shell (spec §14), over the store's real record.
 *
 * ADAPTED FROM components/mock/build/PackageDrawer.tsx. The Drawer shell itself
 * is the mock's own component, imported directly — its props fit unchanged.
 * What the body shows had to change with the data:
 *
 *   THE MOCK SHOWED FIXTURE ARTIFACTS in a tabbed CodeViewer — full YAML/JSON
 *   file contents that existed because somebody wrote them into a fixture
 *   table. `GET /api/runtime/build` deliberately returns the package as facts,
 *   not source: a checksum, the built-at instant, and the workflow/operation
 *   counts the validator approved. So the CodeViewer is not reused here —
 *   rendering invented file contents behind a real checksum would be the exact
 *   substitution this lane exists to remove — and the body is the store's
 *   record in the mock's manifest-row styling instead.
 *
 *   THE SIM NOTE IS GONE FOR THE OPPOSITE REASON it existed in the mock: this
 *   output is not simulated. The line in its place says where the record came
 *   from, because "real" is a claim this screen has to earn out loud.
 */

import { Package, Plug2 } from "lucide-react";
import Drawer from "@/components/mock/ui/Drawer";
import type { PackageView, PlanAgentView } from "../api";
import { formatInstant, plural } from "../format";
import styles from "./build.module.css";

export default function PackageDrawer({
  open,
  agent,
  pkg,
  onClose,
}: {
  open: boolean;
  /** The plan agent being reviewed; null before anything was ever opened. */
  agent: PlanAgentView | null;
  /** The stored package for that agent at the plan's version; null when none. */
  pkg: PackageView | null;
  onClose: () => void;
}) {
  return (
    <Drawer
      open={open && agent !== null && pkg !== null}
      onClose={onClose}
      title={agent?.name ?? ""}
      eyebrow="What was built"
      wide
      footer={
        <button type="button" className="oa-btn oa-btn--ghost" onClick={onClose}>
          Close
        </button>
      }
    >
      {agent !== null && pkg !== null && (
        <div style={{ display: "grid", gap: 20 }}>
          <p className="oa-sub">
            What was built for this agent, at version {pkg.agentVersion}. It was saved only
            after it passed its checks, and it is what going live depends on.
          </p>

          <section style={{ display: "grid", gap: 10 }} aria-label="What was built">
            <h3 className="oa-h3">
              <Package size={14} aria-hidden style={{ marginRight: 6, verticalAlign: -2 }} />
              Summary
            </h3>
            <div className={styles.manifestList}>
              <div className={`oa-panel ${styles.manifestRow}`}>
                <p className={styles.manifestName}>Status</p>
                <span className="oa-tag oa-tag--teal">Passed its checks</span>
              </div>
              <div className={`oa-panel ${styles.manifestRow}`}>
                <p className={styles.manifestName}>Built</p>
                <span className="oa-tag oa-tag--neutral">{formatInstant(pkg.builtAt)}</span>
              </div>
              <div className={`oa-panel ${styles.manifestRow}`}>
                <p className={styles.manifestName}>Workflows</p>
                <span className="oa-tag oa-tag--neutral">
                  {plural(pkg.workflows, "workflow", "workflows")}
                </span>
              </div>
              <div className={`oa-panel ${styles.manifestRow}`}>
                <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                  <p className={styles.manifestName}>Permitted actions</p>
                  <p className={styles.manifestSub}>
                    the only things this agent is allowed to do
                  </p>
                </div>
                <span className="oa-tag oa-tag--neutral">
                  {plural(pkg.allowedOperations, "action", "actions")}
                </span>
              </div>
            </div>
          </section>

          <section style={{ display: "grid", gap: 6 }} aria-label="How this is used">
            <h3 className="oa-h3">
              <Plug2 size={14} aria-hidden style={{ marginRight: 6, verticalAlign: -2 }} />
              How this is used
            </h3>
            <p className="oa-sub">
              This saved version is exactly what runs — nothing is rebuilt on the fly. If
              you change this agent&apos;s settings, what is saved here stops matching, the
              agent is listed as not ready until you build again, and this stays as the
              record of what was built.
            </p>
          </section>
        </div>
      )}
    </Drawer>
  );
}
