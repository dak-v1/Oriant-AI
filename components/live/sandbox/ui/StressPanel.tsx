"use client";
/**
 * StressPanel — the stress sweep's own cases, in the main panel.
 *
 * ADAPTED FROM components/mock/sandbox/StressPanel.tsx. The case list, the
 * "cases needing attention first, passed cases behind an accordion" shape and
 * the accordion button are the mock's, class for class. What is gone is the
 * mock's fast progress strip — a 200ms-per-case timer counting to twenty while
 * nothing ran — because the sweep executes inside the suite request and there is
 * no progress to show. What is added is the section that matters most on this
 * page.
 *
 * ── COVERAGE COMES FIRST, ABOVE THE FAILURES ──
 *
 * `lib/runtime/sandbox/smoke-stress.ts` generates a sweep by walking every
 * guardrail boundary a plan implies, and its generator has per-workflow and
 * per-agent ceilings. When a ceiling bites, the cases it refused to emit are
 * boundaries NOBODY CROSSED — and that file reports them as failing rows whose
 * ids begin `coverage-`, because `cases` is the one structure every downstream
 * reader already looks at. Its own header explains why they must not be able to
 * open the gate: the trim is not a sample, so the limits at the end of the array
 * get no boundary walk at all.
 *
 * They are rendered first, under their own heading, and never mixed in with the
 * failures. Both are red and both shut the gate, but they ask opposite things of
 * the reader: a failed case is a guardrail that did not hold and is a bug to
 * fix; a coverage row is a guardrail nobody tested and is work not yet done. A
 * person deciding whether to go live has to be able to tell them apart, and the
 * three summary numbers cannot.
 *
 * ── AND WHEN THE ROWS ARE NOT THERE, THAT IS SAID OUT LOUD ──
 *
 * A runtime whose response carries only `{ total, passed, passRate }` leaves
 * this screen unable to make that distinction at all. It does not guess and it
 * does not quietly render three numbers as though they were the whole story; it
 * prints what it cannot tell apart. See the `cases === null` branch.
 */

import { useState } from "react";
import { ChevronDown, ShieldAlert, TriangleAlert } from "lucide-react";
import type { StressCaseView, StressView } from "../api";
import { isCoverageCase } from "../api";
import StatusBadge from "@/components/mock/ui/StatusBadge";
import styles from "./sandbox.module.css";

function CaseRow({ row, coverage }: { row: StressCaseView; coverage: boolean }) {
  return (
    <div className={`${styles.caseRow} ${coverage ? styles.coverageRow : ""}`}>
      <span className={styles.caseId}>{row.passed ? "ok" : "!"}</span>
      <div className={styles.caseBody}>
        <p className={styles.caseName}>{row.label}</p>
        <p className={coverage ? styles.coverageDetail : styles.caseDetail}>{row.detail}</p>
        <p className={styles.railAgent}>{row.caseId}</p>
      </div>
      <span className={styles.caseBadge}>
        <StatusBadge
          status={row.passed ? "completed" : "failed"}
          label={row.passed ? "Passed" : coverage ? "Not walked" : "Failed"}
        />
      </span>
    </div>
  );
}

