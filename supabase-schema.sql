-- ============================================================
-- Hockey Officials Rule Study App — Database Schema
-- Run this entire file in the Supabase SQL Editor
-- ============================================================

-- 1. PROFILES
-- One row per user. Extends the built-in Supabase auth.users table.
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  full_name text not null default '',
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz default now()
);

-- Automatically create a profile when a new user signs up or accepts an invite
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2. QUESTIONS
create table public.questions (
  id uuid default gen_random_uuid() primary key,
  text text not null,
  answer_type text not null check (answer_type in ('multiple_choice', 'multi_select')),
  options jsonb not null default '[]',          -- array of strings
  correct_answers jsonb not null default '[]',  -- array of indexes into options
  rationale text not null default '',
  rule_number text not null default '',
  league text not null default 'both' check (league in ('NHL', 'AHL', 'both')),
  category text not null default '',
  question_type text not null default 'situation' check (question_type in ('situation', 'written')),
  is_approved boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- 3. QUIZ SESSIONS
create table public.quiz_sessions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  session_length text not null check (session_length in ('quick', 'standard', 'full')),
  question_ids jsonb not null default '[]',   -- ordered list of question ids for this session
  current_index integer not null default 0,
  started_at timestamptz default now(),
  completed_at timestamptz
);

-- 4. QUIZ ANSWERS
create table public.quiz_answers (
  id uuid default gen_random_uuid() primary key,
  session_id uuid references public.quiz_sessions(id) on delete cascade not null,
  question_id uuid references public.questions(id) on delete cascade not null,
  selected_answers jsonb not null default '[]',
  is_correct boolean not null,
  answered_at timestamptz default now()
);

-- 5. RULE COMPARISONS
create table public.rule_comparisons (
  id uuid default gen_random_uuid() primary key,
  rule_number text not null,
  rule_name text not null,
  category text not null default '',
  nhl_text text not null,
  ahl_text text,                -- null means "same as NHL"
  has_difference boolean not null default false,
  created_at timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Controls who can read/write each table
-- ============================================================

alter table public.profiles enable row level security;
alter table public.questions enable row level security;
alter table public.quiz_sessions enable row level security;
alter table public.quiz_answers enable row level security;
alter table public.rule_comparisons enable row level security;

-- PROFILES: users see their own; admins see all
create policy "Users can view own profile"
  on public.profiles for select using (auth.uid() = id);

create policy "Admins can view all profiles"
  on public.profiles for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

-- QUESTIONS: users see approved; admins see all
create policy "Users can view approved questions"
  on public.questions for select
  using (is_approved = true);

create policy "Admins can manage all questions"
  on public.questions for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- QUIZ SESSIONS: users see their own
create policy "Users can manage own sessions"
  on public.quiz_sessions for all using (auth.uid() = user_id);

-- QUIZ ANSWERS: users see their own
create policy "Users can manage own answers"
  on public.quiz_answers for all
  using (exists (
    select 1 from public.quiz_sessions
    where id = quiz_answers.session_id and user_id = auth.uid()
  ));

-- RULE COMPARISONS: all authenticated users can read
create policy "All users can view rule comparisons"
  on public.rule_comparisons for select using (auth.uid() is not null);

create policy "Admins can manage rule comparisons"
  on public.rule_comparisons for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- ============================================================
-- MAKE YOURSELF ADMIN
-- Run this AFTER you create your own account.
-- Replace the email with yours.
-- ============================================================

-- update public.profiles set role = 'admin' where email = 'morgan.macphee11@gmail.com';
