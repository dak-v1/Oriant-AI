-- Run once in the Supabase SQL Editor for an existing Role A database.
-- The destructive reset script already includes these columns for fresh databases.
begin;

alter table if exists discovery_sessions
  add column if not exists clarification_questions jsonb not null default '[]'::jsonb,
  add column if not exists clarification_answers jsonb not null default '{}'::jsonb,
  add column if not exists clarification_completed_at timestamptz;

commit;
