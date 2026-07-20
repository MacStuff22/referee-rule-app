-- Add optional penalty_table column for situation questions with on-ice strength scenarios
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS penalty_table JSONB NOT NULL DEFAULT '[]';
