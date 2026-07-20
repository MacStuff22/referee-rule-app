export type UserRole = 'admin' | 'user'
export type League = 'NHL' | 'AHL' | 'both'
export type QuestionType = 'situation' | 'written' | 'compound' | 'scoreboard'
export type AnswerType = 'multiple_choice' | 'multi_select'
export type SessionLength = 'quick' | 'standard' | 'full'

export interface SubQuestion {
  text: string
  answer_type: 'multiple_choice' | 'multi_select'
  options: string[]
  correct_answers: number[]
  rationale: string
}

export interface Profile {
  id: string
  email: string
  full_name: string
  role: UserRole
  created_at: string
}

export interface Question {
  id: string
  text: string
  answer_type: AnswerType
  options: string[]
  correct_answers: number[]   // indexes into options array (empty for compound)
  rationale: string           // empty for compound — rationale lives on each SubQuestion
  rule_number: string
  rule_references: string[]
  handbook_section: string
  situation_id: string
  league: League
  category: string
  question_type: QuestionType
  sub_questions: SubQuestion[] // populated only when question_type === 'compound'
  is_approved: boolean
  created_by: string
  created_at: string
}

export interface QuizSession {
  id: string
  user_id: string
  session_length: SessionLength
  question_ids: string[]
  current_index: number
  started_at: string
  completed_at: string | null
}

export interface QuizAnswer {
  id: string
  session_id: string
  question_id: string
  selected_answers: number[]
  is_correct: boolean
  answered_at: string
}

export interface CategoryPerformance {
  category: string
  total_answered: number
  total_correct: number
  percentage: number
}

export interface RuleComparison {
  id: string
  rule_number: string
  rule_name: string
  category: string
  nhl_text: string
  ahl_text: string | null
  has_difference: boolean
}