export default function StressPanel({
  stress,
  /** Whether a whole-suite run has answered in this tab at all. */
  hasVerdict,
}: {
  stress: StressView | null;
  hasVerdict: boolean;
}) {
  const [passedOpen, setPassedOpen] = useState(false);

  if (!hasVerdict) {
    return (
      <div className={`oa-card oa-card--flat ${styles.empty}`}>
        <div style={{ display: "grid", gap: 6 }}>
          <h3 className="oa-h3">The sweep runs with the suite</h3>
          <p className="oa-sub" style={{ maxWidth: 520 }}>
            There is no separate button for it: the stress sweep and the scenario suite are
            one request, because a verdict without a sweep is one the runtime refuses to call
            ready. Run the suite and every case the sweep walked appears here.
          </p>
        </div>
        <span className="oa-sim-note">
          The sweep is generated from this plan&apos;s own guardrails — its limits, its quiet
          hours, its daily caps — and every case is executed against stubs.
        </span>
      </div>
    );
  }

  if (stress === null) {
    return (
      <div className={`oa-card oa-card--flat ${styles.empty}`}>
        <span className={styles.emptyIcon} aria-hidden style={{ background: "var(--oa-soft-amber)", color: "var(--oa-amber-ink)" }}>
          <ShieldAlert size={20} />
        </span>
        <div style={{ display: "grid", gap: 6 }}>
          <h3 className="oa-h3">No sweep ran</h3>
          <p className="oa-sub" style={{ maxWidth: 520 }}>
            The verdict came back with no stress sweep attached. The runtime treats that as
            absent evidence rather than a pass — the sweep is the only check that walks a
            limit boundary — so the gate is shut and the blocker above says so in its own
            words.
          </p>
        </div>
      </div>
    );
  }

  if (stress.cases === null) {
    return (
      <div className={`oa-card oa-card--flat ${styles.empty}`}>
        <span className={styles.emptyIcon} aria-hidden style={{ background: "var(--oa-soft-amber)", color: "var(--oa-amber-ink)" }}>
          <TriangleAlert size={20} />
        </span>
        <div style={{ display: "grid", gap: 8 }}>
          <h3 className="oa-h3">
            {stress.passed} of {stress.total} cases passed — and this runtime did not send the
            rows
          </h3>
          <p className="oa-sub" style={{ maxWidth: 560 }}>
            The sweep&apos;s response carried three numbers and no per-case detail, so nothing
            below can name a case. That matters more than a missing list usually would:{" "}
            {stress.passed === stress.total
              ? "a sweep also reports the boundaries its generator refused to walk as failing rows, so this screen cannot confirm from these numbers alone that the sweep covered the whole space — only that everything it did report agreed."
              : "a red case here may be a guardrail that did not hold, or it may be a boundary the sweep never walked and reported as missing evidence. Those are opposite problems and these three numbers cannot tell them apart."}
          </p>
        </div>
      </div>
    );
  }

  const coverage = stress.cases.filter(isCoverageCase);
  const failed = stress.cases.filter((row) => !row.passed && !isCoverageCase(row));
  const passed = stress.cases.filter((row) => row.passed);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {coverage.length > 0 && (
        <section aria-label="Coverage the sweep did not walk" style={{ display: "grid", gap: 8 }}>
          <div className="oa-between">
            <p className="oa-micro">Boundaries this sweep never crossed</p>
            <span className="oa-tag oa-tag--amber">Missing evidence, not a failure</span>
          </div>
          <p className="oa-sub" style={{ margin: 0, maxWidth: 640 }}>
            The generator&apos;s ceilings refused to emit these cases, so the guardrails they
            would have tested were never exercised. They are red and they shut the gate, and
            they are not a report that anything misbehaved — they are a report that nothing
            was asked.
          </p>
          <div className={styles.caseList}>
            {coverage.map((row) => (
              <CaseRow key={row.caseId} row={row} coverage />
            ))}
          </div>
        </section>
      )}

      <section aria-label="Cases needing attention" style={{ display: "grid", gap: 8 }}>
        <div className="oa-between">
          <p className="oa-micro">Cases needing attention</p>
          <span className="oa-sub" style={{ fontSize: 11.5 }}>
            {failed.length === 0
              ? "Every case the sweep ran behaved as the plan says it should."
              : `${failed.length} of ${stress.total}`}
          </span>
        </div>
        {failed.length === 0 ? (
          <p className="oa-sub" style={{ margin: 0 }}>
            No guardrail broke. Each case below the fold walked a limit, a quiet-hours window
            or a daily cap declared in this plan, and the runtime answered the way the plan
            says it must.
          </p>
        ) : (
          <div className={styles.caseList}>
            {failed.map((row) => (
              <CaseRow key={row.caseId} row={row} coverage={false} />
            ))}
          </div>
        )}
      </section>

      <div>
        <button
          type="button"
          className={styles.accBtn}
          aria-expanded={passedOpen}
          onClick={() => setPassedOpen((open) => !open)}
        >
          {passed.length} passed {passed.length === 1 ? "case" : "cases"}
          <ChevronDown
            size={15}
            aria-hidden
            className={`${styles.accChevron} ${passedOpen ? styles.accChevronOpen : ""}`}
          />
        </button>
        {passedOpen && (
          <div className={styles.caseList} style={{ marginTop: 8 }}>
            {passed.map((row) => (
              <CaseRow key={row.caseId} row={row} coverage={false} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
