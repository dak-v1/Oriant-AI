"use client";
/**
 * SandboxScreen — the Sandbox, reporting on the Sandbox, wearing the mock's
 * clothes.
 *
 * WHAT THIS IS. /app/sandbox was the last scripted page in the Build section.
 * It rendered `components/mock/sandbox/SandboxScreen`, a timeline player over
 * `lib/mock/fixtures/sandbox-scenarios.ts`: three authored cases about a named
 * BrightPath customer, a "20-case stress test" whose 18-passed / 1-escalated /
 * 1-failed split was a constant, and a header strip whose "1 of 4 passed" was
 * demo state advanced by a `setTimeout`. None of it called the runtime. The
 * runtime, meanwhile, has GENERATED a scenario suite from whatever plan it holds
 * since M3, run it against the packages the Factory stored, and returned a
 * verdict that Activation gates on — with no surface anywhere in the product.
 *
 * So this file is the reconciliation the Agent Factory already made: the DATA is
 * the runtime's (api.ts and everything it refuses to invent), and the LOOK is
 * the mock's — the test list on the left, the case detail in the middle, the
 * output panel on the right, the numbered step rail along the bottom — reused
 * via components/live/sandbox/ui/**, whose stylesheet is the mock's copied byte
 * for byte.
 *
 * ── SEVEN THINGS IT REFUSES TO GET WRONG ──
 *
 * 1. EVERY TEST IN THE LIST IS ONE THE RUNTIME WILL ACTUALLY JUDGE THIS PLAN BY.
 *    `GET /api/runtime/sandbox` publishes the suite `suiteForPlan` derives for
 *    the plan the runtime currently holds. There is no fixture case anywhere on
 *    this page and no id is hard-coded — one row per scenario the endpoint
 *    published, plus the stress sweep, which is the other half of what the
 *    go-live gate reads.
 *
 * 2. NOTHING IS ANIMATED, AND THE STAGE RAIL SAYS SO. A sandbox run executes
 *    inside one HTTP request and answers once, finished. The five-frame rail is
 *    therefore a SUMMARY of a run that already happened — marked from the events
 *    the run actually emitted, with "never reached" kept distinct from "not
 *    needed here" — and it prints that sentence underneath itself. An invented
 *    progress animation is the exact defect this whole effort has been removing;
 *    components/live/build/ui/stage.ts set the precedent for the Factory's bar
 *    and ui/stages.ts follows it here.
 *
 * 3. A COUNTER IS NEVER STATE THIS SCREEN KEEPS. `passed of total`, `ready`, the
 *    blockers and the sweep's numbers all come out of one verdict, together, and
 *    are rendered as that verdict's own answer. The mock incremented a store.
 *
 * 4. THE TWO DOORS CARRY DIFFERENT AMOUNTS OF THE SAME RESULT, AND THE SCREEN
 *    SAYS WHICH IT IS HOLDING. The suite reply projects each result down to
 *    eight fields and drops the event stream; the single-scenario reply carries
 *    the whole `ScenarioResult`. A suite row with no events renders as "the
 *    reply does not carry them", never as a run that emitted none. See
 *    outcome.ts.
 *
 * 5. AN UNANSWERED READ IS NOT AN EMPTY SANDBOX. Until something has answered,
 *    `heardFrom` is false and no rail, no strip and no verdict is drawn — an
 *    empty page here would say this plan has nothing to prove and nothing has
 *    failed, and that is the absence of an answer rather than an answer. This
 *    discipline has been reintroduced by accident twice in this repository; the
 *    reskin must not make a third.
 *
 * 6. A GREEN VERDICT MUST NAME ITS OWN WORKFORCE. "Ready for activation" earned
 *    against the built-in demo plan is the same six words as one earned against
 *    the owner's, and `PlanSourceNotice` is the difference. The verdict's own
 *    `planId` is compared against the library's too, so an ingest landing
 *    between the two cannot let one plan's evidence vouch for another's agents —
 *    and when a runtime does not send it, the Continue link says the check could
 *    not be made rather than assuming it passed.
 *
 * 7. A SWEEP THAT COVERED LESS THAN THE WHOLE SPACE SAYS SO HERE, where the
 *    decision to go live is made. `lib/runtime/sandbox/smoke-stress.ts` reports
 *    boundaries its ceilings refused to walk as failing cases prefixed
 *    `coverage-`; the stress panel lists them first, under their own heading, and
 *    never mixed in with guardrails that actually broke.
 *
 * WHAT THE CHANGE STREAM CAN AND CANNOT DO FOR THIS SCREEN is stated on
 * `SANDBOX_TOPICS` and on screen: the plan is not in the events route's
 * vocabulary, so an ingest in another tab does not push a frame here.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  FlaskConical,
  HelpCircle,
  Info,
  Loader2,
  Radio,
  RefreshCw,
  ShieldCheck,
  WifiOff,
} from "lucide-react";
import type { RuntimeEventsStatus, RuntimeTopic } from "@/components/live/useRuntimeEvents";
import { useRuntimeEvents } from "@/components/live/useRuntimeEvents";
import Drawer from "@/components/mock/ui/Drawer";
import StatusBadge from "@/components/mock/ui/StatusBadge";
import type { ApiFailure, LibraryView, ScenarioRunView, VerdictView } from "./api";
import {
  fetchLibrary,
  fetchPlanSource,
  flattenLibrary,
  runOneScenario,
  runSuite,
} from "./api";
import { plural } from "./format";
import type { TestOutcome } from "./outcome";
import PlanSourceNotice, { type SourceState } from "./PlanSourceNotice";
import OutputPanel from "./ui/OutputPanel";
import ScenarioMain from "./ui/ScenarioMain";
import ScenarioRail, { type EntryStatus, type RailEntry } from "./ui/ScenarioRail";
import styles from "./sandbox.module.css";
import ui from "./ui/sandbox.module.css";

/**
 * What this screen wakes for — and, more to the point, what it cannot.
 *
 * THE PLAN IS NOT ON THE STREAM. `/api/runtime/events` fingerprints runs,
 * approvals, schedule, agent runtime states and the active deployment. The
 * ingested plan is in none of them, so a handoff ingested by curl or on
 * /app/pipeline in another tab does not push a new scenario library here. These
 * two topics are the honest adjacent facts: an activation changes `deployment`,
 * and agent state records move with it. Both mean "the workforce moved, re-read
 * the library" — but neither is a plan signal, so the screen also refetches when
 * the tab comes back, offers Refresh, and says all of this in the status line
 * rather than implying a liveness it does not have.
 */
