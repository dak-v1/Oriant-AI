"use client";
/**
 * DeployChecklist — the eight-step activation review (spec §16, §15).
 *
 * Items 1–2 are auto-confirmed from real store state (build jobs, sandbox),
 * 3/5/6 are owner acknowledgements (real checkboxes → setChecklistValue),
 * 4 is a choice, 7 is the notification-channel picker (In app always on;
 * WhatsApp / Email digest optional, each with a mock preview), 8 is the
 * single primary action: Activate workforce. The primary stays disabled
 * until every auto item is genuinely satisfied and every acknowledgement
 * is made — with links back to whatever is missing.
 */
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Check,
  FlaskConical,
  Mail,
  MessageCircle,
  PackageCheck,
  Plug,
} from "lucide-react";
import { useDemoStore, usePlanTotals } from "@/lib/mock/store";
import { money } from "@/lib/mock/pricing";
import { DUR, EASE, STAGGER } from "@/lib/mock/motion";
import type { DeployChecklistItem } from "@/lib/mock/types";
import { AGENT_NAME } from "@/lib/mock/fixtures/ids";
import { INTEGRATIONS } from "@/lib/mock/fixtures/integrations";
import { BUILD_FIXTURES } from "@/lib/mock/fixtures/build-artifacts";
import { STRESS_TEST } from "@/lib/mock/fixtures/sandbox-scenarios";
import { WHATSAPP_PREVIEW } from "@/lib/mock/fixtures/activity";
import StatusBadge from "@/components/mock/ui/StatusBadge";
import styles from "./deploy.module.css";

/* The checklist is UI composition — defined here, not in a fixture (brief). */
const CHECKLIST: DeployChecklistItem[] = [
  {
    id: "artifacts",
    title: "Generated artefacts confirmed",
    detail: "Every approved agent has a complete, validated build package.",
    kind: "auto",
  },
  {
    id: "sandbox",
    title: "Sandbox results confirmed",
    detail: "The complaint scenario ran end to end and paused for your approval exactly where it should.",
    kind: "auto",
  },
  {
    id: "warnings",
    title: "Unresolved warnings reviewed",
    detail: "One stress-test case needs your acknowledgement before going live.",
    kind: "ack",
  },
  {
    id: "systems",
    title: "Systems",
    detail: "Connections your agents need on day one.",
    kind: "choice",
  },
  {
    id: "owners",
    title: "Human approval owners confirmed",
    detail: "Every approval lands with a named person. Check these are right.",
    kind: "ack",
  },
  {
    id: "schedules",
    title: "Triggers, schedules and quiet hours confirmed",
    detail: "When each agent runs, and when it stays quiet.",
    kind: "ack",
  },
  {
    id: "channels",
    title: "Notification channels",
    detail: "How you want to hear about approvals and exceptions. In app is always on.",
    kind: "choice",
  },
];

/* Channel buttons (spec §15, A-01). Ids match the values stored in
   deployment.checked["channels"] so earlier selections keep working. */
const CHANNELS: {
  id: string;
  label: string;
  desc: string;
  Icon: typeof Bell;
  alwaysOn?: boolean;
}[] = [
  { id: "In-app", label: "In app", desc: "Approvals and alerts inside Oriant", Icon: Bell, alwaysOn: true },
  { id: "WhatsApp", label: "WhatsApp", desc: "Approval requests to your phone", Icon: MessageCircle },
  { id: "Email digest", label: "Email digest", desc: "A daily summary each evening", Icon: Mail },
];

