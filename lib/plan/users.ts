/**
 * lib/plan/users.ts — the shared user directory.
 *
 * The exact sibling of lib/plan/operations.ts, and for the same reason: a
 * `user id` crossing the seam must resolve against one registry both lanes
 * import, never be a free-typed string nobody checks. Until D owns a real
 * directory (contract §8 Q2 asks the identical question about the operation
 * vocabulary), Role C maintains it here and D imports it.
 *
 * Two consumers depend on resolution actually happening:
 *   - Validator rule 8 — `approvalOwner` resolves to a real user. Without a
 *     registry the rule can only prove the field is non-empty, and a typo'd
 *     owner id passes the gate, pauses a run correctly, and addresses the
 *     approval to somebody who does not exist. The run then waits forever with
 *     no visible cause.
 *   - The M5 approvals inbox — an owner id is not a display name, so something
 *     has to map "user_sarah_chen" to "Sarah Chen" before a card can render.
 *
 * Names and roles mirror lib/mock/fixtures/ids.ts (OWNER, PEOPLE) so the demo
 * surfaces and the runtime speak about the same people. They are written out
 * literally rather than imported: the contract is the boundary between the
 * lanes, and nothing under lib/plan may depend on lib/mock.
 */

export interface UserDef {
  /** Stable id. This is what an ApprovedPlan carries; never a display name. */
  id: string;
  name: string;
  /** Two letters for the avatar chip on approval cards. */
  initials: string;
  role: string;
}

export const USERS: UserDef[] = [
  { id: "user_sarah_chen", name: "Sarah Chen", initials: "SC", role: "Owner" },
  { id: "user_priya_nair", name: "Priya Nair", initials: "PN", role: "Customer Care lead" },
  { id: "user_marcus_tan", name: "Marcus Tan", initials: "MT", role: "Field Operations lead" },
  { id: "user_dana_lim", name: "Dana Lim", initials: "DL", role: "Marketing coordinator" },
  { id: "user_wei_ling_goh", name: "Wei Ling Goh", initials: "WG", role: "Finance lead" },
];

const BY_ID = new Map(USERS.map((u) => [u.id, u]));

export function getUser(id: string): UserDef | undefined {
  return BY_ID.get(id);
}

/** Unknown ids are NOT users — fail closed, exactly as isKnownOperation does. */
export function isKnownUser(id: string): boolean {
  return typeof id === "string" && BY_ID.has(id);
}
