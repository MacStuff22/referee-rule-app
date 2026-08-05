// ============================================================
// Answer correctness — the single source of truth for scoring.
//
// Used both server-side (src/app/api/quiz/answer/route.ts, the authority
// for the real quiz) and client-side (Test Quiz, which never persists
// anything so has nothing to verify server-side). Client-side instant
// feedback and server-side verification call the exact same functions, so
// they can never silently disagree.
//
// Logic here is moved verbatim from where it used to live inline in
// QuizRunner (standard/compound) and ScoreboardSimulator (scoreboard) —
// not reimplemented.
// ============================================================

import { decodeCompoundAnswer, decodeScoreboardAnswer } from '@/lib/quiz/answers'
import { parseScoreboardConfig } from '@/types/scoreboard'
import type { Question } from '@/types'

function sortedEqual(a: number[], b: number[]): boolean {
  return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())
}

export function scoreStandardAnswer(question: Question, selectedAnswers: unknown): boolean {
  const selected = Array.isArray(selectedAnswers) ? (selectedAnswers as number[]) : []
  return sortedEqual(selected, question.correct_answers)
}

export function scoreCompoundAnswer(question: Question, rawSelectedAnswers: unknown): boolean {
  const subAnswers = decodeCompoundAnswer(rawSelectedAnswers)
  const subQs = question.sub_questions ?? []
  return subQs.every((sq, idx) => sortedEqual(subAnswers[idx] ?? [], sq.correct_answers))
}

export function scoreScoreboardAnswer(question: Question, rawSelectedAnswers: unknown): boolean {
  const config = parseScoreboardConfig(question.sub_questions?.[0])
  if (!config) return false
  const active = config.player_answers.filter((a) => !a.already_expired)
  const entries = decodeScoreboardAnswer(rawSelectedAnswers)
  return active.every((a, i) => {
    const entry = entries[i]
    if (!entry) return false
    if (a.wash_out) return entry.washOut
    if (entry.washOut) return false
    return entry.secs !== null && entry.secs === a.correct_secs
  })
}

/** Dispatches to the right scorer for the question's type. */
export function scoreAnswer(question: Question, selectedAnswers: unknown): boolean {
  if (question.question_type === 'compound') return scoreCompoundAnswer(question, selectedAnswers)
  if (question.question_type === 'scoreboard') return scoreScoreboardAnswer(question, selectedAnswers)
  return scoreStandardAnswer(question, selectedAnswers)
}