const SANDBOX_TOPICS: RuntimeTopic[] = ["deployment", "agents"];

/** The connection, in one word, before the sentence explaining it. */
const STREAM_WORD = {
  connecting: "Connecting",
  live: "Live",
  reconnecting: "Reconnecting",
  unsupported: "Not live",
} satisfies Record<RuntimeEventsStatus, string>;

/**
 * The rail id for the stress sweep, which is not a scenario and has no id of its
 * own.
 *
 * Double-underscored so it cannot collide with anything the runtime publishes:
 * generated scenario ids are slugs built from an agent id and a workflow
 * (`smoke-helpdesk-agent-inbox-sweep`), and the authored library's are the same
 * shape. A collision would silently select the sweep when somebody clicked a
 * scenario, which is why the token is deliberately un-sluglike rather than
 * merely unlikely.
 */
const STRESS_ENTRY_ID = "__stress_sweep__";

/**
 * WHICH REQUEST FAILED, because the same three kinds mean different things on
 * the two verbs — though less dramatically here than in the Factory, and the
 * difference is worth stating rather than copying.
 *
 * The Factory's POST compiles and stores packages, so a lost reply leaves a
 * question about what was written. This POST writes NOTHING: every tool call is
 * stubbed, the run store is in-memory and discarded, and the route's own header
 * says it is safe to call repeatedly. What a failed run costs is therefore the
 * ANSWER and never the state — which is why pressing Run again is always safe
 * here and why there is no `lostReply` latch on this screen.
 */
type FailurePhase = "read" | "run";

interface Failure {
  kind: ApiFailure["kind"];
  phase: FailurePhase;
  message: string;
  hint: string | null;
}

const FAILURE_TITLE = {
  read: {
    refused: "The runtime would not say what it would prove",
    unreachable: "The runtime could not be reached",
    malformed: "The scenario library came back in a shape this screen does not understand",
  },
  run: {
    refused: "The runtime refused the run",
    unreachable: "The run request never got an answer",
    malformed: "The run answered in a shape this screen does not understand",
  },
} satisfies Record<FailurePhase, Record<ApiFailure["kind"], string>>;

const FAILURE_ADVICE = {
  read: {
    refused:
      "This was a read, which runs nothing and proves nothing — so it is not a report about " +
      "the workforce, it is this screen failing to ask. Which scenarios this plan would be " +
      "judged by is unknown until the read succeeds. The runtime's own sentence is above.",
    unreachable:
      "Nothing was sent but the question, and the answer never arrived. This screen therefore " +
      "knows nothing about this runtime — not that it has no tests, not that nothing has been " +
      "proved. Check that the app is running and that /api/runtime/sandbox is reachable from " +
      "this machine, then try again.",
    malformed:
      "Nothing was rendered from it on purpose: a partly-read library would be missing exactly " +
      "the scenario you cannot see is missing. This is a mismatch between this screen and " +
      "/api/runtime/sandbox, and it leaves the suite unread rather than known to be empty.",
  },
  run: {
    refused:
      "Nothing was proved and nothing was changed — a sandbox run writes no packages, no " +
      "deployment and no approvals, so a refusal here costs the answer and nothing else. The " +
      "runtime's own sentence is above; a 404 naming an unknown scenario usually means the " +
      "plan changed between reading the list and pressing the button, and Refresh fixes it.",
    unreachable:
      "The browser never got an answer. The run may have completed on the server, but a " +
      "sandbox run stores nothing anywhere, so there is no state to reconcile and no cost to " +
      "pressing Run again. Check that the app is running, then retry.",
    malformed:
      "Nothing was rendered from it on purpose: a partly-read verdict would be missing exactly " +
      "the failing scenario you cannot see is missing. The request itself landed, so a run did " +
      "happen — its result is simply unreadable by this build.",
  },
} satisfies Record<FailurePhase, Record<ApiFailure["kind"], string>>;

