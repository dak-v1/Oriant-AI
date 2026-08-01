/**
 * Error type for the Person B planner/integrations backend.
 *
 * Analogous to lib/server/orchestrator.ts's GateError, but independent —
 * nothing here imports from orchestrator.ts. Unlike GateError (always 409),
 * this carries an explicit status per throw site since this backend needs
 * 404/400/409/502, not just one.
 */
export class PlannerError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
