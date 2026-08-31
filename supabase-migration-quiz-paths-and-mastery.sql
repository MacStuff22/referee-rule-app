-- ============================================================
-- Quiz Paths + adaptive mastery tracking
--
-- Adds:
--   1. user_category_mastery — incrementally-updated recency-weighted
--      mastery score per user+category (replaces the old lifetime-
--      accuracy weighting in /api/quiz/start). Absence of a row for a
--      given (user, category) means "New" — never seed rows.
--   2. quiz_paths — goal-based coverage plans (e.g. "Situation Book in
--      3 months"). pool_question_ids is a snapshot taken at creation so
--      a plan's target doesn't move mid-plan.
--   3. quiz_sessions.path_id — a path's daily quiz is just a normal
--      quiz_sessions row tagged with the path it belongs to; coverage is
--      derived from existing quiz_sessions/quiz_answers rather than a
--      new progress-tracking table.
--
-- Run this entire file in the Supabase SQL Editor after
-- supabase-migration-answer-integrity.sql.
-- ============================================================

-- 1. USER CATEGORY MASTERY
create table public.user_category_mastery (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  category text not null,
  ema_score numeric(5,4) not null default 0.5,
  total_answered integer not null default 0,
  last_answered_at timestamptz,
  refresh_interval_days integer not null default 14,
  updated_at timestamptz default now(),
  unique (user_id, category)
);

alter table public.user_category_mastery enable row level security;

create policy "Users can manage own mastery"
  on public.user_category_mastery for all using (auth.uid() = user_id);

create policy "Admins can view all mastery"
  on public.user_category_mastery for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- 2. QUIZ PATHS
create table public.quiz_paths (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  pool_filter jsonb not null,
  pool_question_ids jsonb not null,
  start_date date not null default current_date,
  target_end_date date not null,
  days_per_week integer not null default 7,
  questions_per_day integer not null,
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  created_at timestamptz default now()
);

alter table public.quiz_paths enable row level security;

create policy "Users can manage own paths"
  on public.quiz_paths for all using (auth.uid() = user_id);

create policy "Admins can view all paths"
  on public.quiz_paths for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- 3. LINK QUIZ SESSIONS TO PATHS
alter table public.quiz_sessions
  add column if not exists path_id uuid references public.quiz_paths(id) on delete set null;

-- Allow a 'path' session alongside the existing fixed-length presets.
alter table public.quiz_sessions
  drop constraint if exists quiz_sessions_session_length_check;

alter table public.quiz_sessions
  add constraint quiz_sessions_session_length_check
  check (session_length in ('quick', 'standard', 'full', 'path'));

-- 4. ADMIN VISIBILITY INTO SESSIONS/ANSWERS FOR ANALYTICS
-- quiz_sessions/quiz_answers had no admin-select policy before this — the
-- admin analytics view instead uses the service-role client (same pattern
-- as src/app/admin/users/page.tsx), so no RLS change is needed here.
