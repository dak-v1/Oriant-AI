"use client";
/**
 * LiveDrawer — the review panel's shell: a real modal dialog that the keyboard
 * cannot fall out of.
 *
 * WHY NOT components/mock/ui/Drawer. Visually this IS that drawer — it uses the
 * same `.oa-drawer` primitives, the same head/body/foot geometry and the same
 * scrim, so the live review panel and the scripted one are the same object on
 * screen. What it does not share is the focus handling. The scripted drawer
 * moves focus to the panel and listens for Escape, which is right for a demo
 * nobody drives with a keyboard; this one holds a decision that sends email, so
 * it also traps Tab inside the dialog, restores focus to whatever opened it, and
 * locks the page behind it from scrolling. Editing the shared component to add
 * that would change the scripted screens, which must not move — so the two
 * exist side by side and this file says why.
 *
 * THE KEY LISTENER IS ON THE DOCUMENT, NOT ON THE PANEL, AND THAT IS THE M7
 * FIX. It used to be a React `onKeyDown` on the panel, which works only while
 * focus is inside the panel — and the decision path routinely puts focus
 * outside it. Pressing "Reject…" unmounts the button that was focused, and the
 * browser drops focus to `document.body`; from there Escape did nothing and Tab
 * walked into the page behind the dialog, which is the one thing a modal must
 * not allow. Listening on the document catches those keystrokes wherever they
 * are raised, and the trap below pulls focus back in rather than assuming it
 * never left.
 *
 * THE TRAP IS COMPUTED PER KEYSTROKE, NOT CACHED. The drawer's contents change
 * as an approval loads and as the owner edits arguments, so a focusable list
 * captured on open is stale by the time it matters. Querying on Tab costs one
 * DOM read per keypress and cannot go out of date. Visibility is tested with
 * `getClientRects()` rather than `offsetParent`, so a control inside a collapsed
 * `<details>` — the "show exactly what will be sent" disclosure, which is
 * genuinely on the approve path — is skipped instead of being offered as a stop
 * the eye cannot find.
 *
 * FOCUS GOES TO THE PANEL, NOT THE FIRST CONTROL. The first control is a Close
 * button, and landing on it would let a fast Enter dismiss a drawer that had
 * just been opened deliberately. The panel is focusable but not tabbable, so the
 * screen reader announces the dialog's label and the first Tab reaches Close.
 */
import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import styles from "./live-approvals.module.css";

/**
 * Everything that can hold focus without being disabled or removed from the tab
 * order. `[tabindex]:not([tabindex="-1"])` catches custom widgets; the
 * `:not([disabled])` filters keep a disabled primary action from swallowing the
 * wrap-around.
 */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export default function LiveDrawer({
  open,
  onClose,
  focusKey,
  eyebrow,
  title,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /**
   * Changes when the panel starts showing a DIFFERENT thing without closing —
   * following a run to the next approval it raised. Focus is pulled back to the
   * dialog when it moves, because the control that was clicked has just been
   * unmounted and focus would otherwise fall to the document body, outside the
   * trap this component exists to hold.
   */
  focusKey?: string;
  eyebrow?: string;
  title: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  /* The listener below is registered once per open, so it must not close over a
     stale `onClose`. A ref keeps the callback current without tearing the
     listener down and rebuilding it on every parent render. */
  const closeRef = useRef(onClose);
  const titleId = useId();

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  /* Remember the opener BEFORE focus moves, so closing returns the owner to the
     card they came from rather than to the top of the document. Keyed on `open`
     alone: a change of contents must not re-capture the restore target, or
     closing would return focus to whatever the panel itself last held. */
  useEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    restoreRef.current = active instanceof HTMLElement ? active : null;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
      // Guard against restoring to a node the drawer's own work removed.
      const target = restoreRef.current;
      if (target && document.contains(target)) target.focus();
      restoreRef.current = null;
    };
  }, [open]);

  /* Focus the dialog on open, and again whenever its subject changes. */
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => panelRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, [open, focusKey]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const panel = panelRef.current;
      if (panel === null) return;

      if (event.key === "Escape") {
        // Stopped rather than prevented: preventing it would also cancel a
        // native select's own dismissal, and the drawer closing is the whole
        // effect wanted here.
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (node) => node.getClientRects().length > 0 || node === document.activeElement,
      );

      if (focusable.length === 0) {
        // Nothing to move to; keep focus on the panel rather than letting Tab
        // escape to the page underneath.
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      const active = document.activeElement;

      // Focus is not in the dialog at all — the control that held it was
      // unmounted by the drawer's own work. Pull it back in rather than letting
      // Tab continue into the page behind the modal.
      if (!(active instanceof Node) || !panel.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }

      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!open) return null;

  return (
    <>
      {/* Decorative: Escape and the Close button are the accessible exits, and
          the dialog below is what assistive technology is pointed at. */}
      <div className={`oa-scrim ${styles.drawerScrim}`} onClick={() => onClose()} aria-hidden />
      <div
        ref={panelRef}
        className={`oa oa-drawer oa-drawer--wide ${styles.drawerPanel}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="oa-drawer-head">
          <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
            {eyebrow && <p className="oa-micro">{eyebrow}</p>}
            <h2 className="oa-h2" id={titleId}>
              {title}
            </h2>
          </div>
          <button
            type="button"
            className="oa-btn oa-btn--ghost oa-btn--icon"
            onClick={onClose}
            aria-label="Close review panel"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
        <div className="oa-drawer-body">{children}</div>
        {footer && <div className="oa-drawer-foot">{footer}</div>}
      </div>
    </>
  );
}
