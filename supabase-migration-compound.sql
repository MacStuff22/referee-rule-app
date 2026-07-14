-- Add sub_questions column for compound question type
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS sub_questions JSONB NOT NULL DEFAULT '[]';

-- Update question_type check constraint to allow 'compound'
-- (Only needed if you have an explicit CHECK constraint — safe to run either way)
ALTER TABLE public.questions
  DROP CONSTRAINT IF EXISTS questions_question_type_check;

ALTER TABLE public.questions
  ADD CONSTRAINT questions_question_type_check
  CHECK (question_type IN ('situation', 'written', 'compound'));
