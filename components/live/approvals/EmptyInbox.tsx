"use client";
/**
 * components/live/approvals/EmptyInbox.tsx — what the inbox says when there is
 * nothing in it (ROLE_C_PLAN M7, empty and blocked states).
 *
 * "No approvals" is true and useless. It does not distinguish a healthy quiet
 * queue from a workforce that was never activated, from one activated behind a
 * poller nobody switched on, from every agent being paused. Those need four
 * different actions from the owner, and on this screen specifically the cost of
 * conflating them is the highest in the product: an owner who believes nothing
 * needs deciding, when something does, is the worst outcome this surface has.
 *
 * SO IT ASKS THE SCHEDULER BEFORE IT REASSURES ANYBODY. `/api/runtime/scheduler`
 * is cheap — it lists triggers and jobs and nothing more — and its trigger list
 * is the same evidence `looksActivated` uses on the Workspace: `activate()`
 * writes triggers first, so their absence is the cheapest sound proof that no
 * go-live has happened. The read is made ONLY when the queue is empty, which is
 * exactly the moment the distinction matters, and it is made once per mount of
 * this component rather than on every refetch of the inbox behind it.
 *
 * THE PROBE FAILING IS ITS OWN ANSWER, AND IT IS NOT A CALM ONE. If the
 * scheduler cannot be read, this component says so and withholds the
 * reassurance — it does not fall through to "everything is fine, nothing is
 * waiting". The inbox read that produced the empty queue succeeded, so the
 * emptiness is real; what is unknown is whether it is healthy, and that is what
 * gets said.
 *
 * WHICH GATE IS SHUT COMES FROM `ActivationGates`, shared with the Workspace's
 * `ActivationNotice`. Two screens answering "what is blocking activation" in two
 * vocabularies would leave the owner deciding which of their own screens to
 * believe; its header carries the reasoning for the on-demand fetch, which
 * re-runs the sandbox suite and must never be made automatic.
 *
 * THE SCHEDULER AND ACTIVATION READERS ARE IMPORTED FROM THE WORKSPACE rather
 * than reimplemented here. They are strict parsers over two endpoints this
 * screen would otherwise have to describe a second time, and a second
 * description is a second opinion about the same gate — the failure
 * `countRunsToday` is already recorded against under M6. The import is
 * type-only at the boundary and React-free below it, so nothing about the
 * Workspace's rendering comes with it.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Inbox, PauseCircle, Rocket } from "lucide-react";
import ActivationGates from "@/components/live/workspace/ActivationGates";
import { loadScheduler } from "@/components/live/workspace/runtime-api";
import type { Loaded, SchedulerSnapshot } from "@/components/live/workspace/runtime-api";
import styles from "./live-approvals.module.css";

export default function EmptyInbox({ updateNote }: { updateNote: string }) {
  const [probe, setProbe] = useState<Loaded<SchedulerSnapshot> | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    abort.current = controller;
    void (async () => {
      const next = await loadScheduler(controller.signal);
      if (!controller.signal.aborted) setProbe(next);
    })();
    return () => controller.abort();
  }, []);

  /* ── Still asking ──
     Deliberately NOT the reassuring copy with a spinner on it. Until the
     scheduler answers, this component does not know whether the empty queue is
     calm or catastrophic, and it says only what it knows. */
  if (probe === null) {
    return (
      <div className={styles.stateBox} aria-busy="true">
        <p className={styles.stateTitle}>
          <Inbox size={17} aria-hidden />
          No run is waiting on you.
        </p>
        <p>
          Checking whether that is because your workforce is running quietly or
          because nothing is set up to run at all…
        </p>
      </div>
    );
  }

  /* ── The probe itself failed ──
     The inbox read succeeded, so the queue really is empty; what cannot be
     established is whether anything could ever fill it. Saying "all clear" here
     would be reassurance this component did not earn. */
  if (probe.data === null) {
    return (
      <div className={styles.stateBox}>
        <p className={styles.stateTitle}>
          <AlertTriangle size={17} aria-hidden />
          Nothing is waiting on you — and this screen cannot tell you why.
        </p>
        <p>
          The approvals queue answered and it is empty. The schedule could not be
          read, so this screen cannot say whether that is a quiet workforce or one
          that was never put live:{" "}
          <span className={styles.stateDetail}>
            {probe.error ?? "the check was cancelled before it finished"}
          </span>
        </p>
        <p style={{ margin: 0 }}>
          Treat the empty queue as unexplained until the schedule can be read.
        </p>
        <div className="oa-cluster">
          <Link href="/app/deploy" className="oa-btn oa-btn--ghost oa-btn--sm">
            <Rocket size={13} aria-hidden />
            Open the go-live checks
          </Link>
        </div>
      </div>
    );
  }

  const triggers = probe.data.triggers;
  const enabled = triggers.filter((trigger) => trigger.enabled);

  /* ── Blocked: never activated ── */
  if (triggers.length === 0) {
    return (
      <div className={styles.stateBox}>
        <p className={styles.stateTitle}>
          <Rocket size={17} aria-hidden />
          Nothing can reach this queue yet.
        </p>
        <p>
          Nothing is scheduled at all, which means this plan has never been put
          live. Nothing will start, and no run can pause for a decision — so the
          empty queue below is not a quiet workforce, it is the absence of one.
        </p>
        <p style={{ margin: 0 }}>
          Three checks stand in front of going live and each blocks on its own:
          every agent ready, its test run passed, and the connections your plan
          needs actually in place.
        </p>
        <ActivationGates label="Check what is holding it up" />
        <div className="oa-cluster">
          <Link href="/app/deploy" className="oa-btn oa-btn--primary oa-btn--sm">
            <Rocket size={13} aria-hidden />
            Go to the go-live checks
          </Link>
        </div>
      </div>
    );
  }

  /* ── Blocked: activated, but every agent is paused ── */
  if (enabled.length === 0) {
    return (
      <div className={styles.stateBox}>
        <p className={styles.stateTitle}>
          <PauseCircle size={17} aria-hidden />
          Every workflow is paused.
        </p>
        <p>
          {triggers.length} trigger{triggers.length === 1 ? " is" : "s are"} set up, so this plan
          was put live — but not one of them is switched on. A paused agent does not
          start, does not run and cannot send you anything to decide, so this queue
          will stay empty until one is resumed.
        </p>
        <div className="oa-cluster">
          <Link href="/app/workspace/agents?live=1" className="oa-btn oa-btn--primary oa-btn--sm">
            Open your agents
          </Link>
        </div>
      </div>
    );
  }

  /* ── Genuinely quiet, and the one silent failure named ── */
  return (
    <div className={styles.stateBox}>
      <p className={styles.stateTitle}>
        <Inbox size={17} aria-hidden />
        No run is waiting on you.
      </p>
      <p>
        {enabled.length} workflow{enabled.length === 1 ? " is" : "s are"} live and nothing has
        reached a step that needs your decision. This queue holds runs that stopped
        part-way for you; it is empty because there are none, not because the
        screen has nothing to show.
      </p>
      <p style={{ margin: 0, fontWeight: 700 }}>The one failure that looks exactly like this:</p>
      <ol className={styles.stateSteps}>
        <li>
          Something has to actually run the schedule. If nothing is turning it, a
          workforce that has gone live looks perfectly healthy and never starts a
          single run — which looks exactly like a quiet queue.
        </li>
        <li>
          Schedules run in each agent&apos;s own timezone, so the Friday sweep
          arrives on Friday at 09:00 there — not here.
        </li>
      </ol>
      <p style={{ margin: 0 }}>{updateNote}</p>
    </div>
  );
}
