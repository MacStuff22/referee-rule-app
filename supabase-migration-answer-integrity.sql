-- ============================================================
-- Answer integrity hardening
--
-- Previously "Users can manage own answers" used `for all` with only a
-- `using` clause, which (in the absence of a `with check`) permits UPDATE
-- and DELETE on a user's own quiz_answers rows, not just INSERT. Since
-- Supabase's security model relies on RLS rather than hiding the API, a
-- user's own auth token is enough to directly PATCH a submitted answer's
-- correctness after the fact via Supabase's REST API, bypassing the app's
-- UI entirely.
--
-- This replaces it with separate SELECT and INSERT policies (no UPDATE/
-- DELETE for regular users -- denied by default), and adds a uniqueness
-- constraint so a session can only ever have one answer row per question,
-- closing a duplicate-row replay path too.
--
-- SAFE TO RUN MORE THAN ONCE. It used to fail on a second run (the unique
-- constraint already existed), which is how the constraint ended up applied
-- while the policies were not. Every statement is now guarded, and the new
-- policies are created BEFORE the old one is dropped so users are never left
-- without access part-way through.
-- ============================================================

drop policy if exists "Users can view own answers" on public.quiz_answers;
create policy "Users can view own answers"
  on public.quiz_answers for select
  using (exists (
    select 1 from public.quiz_sessions
    where id = quiz_answers.session_id and user_id = auth.uid()
  ));

drop policy if exists "Users can insert own answers" on public.quiz_answers;
create policy "Users can insert own answers"
  on public.quiz_answers for insert
  with check (exists (
    select 1 from public.quiz_sessions
    where id = quiz_answers.session_id and user_id = auth.uid()
  ));

-- Last: only now remove the permissive policy the two above replace.
drop policy if exists "Users can manage own answers" on public.quiz_answers;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'quiz_answers_session_question_unique'
      and conrelid = 'public.quiz_answers'::regclass
  ) then
    alter table public.quiz_answers
      add constraint quiz_answers_session_question_unique unique (session_id, question_id);
  end if;
end $$;

notify pgrst, 'reload schema';
