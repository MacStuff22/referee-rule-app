// ============================================================
// Question "mode" — the practical type distinction admins filter/edit by.
//
// Derived from question_type + answer_type (question_type alone doesn't
// distinguish multiple_choice from multi_select for 'situation'/'written'
// rows). This mirrors the Mode derivation in the admin question form
// (src/components/admin/question-form.tsx's initialMode()) — kept here as
// the shared, reusable version for anywhere else that needs it (e.g. the
// Test Quiz question-type filter).
// ============================================================

import type { Question } from '@/types'

export type QuestionMode = 'multiple_choice' | 'multi_select' | 'compound' | 'scoreboard'

export const QUESTION_MODE_LABELS: Record<QuestionMode, string> = {
  multiple_choice: 'Multiple Choice',
  multi_select: 'Multi-Select',
  compound: 'Compound',
  scoreboard: 'Scoreboard',
}

export function getQuestionMode(q: Pick<Question, 'question_type' | 'answer_type'>): QuestionMode {
  if (q.question_type === 'scoreboard') return 'scoreboard'
  if (q.question_type === 'compound') return 'compound'
  return q.answer_type === 'multi_select' ? 'multi_select' : 'multiple_choice'
}
