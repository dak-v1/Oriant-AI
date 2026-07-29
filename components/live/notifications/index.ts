/**
 * components/live/notifications/index.ts — the surface's front door.
 *
 * The five live Operate screens are owned by other files and other people, so
 * what this folder offers them is deliberately small and deliberately stable:
 * one component to render, one hook for a screen that wants only a count, and the
 * types either of those hands back.
 *
 *   import NotificationCenter from "@/components/live/notifications";
 *   …
 *   <NotificationCenter />                     // on a live screen
 *   <NotificationCenter enabled={false} />     // on the scripted lane: renders nothing
 *
 * That is the whole integration. The component fetches its own data, subscribes
 * to the runtime's change signal, reports its own health and its own failures,
 * and needs nothing from the screen around it — no snapshot passed down, no
 * refresh to wire, no state to lift. A host that already reads the runtime is
 * paying for one extra request, and in exchange the definition of "needs
 * attention" stays in one place rather than in five.
 *
 * `useNotifications` is exported for the other shape a screen might want: a count
 * in a header, or a badge on a tab, without the panel. It returns the same items
 * the panel renders, so the two can never disagree about how many there are.
 *
 * Nothing here re-exports the route's wire types by accident: `api.ts` owns the
 * parsed shapes and is the only thing that talks to /api/runtime/notifications.
 */

export { default } from "./NotificationCenter";
export { default as NotificationCenter } from "./NotificationCenter";
export type { NotificationCenterProps } from "./NotificationCenter";

export { useNotifications } from "./useNotifications";
export type {
  NotificationsFailure,
  UseNotifications,
  UseNotificationsOptions,
} from "./useNotifications";

export type {
  NotificationCounts,
  NotificationItem,
  NotificationKind,
  NotificationSeverity,
  NotificationSnapshot,
  NotificationSource,
} from "./api";

export { SEVERITY, SEVERITY_ORDER, formatAge } from "./format";
export type { SeverityMeta } from "./format";
