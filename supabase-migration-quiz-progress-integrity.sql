-- ============================================================
-- Quiz progress integrity (Finding 6 follow-up to the role
-- escalation fix)
--
-- quiz_sessions, user_category_mastery, and quiz_paths all used a
-- `for all using (auth.uid() = user_id)` policy with no `with check`,
-- the same shape of gap fixed on profiles.role and, earlier, on
-- quiz_answers. Unlike profiles, the row-owner column (user_id) IS
-- what using()/with check reuse verifies, so reassigning a row to
-- someone else was already blocked -- the real gap is that a user
-- could UPDATE *any other column* on their own row, not just the
-- ones the app actually writes.
--
-- quiz_sessions and quiz_paths still need real client-side UPDATE
-- capability (confirmed by reading every call site): quiz_sessions is
-- updated directly from the browser as a user advances through a quiz
-- (current_index, completed_at); quiz_paths is updated server-side
-- when a path finishes or its pace is reflowed (status,
-- questions_per_day, target_end_date). For both, this locks UPDATE
-- down to exactly those columns via Postgres column-level privileges
-- -- narrower than RLS can express on its own -- so a direct client
-- call can no longer rewrite question_ids, session_length, path_id,
-- pool_question_ids, pool_filter, name, or days_per_week on a user's
-- own row.
--
-- user_category_mastery is different: the columns the app legitimately
-- writes (ema_score, total_answered, ...) are exactly the columns
-- someone would want to fabricate to fake their own mastery stats, so
-- a column lock can't distinguish a real value from a faked one. The
-- actual fix is to stop writing this table from the user's own
-- request-scoped client at all -- src/app/api/quiz/answer/route.ts now
-- writes it via a service-role client (src/lib/supabase/admin.ts,
-- same pattern the invite route already used), and RLS is tightened
-- to a read-only policy for regular users, matching the quiz_answers
-- precedent of "no client-side INSERT/UPDATE at all" once the app
-- doesn't need one.
-- ============================================================

-- quiz_sessions: explicit with check + column-locked UPDATE
drop policy if exists "Users can manage own sessions" on public.quiz_sessions;

create policy "Users can manage own sessions"
  on public.quiz_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke update on public.quiz_sessions from authenticated;
grant update (current_index, completed_at) on public.quiz_sessions to authenticated;

-- quiz_paths: explicit with check + column-locked UPDATE
drop policy if exists "Users can manage own paths" on public.quiz_paths;

create policy "Users can manage own paths"
  on public.quiz_paths for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke update on public.quiz_paths from authenticated;
grant update (status, questions_per_day, target_end_date) on public.quiz_paths to authenticated;

-- user_category_mastery: no more client-side writes at all -- read only.
-- Writes now go through src/lib/supabase/admin.ts's service-role client
-- from src/app/api/quiz/answer/route.ts, which bypasses RLS entirely.
drop policy if exists "Users can manage own mastery" on public.user_category_mastery;

create policy "Users can view own mastery"
  on public.user_category_mastery for select
  using (auth.uid() = user_id);
