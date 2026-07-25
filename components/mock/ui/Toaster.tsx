"use client";
/**
 * Toaster — tiny shared toast system (change summaries, autosave notes,
 * mock calendar actions). Non-blocking, aria-live, auto-dismisses; an
 * optional action button supports "Undo" (spec §11.7).
 */
import { create } from "zustand";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Info, X } from "lucide-react";
import { DUR, EASE } from "@/lib/mock/motion";

export interface Toast {
  id: number;
  title: string;
  detail?: string;
  tone: "ok" | "info";
  action?: { label: string; onClick: () => void };
}

interface ToastStore {
  toasts: Toast[];
  push: (t: Omit<Toast, "id">) => void;
  dismiss: (id: number) => void;
}

let toastSeq = 1;

export const useToasts = create<ToastStore>((set) => ({
  toasts: [],
  push: (t) => {
    const id = toastSeq++;
    set((s) => ({ toasts: [...s.toasts.slice(-2), { ...t, id }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), 6000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

/** Convenience for non-component call sites. */
export const toast = (t: Omit<Toast, "id">) => useToasts.getState().push(t);

export default function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);

  return (
    <div
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: 20,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 80,
        display: "grid",
        gap: 8,
        width: "min(480px, calc(100vw - 32px))",
        pointerEvents: "none",
      }}
    >
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: DUR.card, ease: EASE }}
            className="oa-card"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 16px",
              pointerEvents: "auto",
              boxShadow: "var(--oa-shadow-pop)",
            }}
          >
            {t.tone === "ok" ? (
              <span
                aria-hidden
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 9,
                  display: "grid",
                  placeItems: "center",
                  background: "var(--oa-soft-teal)",
                  color: "var(--oa-teal-deep)",
                  flex: "none",
                }}
              >
                <Check size={14} />
              </span>
            ) : (
              <span
                aria-hidden
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 9,
                  display: "grid",
                  placeItems: "center",
                  background: "var(--oa-soft-blue)",
                  color: "var(--oa-blue-dark)",
                  flex: "none",
                }}
              >
                <Info size={14} />
              </span>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13.5, fontWeight: 750 }}>{t.title}</p>
              {t.detail && (
                <p className="oa-sub" style={{ marginTop: 2 }}>
                  {t.detail}
                </p>
              )}
            </div>
            {t.action && (
              <button
                type="button"
                className="oa-btn oa-btn--soft oa-btn--sm"
                onClick={() => {
                  t.action?.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              className="oa-btn oa-btn--ghost oa-btn--icon"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
            >
              <X size={13} aria-hidden />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
