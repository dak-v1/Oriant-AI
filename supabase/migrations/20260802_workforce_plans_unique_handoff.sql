-- Step 9 Pass 1 fix: POST /api/planner/generate's duplicate-plan guard
-- (workforcePlans.listByHandoff(handoff.id) then create) is a check-then-
-- insert with no DB-level backing — racy under concurrent requests. The new
-- frontend's re-bootstrap-on-every-mount behavior surfaced this for real:
-- two rapid page loads both read "no plan yet" and both inserted, producing
-- two workforce_plans rows for the same role_b_handoff_id. Confirmed via a
-- full-table scan that this was the only duplicate in the live data (now
-- cleaned up separately) before adding this constraint.
do $$
begin
  alter table workforce_plans add constraint workforce_plans_role_b_handoff_id_key unique (role_b_handoff_id);
exception
  when duplicate_object then null;
end $$;
