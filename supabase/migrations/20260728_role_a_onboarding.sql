create extension if not exists pgcrypto;

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  external_key text not null unique,
  name text not null,
  approval_owner text,
  shape text not null default 'solo',
  employee_count integer,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists onboarding_sessions (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  organization_id uuid not null references organizations(id) on delete cascade,
  preferred_channel text not null default 'typed',
  status text not null default 'not_started',
  current_step text not null default 'welcome',
  progress integer not null default 0,
  consent_accepted boolean not null default false,
  transcript_review_required boolean not null default false,
  schema_version text not null,
  blueprint_version integer,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  completed_at timestamptz
);

create table if not exists onboarding_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references onboarding_sessions(id) on delete cascade,
  question_id text not null,
  field_path text not null,
  value jsonb not null,
  source text not null,
  confirmed boolean not null default true,
  confidence double precision not null default 1,
  updated_at timestamptz not null,
  unique (session_id, question_id)
);

create table if not exists voice_sessions (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  session_id uuid not null references onboarding_sessions(id) on delete cascade,
  provider text not null,
  language text not null default 'en',
  started_at timestamptz not null,
  last_turn_at timestamptz not null
);

create table if not exists voice_turns (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  voice_session_id uuid not null references voice_sessions(id) on delete cascade,
  question_id text not null,
  transcript text not null,
  confirmed_answer text,
  status text not null,
  created_at timestamptz not null
);

create table if not exists discovery_sessions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references onboarding_sessions(id) on delete cascade,
  goals jsonb not null default '{}'::jsonb,
  systems jsonb not null default '{}'::jsonb,
  canvas_uploaded boolean not null default false,
  completed_at timestamptz,
  clarification_questions jsonb not null default '[]'::jsonb,
  clarification_answers jsonb not null default '{}'::jsonb,
  clarification_completed_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table discovery_sessions add column if not exists clarification_questions jsonb not null default '[]'::jsonb;
alter table discovery_sessions add column if not exists clarification_answers jsonb not null default '{}'::jsonb;
alter table discovery_sessions add column if not exists clarification_completed_at timestamptz;

create table if not exists discovery_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references onboarding_sessions(id) on delete cascade,
  question_id text not null,
  answer text not null,
  confirmed_at timestamptz,
  updated_at timestamptz not null,
  unique (session_id, question_id)
);

create table if not exists business_blueprint_versions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references onboarding_sessions(id) on delete cascade,
  version integer not null,
  status text not null,
  blueprint jsonb not null,
  approved_at timestamptz,
  created_at timestamptz not null,
  unique (session_id, version)
);

create table if not exists company_reports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references onboarding_sessions(id) on delete cascade,
  version integer not null,
  status text not null,
  approved_by text,
  approved_at timestamptz,
  report jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (session_id, version)
);

create table if not exists role_b_handoffs (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  session_id uuid not null references onboarding_sessions(id) on delete cascade,
  handoff_type text not null default 'discovery_findings',
  report_version integer,
  blueprint_version integer,
  idempotency_key text not null,
  occurred_at timestamptz not null,
  status text not null default 'ready'
    check (status in ('ready', 'consumed', 'failed')),
  payload jsonb not null,
  payload_hash text,
  consumed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (session_id, handoff_type, report_version)
);

-- Upgrade the original Role A handoff table in-place on deployed databases.
alter table role_b_handoffs add column if not exists handoff_type text;
alter table role_b_handoffs add column if not exists report_version integer;
alter table role_b_handoffs add column if not exists payload_hash text;
alter table role_b_handoffs add column if not exists consumed_at timestamptz;
alter table role_b_handoffs add column if not exists updated_at timestamptz;
alter table role_b_handoffs alter column blueprint_version drop not null;
alter table role_b_handoffs alter column handoff_type set default 'discovery_findings';
alter table role_b_handoffs alter column updated_at set default timezone('utc', now());
update role_b_handoffs
set handoff_type = coalesce(handoff_type, 'legacy_blueprint'),
    updated_at = coalesce(updated_at, created_at)
where handoff_type is null or updated_at is null;
alter table role_b_handoffs alter column handoff_type set not null;
alter table role_b_handoffs alter column updated_at set not null;

-- The original prototype used Overtone Coffee. Preserve its rows while
-- moving the active demo organization to the current BrightPath identity.
update organizations
set name = 'BrightPath Home Services',
    external_key = 'mock:brightpath home services:nadia o.',
    updated_at = timezone('utc', now())
where external_key = 'mock:overtone coffee:nadia o.';

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  organization_id uuid not null references organizations(id) on delete cascade,
  session_id uuid references onboarding_sessions(id) on delete cascade,
  action text not null,
  subject text not null,
  detail text,
  created_at timestamptz not null
);

create table if not exists system_events (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  organization_id uuid not null references organizations(id) on delete cascade,
  session_id uuid references onboarding_sessions(id) on delete cascade,
  scope text not null,
  event text not null,
  status text not null,
  detail text,
  question_id text,
  created_at timestamptz not null
);

-- Keep deployed databases compatible with the application step values. This
-- also repairs older installs whose CHECK constraint only allowed welcome.
do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select conname
    from pg_constraint
    where conrelid = 'onboarding_sessions'::regclass
      and pg_get_constraintdef(oid) ilike '%current_step%'
  loop
    execute format('alter table onboarding_sessions drop constraint %I', constraint_row.conname);
  end loop;
end $$;

alter table onboarding_sessions
  add constraint onboarding_sessions_current_step_check
  check (current_step in ('welcome', 'intro', 'focus', 'tools', 'review'));

do $$
begin
  alter table organizations
    add constraint organizations_shape_check
    check (shape in ('solo', 'owner_with_team', 'multi_role_team', 'manager_led'));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table company_reports
    add constraint company_reports_status_check
    check (status in ('draft', 'approved'));
exception when duplicate_object then null;
end $$;

create index if not exists idx_onboarding_sessions_org_updated
  on onboarding_sessions (organization_id, updated_at desc);

create index if not exists idx_onboarding_answers_session
  on onboarding_answers (session_id);

create index if not exists idx_voice_sessions_session
  on voice_sessions (session_id);

create index if not exists idx_voice_turns_voice_session
  on voice_turns (voice_session_id, created_at desc);

create index if not exists idx_discovery_answers_session
  on discovery_answers (session_id, updated_at desc);

create index if not exists idx_company_reports_session
  on company_reports (session_id, version desc);

create index if not exists idx_role_b_handoffs_session
  on role_b_handoffs (session_id);

create index if not exists idx_role_b_handoffs_ready
  on role_b_handoffs (status, handoff_type, created_at desc);

create index if not exists idx_audit_logs_session
  on audit_logs (session_id, created_at desc);

create index if not exists idx_system_events_session
  on system_events (session_id, created_at desc);
