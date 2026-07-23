"use client";
/**
 * Drawer — right-hand sliding panel used for config, review and evidence
 * (spec §4, §11.4, §18.1). Scrim click + Escape close it; focus moves in.
 */
import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { DUR, EASE } from "@/lib/mock/motion";

let drawerSeq = 0;

export default function Drawer({
  open,
  onClose,
  title,
  eyebrow,
  wide,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  eyebrow?: string;
  wide?: boolean;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleIdRef = useRef<string>("");
  if (!titleIdRef.current) titleIdRef.current = `oa-drawer-title-${++drawerSeq}`;

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onEsc);
    const t = setTimeout(() => panelRef.current?.focus(), 80);
    return () => {
      document.removeEventListener("keydown", onEsc);
      clearTimeout(t);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="oa-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            className={`oa oa-drawer ${wide ? "oa-drawer--wide" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleIdRef.current}
            tabIndex={-1}
            initial={{ x: "104%" }}
            animate={{ x: 0 }}
            exit={{ x: "104%" }}
            transition={{ duration: DUR.card, ease: EASE }}
          >
            <div className="oa-drawer-head">
              <div style={{ display: "grid", gap: 4 }}>
                {eyebrow && <p className="oa-micro">{eyebrow}</p>}
                <h2 className="oa-h2" id={titleIdRef.current}>
                  {title}
                </h2>
              </div>
              <button
                type="button"
                className="oa-btn oa-btn--ghost oa-btn--icon"
                onClick={onClose}
                aria-label="Close panel"
              >
                <X size={16} aria-hidden />
              </button>
            </div>
            <div className="oa-drawer-body">{children}</div>
            {footer && <div className="oa-drawer-foot">{footer}</div>}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
