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
  updated_at timestamptz not null default timezone('utc', now())
);

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
  blueprint_version integer not null,
  idempotency_key text not null,
  occurred_at timestamptz not null,
  status text not null,
  payload jsonb not null,
  created_at timestamptz not null
);

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

create index if not exists idx_audit_logs_session
  on audit_logs (session_id, created_at desc);

create index if not exists idx_system_events_session
  on system_events (session_id, created_at desc);