export default function DeployChecklist({ onActivate }: { onActivate: () => void }) {
  const reduced = useReducedMotion();
  const agents = useDemoStore((s) => s.plan.agents);
  const buildJobs = useDemoStore((s) => s.buildJobs);
  const sandbox = useDemoStore((s) => s.sandbox);
  const integrations = useDemoStore((s) => s.integrations);
  const checked = useDemoStore((s) => s.deployment.checked);
  const setChecklistValue = useDemoStore((s) => s.setChecklistValue);
  const totals = usePlanTotals();

  /* ── Derived state ── */
  const allBuilt =
    agents.length > 0 && agents.every((a) => buildJobs[a.agentId]?.status === "completed");
  const unbuilt = agents.filter((a) => buildJobs[a.agentId]?.status !== "completed");
  const artifactCounts = agents.map((a) => ({
    id: a.agentId,
    name: AGENT_NAME[a.agentId] ?? a.agentId,
    count: BUILD_FIXTURES[a.agentId]?.artifacts.length ?? 0,
  }));
  const totalArtifacts = artifactCounts.reduce((n, a) => n + a.count, 0);

  const sandboxDone = sandbox.phase === "completed";
  const failedCase = STRESS_TEST.cases.find((c) => c.outcome === "failed");

  const planAgentIds = agents.map((a) => a.agentId);
  const requiredDefs = Object.values(INTEGRATIONS).filter(
    (d) => d.defaultStatus === "required" && d.neededBy.some((id) => planAgentIds.includes(id)),
  );
  const connectedRequired = requiredDefs.filter((d) => integrations[d.id]?.status === "connected");
  const unconnected = requiredDefs.filter((d) => integrations[d.id]?.status !== "connected");
  const systemsDeferred = checked["systems"] === true;
  const systemsOk = unconnected.length === 0 || systemsDeferred;

  const warningsAcked = checked["warnings"] === true;
  const ownersAcked = checked["owners"] === true;
  const schedulesAcked = checked["schedules"] === true;
  /* In app is always on, so the channel step always has at least one channel.
     The stored value only records the optional extras the owner switched on. */
  const storedChannels = typeof checked["channels"] === "string" ? checked["channels"] : "";
  const selectedChannels = new Set(["In-app", ...storedChannels.split(", ").filter(Boolean)]);

  const canActivate =
    allBuilt && sandboxDone && warningsAcked && systemsOk && ownersAcked && schedulesAcked;

  const missing: { label: string; href: string }[] = [];
  if (!allBuilt) missing.push({ label: "Finish generating agent packages", href: "/app/build" });
  if (!sandboxDone) missing.push({ label: "Complete a sandbox run", href: "/app/sandbox" });
  if (!warningsAcked) missing.push({ label: "Review the stress-test warning", href: "#chk-warnings" });
  if (!systemsOk)
    missing.push({ label: "Connect remaining systems, or choose to connect them later", href: "#chk-systems" });
  if (!ownersAcked) missing.push({ label: "Confirm approval owners", href: "#chk-owners" });
  if (!schedulesAcked) missing.push({ label: "Confirm schedules and quiet hours", href: "#chk-schedules" });

  const toggleChannel = (ch: string) => {
    const next = new Set(selectedChannels);
    if (next.has(ch)) next.delete(ch);
    else next.add(ch);
    setChecklistValue("channels", CHANNELS.map((c) => c.id).filter((id) => next.has(id)).join(", "));
  };

  const satisfied = (id: string): boolean => {
    switch (id) {
      case "artifacts": return allBuilt;
      case "sandbox": return sandboxDone;
      case "warnings": return warningsAcked;
      case "systems": return systemsOk;
      case "owners": return ownersAcked;
      case "schedules": return schedulesAcked;
      case "channels": return true; // In app is always on
      default: return false;
    }
  };

  /* ── Per-item body content ── */
  const renderBody = (item: DeployChecklistItem) => {
    switch (item.id) {
      case "artifacts":
        return (
          <div className={styles.evidence}>
            {allBuilt ? (
              <p className={styles.evLine}>
                <Check size={14} className={styles.evIcon} aria-hidden />
                {totalArtifacts} artefacts generated and validated across {agents.length} agents.
              </p>
            ) : (
              <p className={styles.evLine}>
                <AlertTriangle size={14} className={styles.evIconWarn} aria-hidden />
                {unbuilt.length} agent{unbuilt.length === 1 ? "" : "s"} still building:{" "}
                <Link href="/app/build" style={{ fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 3 }}>
                  open the Agent Factory
                </Link>
                .
              </p>
            )}
            <div className={styles.countChips}>
              {artifactCounts.map((a) => (
                <span key={a.id} className={styles.countChip}>
                  <strong>{a.name}</strong> {a.count} files
                </span>
              ))}
            </div>
            {allBuilt && (
              <div>
                <Link href="/app/build" className="oa-btn oa-btn--ghost oa-btn--sm">
                  Review generated packages
                </Link>
              </div>
            )}
          </div>
        );

      case "sandbox":
        return (
          <div className={styles.evidence}>
            {sandboxDone ? (
              <p className={styles.evLine}>
                <Check size={14} className={styles.evIcon} aria-hidden />
                High-value complaint scenario completed. The run paused for your approval before any
                compensation was proposed.
              </p>
            ) : (
              <p className={styles.evLine}>
                <AlertTriangle size={14} className={styles.evIconWarn} aria-hidden />
                No completed sandbox run yet:{" "}
                <Link href="/app/sandbox" style={{ fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 3 }}>
                  open the sandbox
                </Link>
                .
              </p>
            )}
            {sandbox.stressDone && (
              <p className={styles.evLine}>
                <Check size={14} className={styles.evIcon} aria-hidden />
                Stress test: {STRESS_TEST.total} cases, {STRESS_TEST.passed} passed,{" "}
                {STRESS_TEST.escalated} correctly escalated, {STRESS_TEST.failed} failed.
              </p>
            )}
          </div>
        );

      case "warnings":
        return (
          <div className={styles.evidence}>
            {sandbox.stressDone && failedCase ? (
              <div className={styles.warnPanel}>
                <p className={styles.warnTitle}>
                  <AlertTriangle size={14} aria-hidden />
                  Stress case {failedCase.id}: {failedCase.name}
                </p>
                <p className={styles.warnBody}>{failedCase.note}</p>
                <p className={styles.warnWhy}>{STRESS_TEST.failureExplanation}</p>
              </div>
            ) : (
              <p className={styles.evLine}>
                No warnings recorded yet. Run the 20-case stress test in the{" "}
                <Link href="/app/sandbox" style={{ fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 3 }}>
                  sandbox
                </Link>{" "}
                to surface anything worth reviewing before activation.
              </p>
            )}
          </div>
        );

      case "systems":
        return (
          <div className={styles.evidence}>
            <div className={styles.sysSummary}>
              <p className={styles.evLine} style={{ alignItems: "center" }}>
                {unconnected.length === 0 ? (
                  <Check size={14} className={styles.evIcon} aria-hidden />
                ) : (
                  <Plug size={14} className={styles.evIconWarn} aria-hidden />
                )}
                {connectedRequired.length} of {requiredDefs.length} required systems connected.
              </p>
            </div>
            {unconnected.length > 0 && (
              <>
                <div className={styles.sysRows}>
                  {unconnected.map((d) => (
                    <div key={d.id} className={styles.sysRow}>
                      <span className={styles.sysName}>{d.name}</span>
                      <StatusBadge status={integrations[d.id]?.status ?? "required"} />
                    </div>
                  ))}
                </div>
                <div className={styles.sysActions}>
                  <Link href="/app/integrations" className="oa-btn oa-btn--ghost oa-btn--sm">
                    Connect in Integrations
                  </Link>
                  <label className={styles.inlineAck}>
                    <input
                      type="checkbox"
                      className={styles.check}
                      checked={systemsDeferred}
                      onChange={(e) => setChecklistValue("systems", e.target.checked)}
                    />
                    Connect remaining systems during the first week (simulated)
                  </label>
                </div>
              </>
            )}
          </div>
        );

      case "owners":
        return (
          <div className={styles.pairGrid}>
            {agents.map((a) => (
              <div key={a.agentId} className={styles.pairRow}>
                <p className={styles.pairName}>{AGENT_NAME[a.agentId] ?? a.agentId}</p>
                <p className={styles.pairValue}>
                  Approvals go to <strong>{a.config.approvalOwner}</strong> · process owner{" "}
                  <strong>{a.config.processOwner}</strong>
                </p>
              </div>
            ))}
          </div>
        );

      case "schedules":
        return (
          <div className={styles.pairGrid}>
            {agents.map((a) => (
              <div key={a.agentId} className={styles.pairRow}>
                <p className={styles.pairName}>{AGENT_NAME[a.agentId] ?? a.agentId}</p>
                <p className={styles.pairValue}>
                  {a.config.runFrequency} · quiet hours <strong>{a.config.quietHours}</strong>
                </p>
              </div>
            ))}
          </div>
        );

      case "channels": {
        const reveal = reduced
          ? {}
          : {
              initial: { opacity: 0, y: 8 },
              animate: { opacity: 1, y: 0 },
              exit: { opacity: 0 },
              transition: { duration: DUR.card, ease: EASE },
            };
        return (
          <div className={styles.evidence}>
            <div className={styles.channelGrid} role="group" aria-label="Notification channels">
              {CHANNELS.map(({ id, label, desc, Icon, alwaysOn }) => {
                const on = selectedChannels.has(id);
                return (
                  <button
                    key={id}
                    type="button"
                    className={`oa-selectable ${on ? "oa-selectable--selected" : ""} ${styles.channelCard}`}
                    aria-pressed={on}
                    disabled={alwaysOn}
                    onClick={alwaysOn ? undefined : () => toggleChannel(id)}
                  >
                    <span className={styles.channelIcon} aria-hidden>
                      <Icon size={17} />
                    </span>
                    <span className={styles.channelText}>
                      <span className={styles.channelName}>
                        {label}
                        {alwaysOn && <span className="oa-tag oa-tag--neutral">Always on</span>}
                      </span>
                      <span className={styles.channelDesc}>{desc}</span>
                    </span>
                    <span className="oa-check-badge" aria-hidden>
                      <Check size={13} />
                    </span>
                  </button>
                );
              })}
            </div>

            <AnimatePresence initial={false}>
              {selectedChannels.has("WhatsApp") && (
                <motion.div
                  key="wa-preview"
                  className={styles.previewCard}
                  aria-label="WhatsApp notification preview"
                  {...reveal}
                >
                  <div className={styles.previewTop}>
                    <span className={`${styles.previewIcon} ${styles.previewIconWa}`} aria-hidden>
                      <MessageCircle size={16} />
                    </span>
                    <div className={styles.previewHead}>
                      <span className={styles.previewApp}>WhatsApp</span>
                      <span className={styles.previewTitle}>
                        {WHATSAPP_PREVIEW.title.replace(/\s*—\s*/g, ": ")}
                      </span>
                    </div>
                    <span className={styles.previewTime}>{WHATSAPP_PREVIEW.time}</span>
                  </div>
                  <p className={styles.previewBody}>{WHATSAPP_PREVIEW.body}</p>
                  <span className="oa-sim-note">Mock notification enabled: no real message is sent.</span>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence initial={false}>
              {selectedChannels.has("Email digest") && (
                <motion.div
                  key="mail-preview"
                  className={styles.previewCard}
                  aria-label="Email digest preview"
                  {...reveal}
                >
                  <div className={styles.previewTop}>
                    <span className={`${styles.previewIcon} ${styles.previewIconMail}`} aria-hidden>
                      <Mail size={16} />
                    </span>
                    <div className={styles.previewHead}>
                      <span className={styles.previewApp}>Email · Oriant</span>
                      <span className={styles.previewTitle}>
                        Your BrightPath evening digest: 3 approvals, 12 tasks done
                      </span>
                    </div>
                    <span className={styles.previewTime}>18:30</span>
                  </div>
                  <span className="oa-sim-note">Mock notification enabled: no real message is sent.</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      }

      default:
        return null;
    }
  };

  const leadFor = (item: DeployChecklistItem) => {
    const ok = satisfied(item.id);
    if (item.kind === "ack") {
      /* Label wrapper gives the checkbox a real 44px hit target (§19.1). */
      return (
        <label className={styles.checkLead}>
          <input
            id={`ack-${item.id}`}
            type="checkbox"
            className={styles.check}
            checked={checked[item.id] === true}
            onChange={(e) => setChecklistValue(item.id, e.target.checked)}
            aria-describedby={`detail-${item.id}`}
          />
        </label>
      );
    }
    const Icon =
      item.id === "artifacts" ? PackageCheck :
      item.id === "sandbox" ? FlaskConical :
      item.id === "systems" ? Plug : Bell;
    return (
      <span
        className={`${styles.lead} ${ok ? styles.leadOk : item.kind === "auto" ? styles.leadWait : styles.leadNeutral}`}
        aria-hidden
      >
        {ok && item.kind === "auto" ? <Check size={17} /> : <Icon size={16} />}
      </span>
    );
  };

  const badgeFor = (item: DeployChecklistItem) => {
    const ok = satisfied(item.id);
    if (ok) return <StatusBadge status="ready" label="Confirmed" />;
    if (item.kind === "auto") return <StatusBadge status="pending" label="Waiting" />;
    return <StatusBadge status="optional" label="To review" />;
  };

  const entrance = (i: number) =>
    reduced
      ? {}
      : {
          initial: { opacity: 0, y: 12 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: DUR.card, ease: EASE, delay: i * STAGGER },
        };

  return (
    <div className={styles.list}>
      {CHECKLIST.map((item, i) => (
        <motion.section
          key={item.id}
          id={`chk-${item.id}`}
          className={`oa-card oa-card--flat ${styles.item}`}
          aria-labelledby={`title-${item.id}`}
          {...entrance(i)}
        >
          {leadFor(item)}
          <div className={styles.body}>
            <div className={styles.head}>
              <div className={styles.titleWrap}>
                <span className={styles.stepNo}>Step {i + 1} of 8</span>
                {item.kind === "ack" ? (
                  <label id={`title-${item.id}`} htmlFor={`ack-${item.id}`} className={styles.title}>
                    {item.title}
                  </label>
                ) : (
                  <h2 id={`title-${item.id}`} className={styles.title}>
                    {item.title}
                  </h2>
                )}
                <p id={`detail-${item.id}`} className="oa-sub">
                  {item.detail}
                </p>
              </div>
              {badgeFor(item)}
            </div>
            {renderBody(item)}
          </div>
        </motion.section>
      ))}

      {/* Step 8 — the one primary action on this screen */}
      <motion.section
        id="chk-activate"
        className={`oa-card ${styles.activateCard}`}
        aria-labelledby="title-activate"
        {...entrance(CHECKLIST.length)}
      >
        <div className={styles.activateInfo}>
          <span className={styles.stepNo}>Step 8 of 8</span>
          <h2 id="title-activate" className={styles.activateTitle}>
            Activate workforce
          </h2>
          <div className={styles.activateMeta}>
            <span>
              <strong>{agents.length} agents</strong> ready
            </span>
            <span aria-hidden>·</span>
            <span>
              <strong>{money(totals.setup)}</strong> setup
            </span>
            <span aria-hidden>·</span>
            <span>
              <strong>{money(totals.monthly)}</strong>/month
            </span>
            <span className="oa-tag oa-tag--neutral">Illustrative pricing</span>
          </div>
          <span className="oa-sim-note">Simulated activation: nothing outside this demo is changed.</span>
          {missing.length > 0 && (
            <ul className={styles.missing} aria-label="Before you can activate">
              {missing.map((m) => (
                <li key={m.label}>
                  <span className={styles.missingDot} aria-hidden />
                  {m.href.startsWith("#") ? (
                    <a href={m.href}>{m.label}</a>
                  ) : (
                    <Link href={m.href}>{m.label}</Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className={styles.activateSide}>
          <button
            type="button"
            className="oa-btn oa-btn--primary oa-btn--lg"
            disabled={!canActivate}
            onClick={onActivate}
          >
            Activate workforce
            <ArrowRight size={16} aria-hidden />
          </button>
        </div>
      </motion.section>
    </div>
  );
}
