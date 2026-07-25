"use client";
/**
 * NotificationsDrawer — the workspace bell panel (spec §19.2).
 *
 * Top: unread approval notifications (rows deep-link to the approval inbox).
 * Below the divider: the mock WhatsApp moment — a phone-push preview,
 * "Send test notification" (sending → delivered ticks via
 * mockNotificationService) and a fake WhatsApp chat bubble with Review and
 * Approve deep-link buttons. Every simulated act is labeled; nothing claims
 * a real send.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  BellRing,
  Check,
  CheckCheck,
  Loader2,
  MessageCircle,
  Send,
  ThumbsUp,
} from "lucide-react";
import Drawer from "@/components/mock/ui/Drawer";
import { toast } from "@/components/mock/ui/Toaster";
import { useDemoStore } from "@/lib/mock/store";
import { mockNotificationService } from "@/lib/mock/services";
import type { TimelineHandle } from "@/lib/mock/services/timeline";
import { WHATSAPP_PREVIEW } from "@/lib/mock/fixtures/activity";
import { APPROVAL, DEMO_TODAY } from "@/lib/mock/fixtures/ids";
import { DUR, EASE } from "@/lib/mock/motion";
import { dueLabel } from "./format";
import styles from "./workspace.module.css";

type SendPhase = "idle" | "sending" | "delivered";

export default function NotificationsDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const approvals = useDemoStore((s) => s.workspace.approvals);
  const unreadIds = useDemoStore((s) => s.workspace.unreadNotifications);
  const markNotificationsRead = useDemoStore((s) => s.markNotificationsRead);
  const approveItem = useDemoStore((s) => s.approveItem);

  const [sendPhase, setSendPhase] = useState<SendPhase>("idle");
  const handleRef = useRef<TimelineHandle | null>(null);

  /* Cancel the notification timeline on unmount and when the drawer closes
     mid-send (spec: every service handle cancelled). */
  useEffect(() => () => handleRef.current?.cancel(), []);
  useEffect(() => {
    if (!open && sendPhase === "sending") {
      handleRef.current?.cancel();
      setSendPhase("idle");
    }
  }, [open, sendPhase]);

  const unread = unreadIds
    .map((id) => approvals[id])
    .filter((a): a is NonNullable<typeof a> => Boolean(a));

  const refund = approvals[APPROVAL.refund];
  const refundApprovable =
    refund && (refund.status === "pending" || refund.status === "review_requested");

  const goToApprovals = () => {
    onClose();
    router.push("/app/workspace/approvals");
  };

  const sendTest = () => {
    handleRef.current?.cancel();
    setSendPhase("sending");
    handleRef.current = mockNotificationService.send(
      (stage) => setSendPhase(stage),
      { instant: Boolean(reduced) },
    );
  };

  const approveRefund = () => {
    if (!refundApprovable) return;
    approveItem(APPROVAL.refund);
    toast({
      title: "Refund approved",
      detail: "Recorded in the demo workspace. No real refund was made.",
      tone: "ok",
    });
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      eyebrow="Workspace · Notifications"
      title="Notifications"
      footer={
        <>
          <span className="oa-sim-note" style={{ marginRight: "auto" }}>
            Demo notifications only
          </span>
          <button
            type="button"
            className="oa-btn oa-btn--ghost oa-btn--sm"
            onClick={markNotificationsRead}
            disabled={unread.length === 0}
          >
            Mark all read
          </button>
        </>
      }
    >
      <div className={styles.notifStack}>
        {/* ── Unread approval notifications ── */}
        <section aria-label="Approvals needing your decision" style={{ display: "grid", gap: 10 }}>
          <p className="oa-micro">Needs your decision</p>
          {unread.length === 0 ? (
            <p className="oa-sub">You&apos;re all caught up. No unread notifications.</p>
          ) : (
            <div className={styles.notifRows}>
              {unread.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={styles.notifRow}
                  onClick={goToApprovals}
                >
                  <span className={styles.notifIcon} aria-hidden>
                    <BellRing size={14} />
                  </span>
                  <span style={{ display: "grid", gap: 3, minWidth: 0 }}>
                    <span className={styles.rowSub}>
                      Approval required · {item.agentName}
                    </span>
                    <span className={styles.rowTitle}>{item.title}</span>
                    <span
                      className={`${styles.due} ${item.dueAt === DEMO_TODAY ? styles.dueToday : ""}`}
                    >
                      Due {dueLabel(item.dueAt, item.dueTime)}
                    </span>
                  </span>
                  <ArrowRight
                    size={14}
                    aria-hidden
                    style={{ marginLeft: "auto", flex: "none", color: "var(--oa-muted)", marginTop: 4 }}
                  />
                </button>
              ))}
            </div>
          )}
        </section>

        <hr className="oa-divider" />

        {/* ── Mock WhatsApp section (spec §19.2) ── */}
        <section aria-label="WhatsApp approval alerts, simulated" style={{ display: "grid", gap: 12 }}>
          <div className="oa-between">
            <p className="oa-micro">WhatsApp approval alerts</p>
            <span className="oa-tag oa-tag--neutral">Mock</span>
          </div>
          <p className="oa-sub">
            When an approval is created, Oriant can alert your phone. This is how it would
            look. Try it with a test notification.
          </p>

          {/* Phone push preview */}
          <div className={styles.pushCard}>
            <div className={styles.pushTop}>
              <span className={styles.pushIcon} aria-hidden>
                <MessageCircle size={17} />
              </span>
              <div style={{ display: "grid", gap: 1, minWidth: 0 }}>
                <span className={styles.pushApp}>WhatsApp</span>
                <span className={styles.pushTitle}>{WHATSAPP_PREVIEW.title}</span>
              </div>
              <span className={styles.pushTime}>{WHATSAPP_PREVIEW.time}</span>
            </div>
            <p className={styles.pushBody}>{WHATSAPP_PREVIEW.body}</p>

            <div className={styles.sendRow}>
              <button
                type="button"
                className="oa-btn oa-btn--primary oa-btn--sm"
                onClick={sendTest}
                disabled={sendPhase === "sending"}
              >
                <Send size={13} aria-hidden />
                {sendPhase === "delivered" ? "Send again" : "Send test notification"}
              </button>
              <span aria-live="polite" role="status">
                {sendPhase === "sending" && (
                  <span className={styles.sendStatus}>
                    <Loader2 size={13} className="oa-spin" aria-hidden />
                    Sending
                    <Check size={13} aria-hidden />
                  </span>
                )}
                {sendPhase === "delivered" && (
                  <span className={`${styles.sendStatus} ${styles.sendStatusDelivered}`}>
                    <CheckCheck size={14} aria-hidden />
                    Delivered
                  </span>
                )}
              </span>
            </div>
          </div>

          {/* Fake WhatsApp message panel, revealed after delivery */}
          <AnimatePresence>
            {sendPhase === "delivered" && (
              <motion.div
                initial={reduced ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: DUR.card, ease: EASE }}
                className={styles.waPanel}
              >
                <div className={styles.waPanelHead}>
                  <MessageCircle size={12} aria-hidden />
                  WhatsApp · Your phone
                </div>
                <div className={styles.waBubble}>
                  <div className={styles.waBubbleBody}>
                    <p className={styles.waText}>{WHATSAPP_PREVIEW.body}</p>
                    <span className={styles.waMeta}>
                      {WHATSAPP_PREVIEW.time}
                      <CheckCheck size={13} aria-hidden className={styles.waTicks} />
                    </span>
                  </div>
                  <div className={styles.waActions}>
                    <button type="button" className={styles.waBtn} onClick={goToApprovals}>
                      Review
                    </button>
                    <button
                      type="button"
                      className={styles.waBtn}
                      onClick={approveRefund}
                      disabled={!refundApprovable}
                    >
                      {refundApprovable ? (
                        <>
                          <ThumbsUp size={13} aria-hidden />
                          Approve
                        </>
                      ) : (
                        <>
                          <Check size={13} aria-hidden />
                          Approved
                        </>
                      )}
                    </button>
                  </div>
                </div>
                <span className="oa-sim-note">Mock notification: no real message is sent.</span>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>
    </Drawer>
  );
}
