"use client";
/**
 * components/live/deploy/ui/GateChecklist.tsx — the go-live gates, exactly as
 * the runtime reports them, wearing the demo checklist's anatomy.
 *
 * ADAPTED FROM components/mock/deploy/DeployChecklist.tsx, and what was dropped
 * matters as much as what was kept. The demo store, the acknowledgement
 * checkboxes, the channel picker and the entrance stagger are all gone: nothing
 * on a live gate is a thing an owner ticks, because the runtime re-derives
 * every gate on every read and a checkbox would imply a human can open one from
 * here. What is kept is the stylesheet itself — the mock deploy.module.css,
 * IMPORTED rather than copied, the same way the approvals and integrations
 * lanes wear their demo shells — so the real checklist is visibly the same
 * product as the demo one instead of a near-miss of it. That file is read-only
 * from this lane: it belongs to the scripted screens, and editing it would
 * change the demo, which must not move.
 *
 * THE MOCK LOOK, THE RUNTIME WORDS. A gate's `label` and `detail` and every
 * blocker's `message` are rendered verbatim, and blockers are linked with the
 * `href` the runtime attached rather than with a route table kept here.
 * lib/runtime/schedule/activation.ts writes those sentences with care — "a
 * sweep that was skipped is missing evidence, not a pass" — and each one is the
 * difference between an owner knowing what to do and knowing only that
 * something is wrong. This file adds the demo's framing and takes nothing away.
 *
 * A SHUT GATE IS NOT AN ERROR AND IS NOT STYLED AS ONE. It gets the demo
 * checklist's amber "waiting" lead and the word "Blocked" on the badge — the
 * exact treatment the demo gave a step that was not finished yet — never red
 * and never the vocabulary of a crash. It is the checklist working.
 *
 * EVERY GATE THE RUNTIME SENDS IS RENDERED, INCLUDING ONE THIS BUILD HAS NEVER
 * HEARD OF. An unrecognised id keeps its whole row and loses only the icon and
 * the one line of framing (`gateMeta` returns null; `leadIcon` falls back). A
 * checklist screen that dropped a gate it did not recognise would be the single
 * worst bug available here — three green rows in front of a button that a
 * fourth, invisible gate was refusing.
 *
 * NO BLOCKER IS EVER COLLAPSED, TRUNCATED OR PUT BEHIND A DISCLOSURE. Each one
 * gets the demo's amber warning panel to itself, whole. There is no "and 3
 * more"; each is a separate thing somebody has to go and fix.
 */

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  FlaskConical,
  HelpCircle,
  PackageCheck,
  Plug,
} from "lucide-react";
import StatusBadge from "@/components/mock/ui/StatusBadge";
import type { ChecklistView, GateView } from "../api";
import { gateMeta } from "../format";
import shell from "@/components/mock/deploy/deploy.module.css";
import live from "../deploy.module.css";

/**
 * The demo checklist chose an icon per step; the three gates inherit the same
 * three. Decided by a switch rather than by membership of a union, for the
 * reason ../api.ts reads `gate.id` open: a fourth gate added to the runtime
 * must still arrive — with the neutral icon — rather than not arrive.
 */
function leadIcon(id: string): typeof PackageCheck {
  switch (id) {
    case "packages":
      return PackageCheck;
    case "sandbox":
      return FlaskConical;
    case "integrations":
      return Plug;
    default:
      return HelpCircle;
  }
}