/** True at >=1024px; the output panel moves into a drawer below that. */
function useWide(): boolean {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => setWide(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return wide;
}

/** One scenario's last answer, and when this tab received it. */
interface StampedRun {
  run: ScenarioRunView;
  seq: number;
}

export default function SandboxScreen() {
  const wide = useWide();

  const [library, setLibrary] = useState<LibraryView | null>(null);
  /**
   * Whether this tab has ever been told ANYTHING about this runtime's sandbox.
   * A latch, set only when a read or a run comes back carrying an answer and
   * never cleared. See rule 5 in the header.
   */
  const [heardFrom, setHeardFrom] = useState(false);
  const [reading, setReading] = useState(true);
  /** Cleared by a successful read. */
  const [readFailure, setReadFailure] = useState<Failure | null>(null);
  /** Cleared only by starting another run — a read cannot un-fail a run. */
  const [runFailure, setRunFailure] = useState<Failure | null>(null);

  const [verdict, setVerdict] = useState<VerdictView | null>(null);
  /**
   * The plan this tab believed was current when the suite POST went out.
   *
   * Only ever used when the verdict does NOT carry its own `planId` — an older
   * runtime. It is this screen's recollection rather than the runtime's
   * statement, and it is labelled as such wherever it is shown. Never used to
   * overrule a `planId` the verdict did send.
   */
  const [verdictPlanGuess, setVerdictPlanGuess] = useState<LibraryView | null>(null);
  const [runsById, setRunsById] = useState<ReadonlyMap<string, StampedRun>>(new Map());
  /**
   * Which answer is newer, for a scenario that has both a suite row and a single
   * run. A monotonic stamp rather than "prefer the richer one"; see outcome.ts.
   */
  const [verdictSeq, setVerdictSeq] = useState(0);
  const seq = useRef(0);

  const [running, setRunning] = useState<{ kind: "suite" } | { kind: "scenario"; id: string } | null>(
    null,
  );
  /** Requests whose wait this tab abandoned. Not verdicts — see `onStop`. */
  const [abandoned, setAbandoned] = useState<ReadonlySet<string>>(new Set());

  const [source, setSource] = useState<SourceState>({ kind: "unread" });
  const [sourceChecking, setSourceChecking] = useState(true);
  /** Browser clock — when this tab last got an answer, not a runtime instant. */
  const [readAt, setReadAt] = useState<Date | null>(null);

  const [selectedLocal, setSelectedLocal] = useState<string | null>(null);
  const [outputOpen, setOutputOpen] = useState(false);

  const readAbort = useRef<AbortController | null>(null);
  const sourceAbort = useRef<AbortController | null>(null);
  const runAbort = useRef<AbortController | null>(null);
  /* Read by the guard rather than `running`, so a second press is refused on the
     value as of this instant and not as of the render that made the callback. */
  const busy = useRef(false);

  const stream = useRuntimeEvents(SANDBOX_TOPICS);

  /* One read in flight at a time. A newer trigger — the stream, the button, a
     returning tab — aborts the older one rather than racing it. */
  const load = useCallback(async () => {
    readAbort.current?.abort();
    const controller = new AbortController();
    readAbort.current = controller;
    setReading(true);

    const outcome = await fetchLibrary(controller.signal);
    // An abort is a superseded read, not a failure to report — and it must not
    // blank a view a newer read is about to fill.
    if (controller.signal.aborted) return;

    if (outcome.kind === "library") {
      setLibrary(outcome.library);
      setHeardFrom(true);
      setReadAt(new Date());
      setReadFailure(null);
    } else {
      // Deliberately does NOT clear `library` or `verdict`: a read cannot
      // un-answer what the runtime already said.
      setReadFailure({
        kind: outcome.kind,
        phase: "read",
        message: outcome.message,
        hint: outcome.kind === "refused" ? outcome.hint : null,
      });
    }
    setReading(false);
  }, []);

  const loadSource = useCallback(async () => {
    sourceAbort.current?.abort();
    const controller = new AbortController();
    sourceAbort.current = controller;
    setSourceChecking(true);

    const outcome = await fetchPlanSource(controller.signal);
    if (controller.signal.aborted) return;

    if (outcome.kind === "source") {
      setSource({ kind: "known", source: outcome.source });
    } else {
      /* Note what this does NOT do: fall back to the previous answer or to
         silence. A provenance that was true a minute ago is not evidence now,
         and the whole point of this notice is that the reassuring reading —
         "this verdict is about your workforce" — must never be what a failure
         looks like. */
      setSource({
        kind: "unknown",
        message: outcome.message,
        advice: FAILURE_ADVICE.read[outcome.kind],
      });
    }
    setSourceChecking(false);
  }, []);

  /* The two automatic requests on this screen, and both are reads. A run is
     never made on the screen's own initiative — see `api.runSuite`. */
  useEffect(() => {
    void load();
    void loadSource();
  }, [load, loadSource, stream.revision]);

  useEffect(
    () => () => {
      readAbort.current?.abort();
      sourceAbort.current?.abort();
      /* The run is deliberately NOT aborted here. Aborting it would only drop a
         reply we could still have used; the run is executing on the server
         either way and writes nothing. */
    },
    [],
  );

  /* Somebody may have ingested a plan in the tab they just came from, and that
     pushes nothing. See `SANDBOX_TOPICS`. */
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) {
        void load();
        void loadSource();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load, loadSource]);

  /* Growing past 1024px: the output column takes over from the drawer. */
  useEffect(() => {
    if (wide) setOutputOpen(false);
  }, [wide]);

  /** Records a failure from either verb; both clear the abandoned mark. */
  const noteRunFailure = useCallback((outcome: ApiFailure) => {
    setRunFailure({
      kind: outcome.kind,
      phase: "run",
      message: outcome.message,
      hint: outcome.kind === "refused" ? outcome.hint : null,
    });
  }, []);

  const runWholeSuite = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setRunning({ kind: "suite" });
    /* Clears the BANNER, not the memory: the old failure describes a finished
       attempt and must not be read as this one's result. */
    setRunFailure(null);
    setAbandoned((previous) => {
      const next = new Set(previous);
      next.delete("suite");
      return next;
    });
    // What this tab believes is current AS OF THE PRESS. Used only if the
    // verdict comes back without naming a plan of its own.
    setVerdictPlanGuess(library);

    const controller = new AbortController();
    runAbort.current = controller;
    const outcome = await runSuite(controller.signal);
    busy.current = false;
    setRunning(null);

    if (controller.signal.aborted) {
      // The owner stopped waiting. `onStop` has already recorded that; there is
      // nothing to render from a reply we chose not to read.
      return;
    }

    if (outcome.kind === "verdict") {
      seq.current += 1;
      setVerdict(outcome.verdict);
      setVerdictSeq(seq.current);
      setHeardFrom(true);
    } else {
      noteRunFailure(outcome);
    }
    // The library is re-read after every outcome, because a 404 or a changed
    // verdict is most often a plan that moved under this tab.
    void load();
  }, [library, load, noteRunFailure]);

  const runScenario = useCallback(
    async (scenarioId: string) => {
      if (busy.current) return;
      busy.current = true;
      setRunning({ kind: "scenario", id: scenarioId });
      setRunFailure(null);
      setAbandoned((previous) => {
        const next = new Set(previous);
        next.delete(scenarioId);
        return next;
      });

      const controller = new AbortController();
      runAbort.current = controller;
      const outcome = await runOneScenario(scenarioId, controller.signal);
      busy.current = false;
      setRunning(null);

      if (controller.signal.aborted) return;

      if (outcome.kind === "run") {
        seq.current += 1;
        const stamp = seq.current;
        setRunsById((previous) => {
          const next = new Map(previous);
          next.set(outcome.run.scenarioId, { run: outcome.run, seq: stamp });
          return next;
        });
        setHeardFrom(true);
      } else {
        noteRunFailure(outcome);
        void load();
      }
    },
    [load, noteRunFailure],
  );

  /**
   * Stop waiting — which is all it can be.
   *
   * The run is executing inside an HTTP request on the server and there is no
   * cancel endpoint; aborting the fetch drops the reply and nothing else. That
   * is honest to offer because a sandbox run writes nothing, so an abandoned run
   * leaves no half-finished state anywhere — but it is NOT a stop, and the entry
   * is marked "Answer not received" rather than "Stopped" so nobody reads it as
   * a verdict.
   */
  const onStop = useCallback(() => {
    const inFlight = running;
    if (inFlight === null) return;
    runAbort.current?.abort();
    busy.current = false;
    setRunning(null);
    setAbandoned((previous) => {
      const next = new Set(previous);
      next.add(inFlight.kind === "suite" ? "suite" : inFlight.id);
      return next;
    });
  }, [running]);

  const refresh = useCallback(() => {
    void load();
    void loadSource();
  }, [load, loadSource]);

  /**
   * The runtime has not been heard from, and so nothing on this screen may say
   * what it has or has not proved. See rule 5 in the header.
   */
  const unheard = !heardFrom;

  const scenarios = useMemo(
    () => (library === null ? [] : flattenLibrary(library)),
    [library],
  );

  /** The verdict's row per scenario, for the outcome resolution below. */
  const verdictRows = useMemo(() => {
    const rows = new Map<string, VerdictView["results"][number]>();
    for (const row of verdict?.results ?? []) rows.set(row.scenarioId, row);
    return rows;
  }, [verdict]);

  /**
   * Which answer this screen is holding about one scenario.
   *
   * Newest wins, by stamp. A suite run after a single run supersedes it, and a
   * single run after a suite supersedes that row — see outcome.ts for why
   * preferring the richer answer would be wrong.
   */
  const outcomeFor = useCallback(
    (scenarioId: string): TestOutcome => {
      const single = runsById.get(scenarioId);
      const row = verdictRows.get(scenarioId);
      if (single !== undefined && (row === undefined || single.seq > verdictSeq)) {
        return { kind: "run", run: single.run };
      }
      if (row !== undefined) return { kind: "suite", row };
      return { kind: "none" };
    },
    [runsById, verdictRows, verdictSeq],
  );

  const statusFor = useCallback(
    (scenarioId: string): EntryStatus => {
      if (running?.kind === "scenario" && running.id === scenarioId) return "running";
      if (running?.kind === "suite") return "running";
      const outcome = outcomeFor(scenarioId);
      if (outcome.kind === "none") {
        return abandoned.has(scenarioId) || abandoned.has("suite") ? "abandoned" : "not_run";
      }
      return (outcome.kind === "run" ? outcome.run.passed : outcome.row.passed)
        ? "passed"
        : "failed";
    },
    [abandoned, outcomeFor, running],
  );

  const stress = verdict?.stress ?? null;
  const stressStatus: EntryStatus =
    running?.kind === "suite"
      ? "running"
      : verdict === null
        ? abandoned.has("suite")
          ? "abandoned"
          : "not_run"
        : stress === null
          ? "failed"
          : stress.passed === stress.total
            ? "passed"
            : "failed";

  const entries: RailEntry[] = useMemo(() => {
    if (library === null) return [];
    const rows: RailEntry[] = library.categories.flatMap((group) =>
      group.scenarios.map((scenario) => {
        const outcome = outcomeFor(scenario.id);
        const finalStatus =
          outcome.kind === "run"
            ? outcome.run.finalStatus
            : outcome.kind === "suite"
              ? outcome.row.finalStatus
              : undefined;
        return {
          id: scenario.id,
          name: scenario.name,
          category: group.category,
          agentId: scenario.agentId,
          status: statusFor(scenario.id),
          note: finalStatus,
        };
      }),
    );
    rows.push({
      id: STRESS_ENTRY_ID,
      name: "Stress sweep",
      category: "Boundaries",
      agentId: null,
      status: stressStatus,
      note:
        stress === null
          ? verdict === null
            ? undefined
            : "no sweep ran"
          : `${stress.passed} of ${stress.total} cases`,
    });
    return rows;
  }, [library, outcomeFor, statusFor, stress, stressStatus, verdict]);

  const firstId = scenarios[0]?.id ?? STRESS_ENTRY_ID;
  /* A selection made before a re-read can name a scenario the new library does
     not contain. Falling back to the first row is the only honest option: the
     alternative is a detail panel about a case this plan will never be judged
     by, which is the whole class of bug this screen replaced. */
  const selectedId =
    selectedLocal !== null &&
    (selectedLocal === STRESS_ENTRY_ID || scenarios.some((s) => s.id === selectedLocal))
      ? selectedLocal
      : firstId;
  const isStressSelected = selectedId === STRESS_ENTRY_ID;
  const selectedScenario = scenarios.find((s) => s.id === selectedId) ?? null;
  const selectedOutcome: TestOutcome = isStressSelected
    ? { kind: "none" }
    : outcomeFor(selectedId);

  const locked = running !== null;
  const canRunSuite = library !== null && library.total > 0 && !locked;
  const canRunSelected = !locked && !isStressSelected && selectedScenario !== null;

  const selectedRunLabel = isStressSelected
    ? "Run the whole suite"
    : selectedOutcome.kind === "none"
      ? "Run this test"
      : "Run again";

  /* ── Is the verdict about the plan the library just described? ──
     Three answers, and the middle one is the reason this exists at all. */
  const verdictPlanId = verdict?.planId ?? null;
  const planMismatch =
    verdict !== null &&
    verdictPlanId !== null &&
    library !== null &&
    (verdictPlanId !== library.planId || verdict.planVersion !== library.planVersion);
  const planUnstated = verdict !== null && verdictPlanId === null;

  /* Has any single run landed since the verdict? If so the verdict's own numbers
     are the older answer for that scenario, and the Continue banner says so
     rather than being quietly wrong. */
  const supersededByRun = [...runsById.values()].some((stamped) => stamped.seq > verdictSeq);

  const readyToContinue = verdict !== null && verdict.ready && !planMismatch;

  const output = (
    <OutputPanel
      isStress={isStressSelected}
      outcome={selectedOutcome}
      stress={stress}
      hasVerdict={verdict !== null}
    />
  );

  const entryName = isStressSelected ? "Stress sweep" : (selectedScenario?.name ?? "Test");

  return (
    <main className="oa-page">
      <header className={`oa-between ${styles.head}`}>
        <div className={styles.headTitles}>
          <p className="oa-eyebrow">Runtime · Sandbox</p>
          <h1 className="oa-h1">
            Prove the workforce in a <span className="oa-serif">sandbox</span>
          </h1>
          <p className="oa-lead">
            Every test below was generated by the runtime from the plan it is holding, and
            every result is one it judged in code. There is no simulation on this page: the
            scenarios, the pass and fail, the failure lines and the stress sweep all came from{" "}
            <code>/api/runtime/sandbox</code>.
          </p>
          <div className={styles.headTags}>
            {library === null ? (
              <span className="oa-tag oa-tag--neutral">Plan unknown</span>
            ) : (
              <span className="oa-tag oa-tag--neutral">
                Plan {library.planId} · v{library.planVersion}
              </span>
            )}
            {verdict !== null &&
              (verdict.ready ? (
                <span className="oa-tag oa-tag--teal">Every gate this suite can open is open</span>
              ) : (
                <span className="oa-tag oa-tag--amber">
                  {plural(verdict.blockers.length, "blocker", "blockers")}
                </span>
              ))}
          </div>
        </div>

        <div className={styles.headActions}>
          <div className={styles.headButtons}>
            <button
              type="button"
              className="oa-btn oa-btn--primary"
              onClick={() => void runWholeSuite()}
              disabled={!canRunSuite}
            >
              {running?.kind === "suite" ? (
                <Loader2 size={15} className="oa-spin" aria-hidden />
              ) : (
                <FlaskConical size={15} aria-hidden />
              )}
              {running?.kind === "suite" ? "Running the suite…" : "Run the whole suite"}
            </button>
            <button
              type="button"
              className="oa-btn oa-btn--ghost oa-btn--sm"
              onClick={refresh}
              disabled={reading && !heardFrom}
            >
              <RefreshCw size={13} className={reading ? "oa-spin" : ""} aria-hidden />
              Refresh
            </button>
          </div>
          <p className="oa-micro">
            The suite and the stress sweep are one request: the runtime refuses to call a
            verdict ready without a sweep, so there is no cheaper answer to ask for. It writes
            nothing and can be run as often as you like.
          </p>
        </div>
      </header>

      {/* Above everything, in every state. See PlanSourceNotice. */}
      <PlanSourceNotice
        state={source}
        suitePlanId={library?.planId ?? null}
        checking={sourceChecking}
      />

      {/* The live region is the CONNECTION and nothing else: `role="status"` is
          atomic, and folding the read stamp in would have a screen reader recite
          the whole line on every refetch. */}
      <p className={styles.stream}>
        <span className={styles.streamState} role="status">
          <StreamIcon status={stream.status} />
          <span className={styles.streamWord}>{STREAM_WORD[stream.status]}</span>
          <span className={styles.streamDetail}>
            {stream.detail} The plan itself is not pushed by anything: a handoff ingested
            elsewhere reaches this page when you come back to this tab, when you press Refresh,
            or when a go-live moves one of the topics this screen listens to.
          </span>
        </span>
        <span className={styles.streamRead}>
          {reading
            ? "Reading now."
            : readAt === null
              ? "Nothing has been read yet."
              : `Library last read at ${readAt.toLocaleTimeString()}.`}
        </span>
      </p>

      {runFailure !== null && (
        <div className={styles.errorBox} role="alert">
          <p className={styles.boxTitle}>
            <AlertTriangle size={16} aria-hidden />
            {FAILURE_TITLE.run[runFailure.kind]}
          </p>
          <p className={styles.boxDetail}>{runFailure.message}</p>
          {runFailure.hint !== null && <p>{runFailure.hint}</p>}
          <p>{FAILURE_ADVICE.run[runFailure.kind]}</p>
        </div>
      )}

      {readFailure !== null && (
        <div className={styles.errorBox} role="alert">
          <p className={styles.boxTitle}>
            <AlertTriangle size={16} aria-hidden />
            {library !== null ? "This test list is out of date" : FAILURE_TITLE.read[readFailure.kind]}
          </p>
          <p className={styles.boxDetail}>{readFailure.message}</p>
          {readFailure.hint !== null && <p>{readFailure.hint}</p>}
          <p>{FAILURE_ADVICE.read[readFailure.kind]}</p>
          {library !== null && (
            <p>
              The tests below are what the runtime last confirmed
              {readAt === null ? "" : `, at ${readAt.toLocaleTimeString()}`}. A handoff may have
              been ingested since, in which case this plan — and every scenario generated from
              it — has changed and this screen would not know. They are kept on purpose: an
              empty page would read as &ldquo;this workforce has nothing to prove and nothing
              is wrong&rdquo;.
            </p>
          )}
          <div>
            <button
              type="button"
              className="oa-btn oa-btn--ghost oa-btn--sm"
              onClick={refresh}
              disabled={reading}
            >
              <RefreshCw size={13} className={reading ? "oa-spin" : ""} aria-hidden />
              Try again
            </button>
          </div>
        </div>
      )}

      {abandoned.size > 0 && running === null && (
        <div className={styles.warnBox} role="alert">
          <p className={styles.boxTitle}>
            <AlertTriangle size={16} aria-hidden />
            This tab stopped waiting for {abandoned.size === 1 ? "a run" : "some runs"}
          </p>
          <p>
            Stop abandons the wait, not the run: the scenario was executing inside an HTTP
            request on the server and there is no way to call it back. Nothing was written —
            a sandbox run stores no package, no deployment and no approval — so the only thing
            lost is the answer. Those entries read &ldquo;answer not received&rdquo; rather
            than passed or failed, because this tab does not know which they were.
          </p>
        </div>
      )}

      {planMismatch && (
        <div className={styles.warnBox} role="alert">
          <p className={styles.boxTitle}>
            <AlertTriangle size={16} aria-hidden />
            The verdict below is about a different plan
          </p>
          <p>
            It reports plan <code>{verdictPlanId}</code> version {verdict?.planVersion}, and the
            library now describes <code>{library?.planId}</code> version {library?.planVersion}.
            The most likely reason is a handoff ingested since the suite ran. Whichever it was,
            those results are evidence about the other workforce and say nothing about the
            tests listed here — so the go-live link is withheld until the suite is run again.
          </p>
        </div>
      )}

      {/* The workspace is withheld in the unheard state rather than rendered
          empty. Zero tests is an answer — "this plan has nothing to prove" — and
          it is the wrong one when the truth is that nobody could ask. */}
      {unheard ? (
        <div className={styles.stateBox} aria-busy={reading}>
          <p className={styles.boxTitle}>
            {reading ? (
              <Loader2 size={17} className="oa-spin" aria-hidden />
            ) : (
              <HelpCircle size={17} aria-hidden />
            )}
            {reading
              ? "Reading the tests this plan would be judged by…"
              : "What this runtime would prove is not known"}
          </p>
          <p>
            No tests are listed, on purpose. An empty list here would say this plan has nothing
            to prove and nothing has failed, and this is the absence of an answer rather than
            an answer.
          </p>
          {!reading && (
            <p>
              A workforce may be fully proved on this server, or nothing may ever have been
              run. The banner above says which request went unanswered, and until one answers,
              nothing on this tab can tell the two apart.
            </p>
          )}
        </div>
      ) : library !== null && library.total === 0 ? (
        <div className={styles.stateBox}>
          <p className={styles.boxTitle}>
            <Info size={17} aria-hidden />
            There is nothing here to prove
          </p>
          <p>
            The runtime answered, and it could generate no scenario at all for the plan it is
            holding — <code>{library.planId}</code>, version {library.planVersion}. That is not
            a sandbox failure; it means the plan has no agent with an enabled workflow to run.
            The go-live gate treats an agent with no scenario as not ready, so a plan in this
            state cannot be activated.
          </p>
          <div>
            <Link href="/app/pipeline" className="oa-btn oa-btn--soft oa-btn--sm">
              Ingest a handoff
              <ArrowRight size={13} aria-hidden />
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* ── Zone 1: the verdict's own numbers ──
              Every value here comes out of one verdict together. Before a run
              they are em-dashes rather than zeros: "0 passed" and "not run yet"
              are different facts and only one of them is true. */}
          <section className={ui.summary} aria-label="Sandbox verdict">
            <div className={ui.summaryItem}>
              <p className="oa-micro">Scenarios passed</p>
              <p className={ui.summaryValue}>
                {verdict === null ? "—" : verdict.passed}
                <span className={ui.summaryOf}>
                  of {verdict === null ? (library?.total ?? 0) : verdict.total}
                </span>
              </p>
              <p className={ui.summaryNote}>
                {verdict === null
                  ? "Nothing has been run in this tab. The count on the left is how many tests this plan would be judged by."
                  : "Judged in code against each scenario's declared expectations."}
              </p>
            </div>
            <div className={ui.summaryItem}>
              <p className="oa-micro">Scenarios failed</p>
              <p className={ui.summaryValue}>{verdict === null ? "—" : verdict.failed}</p>
              <p className={ui.summaryNote}>
                {verdict === null
                  ? "Not yet known."
                  : verdict.failed === 0
                    ? "No scenario failed in the run this verdict came from."
                    : "Each one carries the judge's own lines; select it to read them."}
              </p>
            </div>
            <div className={ui.summaryItem}>
              <p className="oa-micro">Stress cases passed</p>
              <p className={ui.summaryValue}>
                {stress === null ? "—" : stress.passed}
                <span className={ui.summaryOf}>{stress === null ? "" : `of ${stress.total}`}</span>
              </p>
              <p className={ui.summaryNote}>
                {verdict === null
                  ? "The sweep runs with the suite."
                  : stress === null
                    ? "No sweep ran, which the runtime treats as absent evidence rather than a pass."
                    : "Boundaries this plan's own guardrails declare."}
              </p>
            </div>
            <div className={ui.summaryItem}>
              <p className="oa-micro">Ready for activation</p>
              <div>
                {verdict === null ? (
                  <StatusBadge status="neutral" label="Not proved in this tab" />
                ) : verdict.ready ? (
                  <StatusBadge status="completed" label="Ready" />
                ) : (
                  <StatusBadge status="failed" label="Blocked" />
                )}
              </div>
              <p className={ui.summaryNote}>
                {verdict === null
                  ? "This is the runtime's own verdict, not a count kept here. Run the suite to earn one."
                  : verdict.ready
                    ? "The same verdict the go-live gate re-derives when you get there."
                    : `${plural(verdict.blockers.length, "reason", "reasons")} below.`}
              </p>
            </div>
          </section>

          {/* Why the gate is shut, in `runSuite`'s own words, never paraphrased. */}
          {verdict !== null && verdict.blockers.length > 0 && (
            <div className={styles.warnBox}>
              <p className={styles.boxTitle}>
                <AlertTriangle size={16} aria-hidden />
                Why this workforce cannot go live yet
              </p>
              <ul className={styles.blockerList}>
                {verdict.blockers.map((blocker) => (
                  <li key={blocker} className={styles.blockerRow}>
                    <AlertTriangle size={14} aria-hidden />
                    <span>{blocker}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {readyToContinue && (
            <section className={ui.banner} aria-label="Sandbox verdict is ready">
              <span className={ui.bannerIcon} aria-hidden>
                <ShieldCheck size={20} />
              </span>
              <div className={ui.bannerBody}>
                <h2 className="oa-h3">
                  {verdict.passed} of {verdict.total} scenarios and{" "}
                  {stress === null ? "no" : `${stress.passed} of ${stress.total}`} stress cases
                  passed
                </h2>
                <p className="oa-sub">
                  The runtime called this verdict ready, which means every scenario passed,
                  every agent in the plan had at least one, and the sweep ran and passed in
                  full.{" "}
                  {planUnstated
                    ? `This runtime did not name the plan it judged, so this screen could not check that the verdict and the list above are about the same workforce. ${
                        verdictPlanGuess === null
                          ? "This tab had not read a plan when the run was sent, so it cannot even say what it believed was current."
                          : `This tab believed ${verdictPlanGuess.planId} version ${verdictPlanGuess.planVersion} was current when it pressed Run, which is a recollection rather than the runtime's own statement.`
                      } Activation re-derives its own verdict when you get there, and that one is the gate.`
                    : "Activation re-derives it from scratch rather than trusting this one, so a plan edited between here and there closes the gate again."}
                  {supersededByRun &&
                    " One or more tests have been re-run on their own since this verdict; those rows show the newer answer and these totals do not include it."}
                </p>
              </div>
              <Link href="/app/deploy" className="oa-btn oa-btn--primary">
                Continue to activation
                <ArrowRight size={15} aria-hidden />
              </Link>
            </section>
          )}

          <div className={ui.layout}>
            {/* ── Zone 2: the test list ── */}
            <ScenarioRail
              entries={entries}
              selectedId={selectedId}
              onSelect={(id) => setSelectedLocal(id)}
              locked={locked}
              headNote={`${entries.length} shown`}
            />

            {/* ── Zone 3: the case detail ── */}
            <ScenarioMain
              isStress={isStressSelected}
              name={isStressSelected ? "Stress sweep" : (selectedScenario?.name ?? "")}
              description={
                isStressSelected
                  ? "Every boundary this plan's guardrails imply, walked once: policy limits crossed from just inside to just outside, quiet-hours windows, and daily caps. Cases the generator's ceilings refused to emit are reported here as missing evidence rather than dropped."
                  : (selectedScenario?.description ?? "")
              }
              category={
                isStressSelected
                  ? "Boundaries"
                  : (entries.find((entry) => entry.id === selectedId)?.category ?? "")
              }
              agentId={isStressSelected ? null : (selectedScenario?.agentId ?? null)}
              scenarioId={isStressSelected ? null : (selectedScenario?.id ?? null)}
              outcome={selectedOutcome}
              stress={stress}
              hasVerdict={verdict !== null}
              runLabel={
                running?.kind === "scenario" && running.id === selectedId
                  ? "Running…"
                  : running?.kind === "suite"
                    ? "Running the suite…"
                    : selectedRunLabel
              }
              runIsPrimary={!readyToContinue}
              canRun={isStressSelected ? canRunSuite : canRunSelected}
              onRun={() => {
                if (isStressSelected) void runWholeSuite();
                else void runScenario(selectedId);
              }}
              canStop={locked}
              onStop={onStop}
              showOutputButton={!wide}
              onOpenOutput={() => setOutputOpen(true)}
            />

            {/* ── Zone 4: the output panel (right column at >=1024px) ── */}
            <aside className={ui.outputCol} aria-label="Test output">
              <div className={ui.railHead}>
                <p className="oa-micro">Output</p>
                <span className="oa-sub" style={{ fontSize: 11.5 }}>
                  {entryName}
                </span>
              </div>
              {output}
            </aside>
          </div>

          {/* ── Per-agent coverage ──
              The one blocker a page of green rows can hide: an agent nothing
              covers is not ready, and there is no failing scenario to look at
              because there is no scenario at all. */}
          {verdict !== null && verdict.byAgent.length > 0 && (
            <section className={styles.agentSection} aria-label="Coverage per agent">
              <h2 className={`oa-h2 ${styles.sectionTitle}`}>Coverage, agent by agent</h2>
              <p className="oa-sub">
                An agent with no scenario is not ready, and the runtime says so rather than
                letting the absence of evidence read as evidence of safety. These rows are the
                verdict&apos;s own <code>byAgent</code> breakdown.
              </p>
              <ul className={styles.agentList}>
                {verdict.byAgent.map((agent) => (
                  <li key={agent.agentId} className={styles.agentRow}>
                    <code className={styles.mono}>{agent.agentId}</code>
                    <StatusBadge
                      status={agent.ready ? "completed" : "failed"}
                      label={agent.ready ? "Proved" : agent.total === 0 ? "No scenarios" : "Failing"}
                    />
                    <span className="oa-micro">
                      {agent.passed} of {agent.total} passed
                      {agent.failed > 0 ? ` · ${agent.failed} failed` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {/* Output drawer below 1024px */}
      {!wide && (
        <Drawer
          open={outputOpen}
          onClose={() => setOutputOpen(false)}
          title="Output"
          eyebrow={entryName}
        >
          {output}
        </Drawer>
      )}
    </main>
  );
}

function StreamIcon({ status }: { status: RuntimeEventsStatus }) {
  if (status === "live") return <Radio size={14} aria-hidden />;
  if (status === "unsupported") return <WifiOff size={14} aria-hidden />;
  return <Loader2 size={14} className="oa-spin" aria-hidden />;
}
