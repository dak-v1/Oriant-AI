-- Step 8: bring role_c_handoffs (already live in Supabase, created ad-hoc)
-- under version control. Safe to run against the existing table — every
-- statement is idempotent/guarded, and the table has zero rows so far.

create table if not exists role_c_handoffs (
  id uuid primary key default gen_random_uuid(),
  external_id text,
  organization_id uuid not null references organizations(id) on delete cascade,
  workforce_plan_id uuid not null references workforce_plans(id) on delete cascade,
  idempotency_key text not null,
  payload jsonb not null,
  status text not null default 'ready',
  consumed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table role_c_handoffs add column if not exists external_id text;
alter table role_c_handoffs add column if not exists consumed_at timestamptz;
alter table role_c_handoffs add column if not exists updated_at timestamptz;

-- external_id is already UNIQUE from the table's original live creation — nothing to add.

-- One handoff row per plan (finalize-handoff upserts against this).
do $$
begin
  alter table role_c_handoffs add constraint role_c_handoffs_workforce_plan_id_key unique (workforce_plan_id);
exception
  when duplicate_object then null;
end $$;

-- Live CHECK (role_c_handoffs_status_check) currently allows only
-- ('pending','ready'). Table has zero rows, so replace outright rather than
-- union the old values in.
alter table role_c_handoffs drop constraint if exists role_c_handoffs_status_check;
alter table role_c_handoffs add constraint role_c_handoffs_status_check check (status in ('ready', 'consumed', 'failed'));

update role_c_handoffs set updated_at = coalesce(updated_at, created_at) where updated_at is null;
alter table role_c_handoffs alter column updated_at set default timezone('utc', now());
alter table role_c_handoffs alter column updated_at set not null;
