-- Add 'scoreboard' to the question_type check constraint
ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_question_type_check;
ALTER TABLE questions ADD CONSTRAINT questions_question_type_check
  CHECK (question_type IN ('situation', 'written', 'compound', 'scoreboard'));