export default function GateChecklist({ checklist }: { checklist: ChecklistView }) {
  const total = checklist.gates.length;
  return (
    <div className={shell.list}>
      {checklist.gates.map((gate, index) => (
        <GateItem key={gate.id} gate={gate} index={index} total={total} />
      ))}

      {/* A checklist with no gates at all is not a checklist that passed. The
          runtime derives `ready` from `gates.every(...)`, and `[].every(...)`
          is true, so an empty list would arrive as `ready: true` with nothing
          behind it. Said out loud in a row of its own rather than rendered as
          a clean, empty section. */}
      {total === 0 && (
        <section className={`oa-card oa-card--flat ${shell.item}`} aria-label="No checks reported">
          <span className={`${shell.lead} ${shell.leadWait}`} aria-hidden>
            <AlertTriangle size={16} />
          </span>
          <div className={shell.body}>
            <div className={shell.head}>
              <div className={shell.titleWrap}>
                <h2 className={shell.title}>No checks were reported</h2>
              </div>
              <StatusBadge status="pending" label="Unproven" />
            </div>
            <div className={shell.evidence}>
              <p className={shell.evLine}>
                <AlertTriangle size={14} className={shell.evIconWarn} aria-hidden />
                <span>
                  Nothing came back with any checks in it. An empty list counts as
                  &ldquo;everything passed&rdquo; without anything having been checked, so
                  nothing on this screen will treat this workforce as ready — whatever it
                  claims.
                </span>
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function GateItem({
  gate,
  index,
  total,
}: {
  gate: GateView;
  index: number;
  total: number;
}) {
  const meta = gateMeta(gate.id);
  const Icon = leadIcon(gate.id);
  return (
    <section
      /* Anchored so the activate card's "before this can go live" list can link
         back here — the demo's own #chk-* pattern, with the runtime's ids. */
      id={`gate-${gate.id}`}
      className={`oa-card oa-card--flat ${shell.item}`}
      aria-labelledby={`gate-title-${gate.id}`}
    >
      {/* The demo's lead square: teal check once satisfied, amber icon while
          shut. The badge beside the title carries the word, so this is the
          second signal rather than the only one. */}
      <span
        className={`${shell.lead} ${gate.satisfied ? shell.leadOk : shell.leadWait}`}
        aria-hidden
      >
        {gate.satisfied ? <Check size={17} /> : <Icon size={16} />}
      </span>

      <div className={shell.body}>
        <div className={shell.head}>
          <div className={shell.titleWrap}>
            {/* Counted from the response, never hardcoded: the demo said
                "Step 1 of 8" from a list it owned, and this list is the
                runtime's. */}
            <span className={shell.stepNo}>
              Check {index + 1} of {total}
            </span>
            {/* The runtime's own label, verbatim. */}
            <h2 id={`gate-title-${gate.id}`} className={shell.title}>
              {gate.label}
            </h2>
            {/* One line of our framing — what the gate is FOR — and nothing
                when the id is unfamiliar: the runtime's label, detail and
                blockers are already the authoritative account of it. */}
            {meta !== null && (
              <p className="oa-sub">{gate.satisfied ? meta.what : meta.whenShut}</p>
            )}
          </div>
          {/* The demo's badge component, the runtime's verdict words. */}
          {gate.satisfied ? (
            <StatusBadge status="ready" label="Passed" />
          ) : (
            <StatusBadge status="pending" label="Not ready" />
          )}
        </div>

        <div className={shell.evidence}>
          {/* The runtime's one-line status, whether or not the gate is open —
              "12 of 12 agents built and current", "0 of 24 scenarios passed". */}
          <p className={shell.evLine}>
            {gate.satisfied ? (
              <Check size={14} className={shell.evIcon} aria-hidden />
            ) : (
              <AlertTriangle size={14} className={shell.evIconWarn} aria-hidden />
            )}
            <span>{gate.detail}</span>
          </p>

          {gate.blockers.map((blocker, blockerIndex) => (
            <div key={`${gate.id}-${blockerIndex}`} className={shell.warnPanel}>
              <p className={shell.warnTitle}>
                <AlertTriangle size={14} aria-hidden />
                What to fix ({blockerIndex + 1} of {gate.blockers.length})
              </p>
              {/* Verbatim. This is the whole point of the component. */}
              <p className={shell.warnBody}>{blocker.message}</p>
              <span className={live.blockerMeta}>
                {blocker.agentId !== null && (
                  <span className={live.blockerTag}>Agent: {blocker.agentId}</span>
                )}
                {blocker.integrationId !== null && (
                  <span className={live.blockerTag}>Tool: {blocker.integrationId}</span>
                )}
                {/* The runtime's own route to the fix, not ours. */}
                <Link href={blocker.href} className="oa-btn oa-btn--ghost oa-btn--sm">
                  Take me there
                  <ArrowRight size={13} aria-hidden />
                </Link>
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
