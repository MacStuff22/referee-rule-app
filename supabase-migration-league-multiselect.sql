-- ============================================================
-- League field -> multi-select (NHL / AHL)
--
-- `league` moves from a single text value ('NHL' | 'AHL' | 'both') to a
-- text[] array, so a question can independently apply to NHL, AHL, or
-- both. Existing 'both' rows become {NHL,AHL}; 'NHL'/'AHL' rows become
-- single-element arrays. cardinality(), not array_length(), enforces
-- "at least one league" — array_length() returns NULL for an empty
-- array, and NULL passes a Postgres CHECK constraint.
--
-- Run this entire file in the Supabase SQL Editor.
-- ============================================================

alter table public.questions drop constraint if exists questions_league_check;
alter table public.questions alter column league drop default;

alter table public.questions
  alter column league type text[]
  using (case when league = 'both' then array['NHL','AHL'] else array[league] end);

alter table public.questions alter column league set default array['NHL','AHL']::text[];
alter table public.questions add constraint questions_league_check
  check (league <@ array['NHL','AHL']::text[] and cardinality(league) > 0);
